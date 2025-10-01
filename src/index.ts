import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { logger } from './utils/logger';
import { httpRateLimiter } from './middleware/rateLimit';
import { initializeSocketHandlers } from './socket/handlers';
import { agentManager } from './services/AgentManager';
import { printQueueManager } from './services/PrintQueueManager';
import { verifyHttpToken } from './middleware/auth';

// Create Express app
const app = express();
const httpServer = createServer(app);

// Create Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: config.cors.origins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

// Middleware
if (config.security.helmetEnabled) {
  app.use(helmet());
}

app.use(cors({
  origin: config.cors.origins,
  credentials: true,
}));

app.use(express.json());
app.use(httpRateLimiter);

if (config.security.trustProxy) {
  app.set('trust proxy', 1);
}

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'cloudchef-print-server',
    version: '1.0.0',
  };
  res.status(200).json(health);
});

// Metrics endpoint (public)
app.get('/metrics', (req, res) => {
  const stats = printQueueManager.getStats();
  const metrics = {
    server: {
      uptime: process.uptime(),
      environment: config.nodeEnv,
      version: '1.0.0',
    },
    agents: {
      total: agentManager.getCount(),
      byRestaurant: agentManager.getAgentsByRestaurantGrouped(),
      ready: agentManager.getAllAgents().filter(a => a.printerInfo?.status === 'ready').length,
    },
    prints: {
      total: stats.total || 0,
      pending: stats.pending || 0,
      printing: stats.printing || 0,
      success: stats.success || 0,
      failed: stats.failed || 0,
    },
    websocket: {
      connections: io.sockets.sockets.size,
    },
    timestamp: new Date().toISOString(),
  };
  res.status(200).json(metrics);
});

// Detailed status endpoint (protected)
app.get('/status', (req, res) => {
  const auth = verifyHttpToken(req.headers.authorization);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const status = {
    server: {
      status: 'running',
      uptime: process.uptime(),
      nodeVersion: process.version,
      environment: config.nodeEnv,
    },
    agents: {
      total: agentManager.getCount(),
      byRestaurant: agentManager.getAgentsByRestaurantGrouped(),
      list: agentManager.getAllAgents().map(agent => ({
        id: agent.id,
        restaurantId: agent.restaurantId,
        status: agent.printerInfo?.status || 'unknown',
        lastSeen: agent.lastSeen,
        version: agent.version,
      })),
    },
    prints: printQueueManager.getStats(),
    memory: process.memoryUsage(),
  };

  res.status(200).json(status);
});

// Get agents endpoint (protected)
app.get('/api/agents', (req, res) => {
  const auth = verifyHttpToken(req.headers.authorization);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const restaurantId = req.query.restaurantId as string;
  const agents = restaurantId
    ? agentManager.getAgentsByRestaurant(restaurantId)
    : agentManager.getAllAgents();

  res.status(200).json({ agents });
});

// Get print history endpoint (protected)
app.get('/api/prints', (req, res) => {
  const auth = verifyHttpToken(req.headers.authorization);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const limit = parseInt(req.query.limit as string) || 50;
  const restaurantId = req.query.restaurantId as string;

  const commands = restaurantId
    ? printQueueManager.getCommandsByRestaurant(restaurantId, limit)
    : printQueueManager.getRecentCommands(limit);

  res.status(200).json({ commands });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'CloudChef Print Server',
    version: '1.0.0',
    status: 'running',
    documentation: 'https://github.com/your-repo/cloudchef-print-server',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Express error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize Socket.IO handlers
initializeSocketHandlers(io);

// Start server
httpServer.listen(config.port, config.host, () => {
  logger.info(`🚀 CloudChef Print Server started`, {
    port: config.port,
    host: config.host,
    environment: config.nodeEnv,
    cors: config.cors.origins,
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export { app, httpServer, io };
