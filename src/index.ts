import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { randomBytes } from 'crypto';
import path from 'path';
import { config } from './config';
import { logger } from './utils/logger';
import { httpRateLimiter } from './middleware/rateLimit';
import { initializeSocketHandlers } from './socket/handlers';
import { agentManager } from './services/AgentManager';
import { printQueueManager } from './services/PrintQueueManager';
import { verifyHttpToken } from './middleware/auth';
import { supabaseAdmin } from './utils/supabase';

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

// Serve static files from root directory (for generate-token.html)
app.use(express.static(path.join(__dirname, '..')));

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

// 🔑 API endpoint для генерации токенов агентов (требуется JWT аутентификация)
app.post('/api/generate-agent-token', async (req, res) => {
  // Проверяем JWT токен пользователя
  const auth = verifyHttpToken(req.headers.authorization);
  if (!auth) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Требуется JWT токен для генерации токена агента' 
    });
  }

  const { restaurantCode } = req.body;
  
  // Валидация кода ресторана
  if (!restaurantCode || typeof restaurantCode !== 'string') {
    return res.status(400).json({ 
      error: 'Не указан код ресторана',
      message: 'Требуется поле restaurantCode' 
    });
  }
  
  // Проверяем формат кода (должен быть 8 символов буквы/цифры)
  if (!/^[A-Z0-9]{8}$/.test(restaurantCode)) {
    return res.status(400).json({ 
      error: 'Неверный формат кода',
      message: 'Код ресторана должен содержать 8 символов (буквы A-Z и цифры 0-9)' 
    });
  }
  
  // Генерируем случайный 32-символьный ключ
  const randomKey = randomBytes(16).toString('hex'); // 32 hex символа
  
  // Формируем токен: agent_<restaurantCode>_<randomKey>
  const agentToken = `agent_${restaurantCode}_${randomKey}`;
  
  try {
    // 💾 Сохраняем токен в Supabase
    const { data, error } = await supabaseAdmin
      .from('agent_tokens')
      .insert({
        token: agentToken,
        restaurant_code: restaurantCode,
        created_by: auth.userId,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      logger.error('❌ Ошибка сохранения токена в Supabase', {
        error: error.message,
        restaurantCode,
      });
      return res.status(500).json({
        error: 'Ошибка сохранения токена',
        message: error.message
      });
    }

    logger.info('🔑 Токен агента сгенерирован и сохранён', {
      restaurantCode,
      tokenPrefix: `agent_${restaurantCode}_...`,
      tokenId: data.id,
      userId: auth.userId,
      generatedAt: new Date().toISOString()
    });
    
    res.json({
      success: true,
      agentToken,
      restaurantCode,
      generatedAt: data.created_at,
      expiresAt: null, // Токены не истекают (можно добавить позже)
      message: 'Токен успешно сгенерирован и сохранён'
    });
  } catch (err) {
    logger.error('❌ Неожиданная ошибка при генерации токена', { error: err });
    res.status(500).json({
      error: 'Внутренняя ошибка сервера',
      message: 'Не удалось сгенерировать токен'
    });
  }
});

// 🔑 Веб-страница для генерации токенов
app.get('/generate-token', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'generate-token.html'));
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
