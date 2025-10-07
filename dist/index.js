"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = exports.httpServer = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = require("crypto");
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const rateLimit_1 = require("./middleware/rateLimit");
const handlers_1 = require("./socket/handlers");
const AgentManager_1 = require("./services/AgentManager");
const PrintQueueManager_1 = require("./services/PrintQueueManager");
const auth_1 = require("./middleware/auth");
const supabase_1 = require("./utils/supabase");
// Create Express app
const app = (0, express_1.default)();
exports.app = app;
const httpServer = (0, http_1.createServer)(app);
exports.httpServer = httpServer;
// Create Socket.IO server
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: config_1.config.cors.origins,
        methods: ['GET', 'POST'],
        credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
});
exports.io = io;
// Middleware
if (config_1.config.security.helmetEnabled) {
    app.use((0, helmet_1.default)());
}
app.use((0, cors_1.default)({
    origin: config_1.config.cors.origins,
    credentials: true,
}));
app.use(express_1.default.json());
app.use(rateLimit_1.httpRateLimiter);
if (config_1.config.security.trustProxy) {
    app.set('trust proxy', 1);
}
// Serve static files from root directory (for generate-token.html)
app.use(express_1.default.static(path_1.default.join(__dirname, '..')));
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
    const stats = PrintQueueManager_1.printQueueManager.getStats();
    const metrics = {
        server: {
            uptime: process.uptime(),
            environment: config_1.config.nodeEnv,
            version: '1.0.0',
        },
        agents: {
            total: AgentManager_1.agentManager.getCount(),
            byRestaurant: AgentManager_1.agentManager.getAgentsByRestaurantGrouped(),
            ready: AgentManager_1.agentManager.getAllAgents().filter(a => a.printerInfo?.status === 'ready').length,
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
    const auth = (0, auth_1.verifyHttpToken)(req.headers.authorization);
    if (!auth) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const status = {
        server: {
            status: 'running',
            uptime: process.uptime(),
            nodeVersion: process.version,
            environment: config_1.config.nodeEnv,
        },
        agents: {
            total: AgentManager_1.agentManager.getCount(),
            byRestaurant: AgentManager_1.agentManager.getAgentsByRestaurantGrouped(),
            list: AgentManager_1.agentManager.getAllAgents().map(agent => ({
                id: agent.id,
                restaurantId: agent.restaurantId,
                status: agent.printerInfo?.status || 'unknown',
                lastSeen: agent.lastSeen,
                version: agent.version,
            })),
        },
        prints: PrintQueueManager_1.printQueueManager.getStats(),
        memory: process.memoryUsage(),
    };
    res.status(200).json(status);
});
// Get agents endpoint (protected)
app.get('/api/agents', (req, res) => {
    const auth = (0, auth_1.verifyHttpToken)(req.headers.authorization);
    if (!auth) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const restaurantId = req.query.restaurantId;
    const agents = restaurantId
        ? AgentManager_1.agentManager.getAgentsByRestaurant(restaurantId)
        : AgentManager_1.agentManager.getAllAgents();
    res.status(200).json({ agents });
});
// Get print history endpoint (protected)
app.get('/api/prints', (req, res) => {
    const auth = (0, auth_1.verifyHttpToken)(req.headers.authorization);
    if (!auth) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const limit = parseInt(req.query.limit) || 50;
    const restaurantId = req.query.restaurantId;
    const commands = restaurantId
        ? PrintQueueManager_1.printQueueManager.getCommandsByRestaurant(restaurantId, limit)
        : PrintQueueManager_1.printQueueManager.getRecentCommands(limit);
    res.status(200).json({ commands });
});
// 🔑 API endpoint для генерации токенов агентов (требуется JWT аутентификация)
app.post('/api/generate-agent-token', async (req, res) => {
    // Проверяем JWT токен пользователя
    const auth = (0, auth_1.verifyHttpToken)(req.headers.authorization);
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
    const randomKey = (0, crypto_1.randomBytes)(16).toString('hex'); // 32 hex символа
    // Формируем токен: agent_<restaurantCode>_<randomKey>
    const agentToken = `agent_${restaurantCode}_${randomKey}`;
    try {
        // 💾 Сохраняем токен в Supabase
        const { data, error } = await supabase_1.supabaseAdmin
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
            logger_1.logger.error('❌ Ошибка сохранения токена в Supabase', {
                error: error.message,
                restaurantCode,
            });
            return res.status(500).json({
                error: 'Ошибка сохранения токена',
                message: error.message
            });
        }
        logger_1.logger.info('🔑 Токен агента сгенерирован и сохранён', {
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
    }
    catch (err) {
        logger_1.logger.error('❌ Неожиданная ошибка при генерации токена', { error: err });
        res.status(500).json({
            error: 'Внутренняя ошибка сервера',
            message: 'Не удалось сгенерировать токен'
        });
    }
});
// 🔑 API endpoint для получения списка токенов ресторана (требуется JWT)
app.get('/api/agent-tokens/:restaurantCode', async (req, res) => {
    const auth = (0, auth_1.verifyHttpToken)(req.headers.authorization);
    if (!auth) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Требуется JWT токен'
        });
    }
    const { restaurantCode } = req.params;
    if (!/^[A-Z0-9]{8}$/.test(restaurantCode)) {
        return res.status(400).json({
            error: 'Неверный формат кода',
            message: 'Код ресторана должен содержать 8 символов'
        });
    }
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('agent_tokens')
            .select('id, token, restaurant_code, is_active, created_at, last_used_at')
            .eq('restaurant_code', restaurantCode)
            .eq('is_active', true)
            .order('created_at', { ascending: false });
        if (error) {
            logger_1.logger.error('❌ Ошибка загрузки токенов', { error: error.message, restaurantCode });
            return res.status(500).json({ error: 'Ошибка загрузки токенов' });
        }
        res.json({ success: true, tokens: data || [] });
    }
    catch (err) {
        logger_1.logger.error('❌ Ошибка получения токенов', { error: err });
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});
// 🔑 API endpoint для деактивации токена (требуется JWT)
app.delete('/api/agent-tokens/:tokenId', async (req, res) => {
    const auth = (0, auth_1.verifyHttpToken)(req.headers.authorization);
    if (!auth) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tokenId } = req.params;
    try {
        const { error } = await supabase_1.supabaseAdmin
            .from('agent_tokens')
            .update({ is_active: false })
            .eq('id', tokenId);
        if (error) {
            logger_1.logger.error('❌ Ошибка деактивации токена', { error: error.message, tokenId });
            return res.status(500).json({ error: 'Ошибка деактивации токена' });
        }
        logger_1.logger.info('🔒 Токен деактивирован', { tokenId, userId: auth.userId });
        res.json({ success: true, message: 'Токен деактивирован' });
    }
    catch (err) {
        logger_1.logger.error('❌ Ошибка деактивации токена', { error: err });
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});
// 🔑 Веб-страница для генерации токенов
app.get('/generate-token', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '..', 'generate-token.html'));
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
app.use((err, req, res, next) => {
    logger_1.logger.error('Express error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
    });
    res.status(500).json({ error: 'Internal server error' });
});
// Socket.IO middleware (optional JWT verification)
io.use((socket, next) => {
    const clientType = socket.handshake.query?.clientType;
    // Агенты с токенами обрабатываются в handlers.ts
    // Веб-клиенты могут подключаться без JWT
    if (clientType !== 'agent') {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
        if (token) {
            try {
                const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
                socket.data.user = decoded;
                logger_1.logger.info('Socket JWT verified', { socketId: socket.id });
            }
            catch (err) {
                // Истекший/невалидный JWT - ничего не делаем, клиент подключится без JWT
            }
        }
    }
    next();
});
// Initialize Socket.IO handlers
(0, handlers_1.initializeSocketHandlers)(io);
// Start server
httpServer.listen(config_1.config.port, config_1.config.host, () => {
    logger_1.logger.info(`🚀 CloudChef Print Server started`, {
        port: config_1.config.port,
        host: config_1.config.host,
        environment: config_1.config.nodeEnv,
        cors: config_1.config.cors.origins,
    });
});
// Graceful shutdown
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM signal received: closing HTTP server');
    httpServer.close(() => {
        logger_1.logger.info('HTTP server closed');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    logger_1.logger.info('SIGINT signal received: closing HTTP server');
    httpServer.close(() => {
        logger_1.logger.info('HTTP server closed');
        process.exit(0);
    });
});
//# sourceMappingURL=index.js.map