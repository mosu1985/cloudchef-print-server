"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSocketHandlers = initializeSocketHandlers;
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
const AgentManager_1 = require("../services/AgentManager");
const PrintQueueManager_1 = require("../services/PrintQueueManager");
const rateLimit_1 = require("../middleware/rateLimit");
const auth_1 = require("../middleware/auth");
/**
 * Initialize Socket.IO handlers
 */
function initializeSocketHandlers(io) {
    io.on('connection', async (socket) => {
        logger_1.logger.info('New socket connection', {
            socketId: socket.id,
            ip: socket.handshake.address,
        });
        // Check if this is an agent connection (has agent token in auth)
        const agentToken = socket.handshake.auth?.token;
        const clientType = socket.handshake.query?.clientType;
        // 🔐 Проверка токена агента (если это агент)
        if (clientType === 'agent' && agentToken) {
            logger_1.logger.info('🔍 Обнаружен агент с токеном, проверяем...', {
                socketId: socket.id,
                tokenPrefix: agentToken.substring(0, 20) + '...',
            });
            const verification = await (0, auth_1.verifyAgentToken)(agentToken);
            if (!verification.valid) {
                logger_1.logger.error('❌ Агент отклонён: невалидный токен', {
                    socketId: socket.id,
                    error: verification.error,
                });
                socket.emit('authentication_error', {
                    message: verification.error || 'Токен агента недействителен',
                    code: 'INVALID_AGENT_TOKEN',
                });
                socket.disconnect(true);
                return;
            }
            logger_1.logger.info('✅ Токен агента валиден, агент авторизован', {
                socketId: socket.id,
                restaurantCode: verification.restaurantCode,
                tokenId: verification.tokenId,
            });
            // Сохраняем информацию о верификации агента
            socket.data.agentTokenVerified = true;
            socket.data.verifiedRestaurantCode = verification.restaurantCode;
            socket.data.tokenId = verification.tokenId;
        }
        // Optional: Verify JWT authentication (for web clients)
        // НЕ проверяем JWT для агентов - они уже верифицированы через токен агента
        let authPayload = null;
        if (clientType !== 'agent' || !socket.data.agentTokenVerified) {
            authPayload = (0, auth_1.verifySocketToken)(socket);
            if (authPayload) {
                logger_1.logger.info('Socket authenticated with JWT', {
                    socketId: socket.id,
                    userId: authPayload.userId
                });
            }
            else if (clientType !== 'agent') {
                logger_1.logger.info('Socket connection without JWT (will authenticate via pairing code)', {
                    socketId: socket.id
                });
            }
        }
        // Handle Print Agent registration (legacy format with pairing code)
        socket.on('register_agent', (data, callback) => {
            try {
                // 🔐 Если агент верифицирован через токен, используем код из токена
                const restaurantCode = socket.data.verifiedRestaurantCode || data.code;
                // 🔒 Проверяем, что код из запроса совпадает с кодом из токена (если токен был проверен)
                if (socket.data.agentTokenVerified && data.code !== socket.data.verifiedRestaurantCode) {
                    logger_1.logger.error('❌ Код ресторана не совпадает с токеном', {
                        socketId: socket.id,
                        providedCode: data.code,
                        tokenCode: socket.data.verifiedRestaurantCode,
                    });
                    socket.emit('registration_error', {
                        message: 'Код ресторана не совпадает с токеном агента',
                    });
                    if (callback) {
                        callback({ success: false, error: 'Код ресторана не совпадает с токеном' });
                    }
                    return;
                }
                // 🔒 Проверяем, не зарегистрирован ли уже этот сокет
                if (socket.data.agentId) {
                    logger_1.logger.info('⚠️ Агент уже зарегистрирован, пропускаем повторную регистрацию', {
                        socketId: socket.id,
                        existingAgentId: socket.data.agentId,
                        code: restaurantCode,
                    });
                    socket.emit('agent_registered', {
                        success: true,
                        agentId: socket.data.agentId,
                        restaurantId: socket.data.restaurantId,
                        code: socket.data.code,
                    });
                    if (callback) {
                        callback({
                            success: true,
                            agentId: socket.data.agentId,
                            restaurantId: socket.data.restaurantId,
                            code: socket.data.code
                        });
                    }
                    return;
                }
                logger_1.logger.info('Print Agent registration', {
                    socketId: socket.id,
                    code: restaurantCode,
                    tokenVerified: socket.data.agentTokenVerified || false,
                });
                const agentId = (0, uuid_1.v4)();
                // Use pairing code as restaurantId for now (codes are unique)
                const restaurantId = restaurantCode;
                const code = restaurantCode; // ✅ ДОБАВЛЕНО: Сохраняем pairing code
                const agent = AgentManager_1.agentManager.register(agentId, socket.id, restaurantId, null, code, // ✅ ДОБАВЛЕНО: Передаем code в AgentManager
                data.printerInfo || null, 'unknown', socket.handshake.address);
                socket.data.agentId = agentId;
                socket.data.role = 'agent';
                socket.data.restaurantId = restaurantId;
                socket.data.code = code; // ✅ ДОБАВЛЕНО: Сохраняем code в socket.data
                // Join restaurant room
                socket.join(`restaurant:${restaurantId}`);
                socket.emit('agent_registered', {
                    success: true,
                    agentId,
                    restaurantId,
                    code, // ✅ ДОБАВЛЕНО: Отправляем code в ответе
                });
                logger_1.logger.info('Print Agent registered successfully', {
                    socketId: socket.id,
                    agentId,
                    restaurantId,
                    code, // ✅ ДОБАВЛЕНО: Логируем code
                });
                // 🔔 Notify all clients in restaurant room about new agent
                const roomAgents = AgentManager_1.agentManager.getAgentsByRestaurant(restaurantId);
                logger_1.logger.info('📡 Broadcasting agents-updated event', {
                    restaurantId,
                    roomName: `restaurant:${restaurantId}`,
                    agentsCount: roomAgents.length,
                    agentIds: roomAgents.map(a => a.id),
                });
                io.to(`restaurant:${restaurantId}`).emit('agents-updated', {
                    agents: roomAgents,
                });
                // Также отправляем глобальное событие connected-agents для мониторинга
                io.emit('connected-agents', roomAgents);
                if (callback) {
                    callback({ success: true, agentId, restaurantId, code }); // ✅ ДОБАВЛЕНО: code в callback
                }
            }
            catch (error) {
                logger_1.logger.error('Print Agent registration error', {
                    socketId: socket.id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
                socket.emit('registration_error', {
                    message: error instanceof Error ? error.message : 'Registration failed',
                });
                if (callback) {
                    callback({ success: false, error: 'Registration failed' });
                }
            }
        });
        // Handle client registration
        socket.on('register', (data, callback) => {
            try {
                logger_1.logger.info('Client registration', { socketId: socket.id, data });
                if (data.role === 'agent') {
                    // Register Print Agent
                    const agentId = (0, uuid_1.v4)();
                    const code = data.restaurantId || 'unknown'; // ✅ ДОБАВЛЕНО: используем restaurantId как code
                    const agent = AgentManager_1.agentManager.register(agentId, socket.id, data.restaurantId || null, authPayload?.userId || null, code, // ✅ ИСПРАВЛЕНО: добавлен параметр code
                    data.printerInfo || null, data.version || 'unknown', socket.handshake.address);
                    socket.data.agentId = agentId;
                    socket.data.role = 'agent';
                    socket.data.restaurantId = data.restaurantId;
                    // Join restaurant room
                    if (data.restaurantId) {
                        socket.join(`restaurant:${data.restaurantId}`);
                    }
                    // Notify all clients about new agent
                    io.emit('agents-updated', {
                        agents: AgentManager_1.agentManager.getAllAgents(),
                    });
                    if (callback) {
                        callback({
                            success: true,
                            agentId,
                            message: 'Agent registered successfully',
                        });
                    }
                }
                else {
                    // Register Web Client
                    socket.data.role = data.role || 'web-client';
                    socket.data.userId = authPayload?.userId;
                    socket.data.restaurantId = data.restaurantId || authPayload?.restaurantId;
                    // Join restaurant room
                    if (socket.data.restaurantId) {
                        socket.join(`restaurant:${socket.data.restaurantId}`);
                    }
                    // Send current agents list
                    const agents = socket.data.restaurantId
                        ? AgentManager_1.agentManager.getAgentsByRestaurant(socket.data.restaurantId)
                        : AgentManager_1.agentManager.getAllAgents();
                    socket.emit('agents-updated', { agents });
                    if (callback) {
                        callback({
                            success: true,
                            message: 'Client registered successfully',
                        });
                    }
                }
            }
            catch (error) {
                logger_1.logger.error('Registration error', {
                    socketId: socket.id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
                if (callback) {
                    callback({
                        success: false,
                        error: 'Registration failed',
                    });
                }
            }
        });
        // Handle print request
        socket.on('print-label', async (data, callback) => {
            try {
                // Rate limiting
                if (!rateLimit_1.socketRateLimiter.check(socket.id)) {
                    const response = {
                        success: false,
                        error: 'Rate limit exceeded. Please slow down.',
                    };
                    if (callback)
                        callback(response);
                    return;
                }
                logger_1.logger.info('Print request received', {
                    socketId: socket.id,
                    userId: socket.data.userId,
                    restaurantId: socket.data.restaurantId || data.restaurantId,
                    targetAgentId: data.targetAgentId,
                });
                const restaurantId = data.restaurantId || socket.data.restaurantId;
                if (!restaurantId) {
                    const response = {
                        success: false,
                        error: 'Restaurant ID is required',
                    };
                    if (callback)
                        callback(response);
                    return;
                }
                // Find target agent
                let targetAgent;
                if (data.targetAgentId) {
                    targetAgent = AgentManager_1.agentManager.getAgent(data.targetAgentId);
                    if (!targetAgent) {
                        const response = {
                            success: false,
                            error: 'Target agent not found or offline',
                        };
                        if (callback)
                            callback(response);
                        return;
                    }
                }
                else {
                    // Find any online agent for this restaurant
                    const agents = AgentManager_1.agentManager.getAgentsByRestaurant(restaurantId);
                    targetAgent = agents.find((a) => a.printerInfo?.status === 'ready') || agents[0];
                    if (!targetAgent) {
                        const response = {
                            success: false,
                            error: 'No online agents found for this restaurant',
                        };
                        if (callback)
                            callback(response);
                        return;
                    }
                }
                // Create print command
                const commandId = (0, uuid_1.v4)();
                const command = PrintQueueManager_1.printQueueManager.createCommand(commandId, restaurantId, socket.data.userId || authPayload?.userId || 'unknown', targetAgent.id, data.labelData);
                // Send print command to agent
                io.to(targetAgent.socketId).emit('print-command', {
                    commandId,
                    labelData: data.labelData,
                });
                // Update command status
                PrintQueueManager_1.printQueueManager.updateStatus(commandId, 'printing');
                // Send success response
                const response = {
                    success: true,
                    commandId,
                    message: 'Print command sent to agent',
                };
                if (callback)
                    callback(response);
                logger_1.logger.info('Print command sent to agent', {
                    commandId,
                    agentId: targetAgent.id,
                    restaurantId,
                });
            }
            catch (error) {
                logger_1.logger.error('Print request error', {
                    socketId: socket.id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
                const response = {
                    success: false,
                    error: 'Print request failed',
                };
                if (callback)
                    callback(response);
            }
        });
        // Handle print result from agent
        socket.on('print-result', (data) => {
            logger_1.logger.info('Print result received', {
                socketId: socket.id,
                commandId: data.commandId,
                success: data.success,
            });
            if (data.success) {
                PrintQueueManager_1.printQueueManager.updateStatus(data.commandId, 'success');
            }
            else {
                PrintQueueManager_1.printQueueManager.updateStatus(data.commandId, 'failed', data.error);
            }
            // Notify relevant clients
            const command = PrintQueueManager_1.printQueueManager.getCommand(data.commandId);
            if (command) {
                io.to(`restaurant:${command.restaurantId}`).emit('print-completed', {
                    commandId: data.commandId,
                    success: data.success,
                    error: data.error,
                });
            }
        });
        // Handle agent status update
        socket.on('agent-status', (data) => {
            const agentId = socket.data.agentId;
            if (agentId) {
                AgentManager_1.agentManager.updatePrinterInfo(agentId, data.printerInfo);
                // Notify all clients
                io.emit('agents-updated', {
                    agents: AgentManager_1.agentManager.getAllAgents(),
                });
            }
        });
        // Handle heartbeat (web clients)
        socket.on('heartbeat', () => {
            const agentId = socket.data.agentId;
            if (agentId) {
                AgentManager_1.agentManager.updateLastSeen(agentId);
            }
            socket.emit('heartbeat-ack');
        });
        // Handle agent_heartbeat (Print Agents)
        socket.on('agent_heartbeat', (data) => {
            const agentId = socket.data.agentId;
            if (agentId) {
                AgentManager_1.agentManager.updateLastSeen(agentId);
                logger_1.logger.debug('Agent heartbeat received', { agentId, ...data });
            }
        });
        // 🖨️ Handle print_command from web clients
        socket.on('print_command', (data) => {
            try {
                logger_1.logger.info('Print command received from web client', {
                    socketId: socket.id,
                    code: data.code,
                    userInfo: data.userInfo
                });
                // Пересылаем команду всем агентам в комнате ресторана
                const roomName = `restaurant:${data.code}`;
                const printJobData = {
                    jobId: `job-${Date.now()}`,
                    labelData: data.labelData,
                    timestamp: Date.now()
                };
                io.to(roomName).emit('print_job', printJobData); // ✅ Изменено на 'print_job'
                logger_1.logger.info('Print command forwarded to agents', {
                    room: roomName,
                    jobId: printJobData.jobId,
                    agentsInRoom: AgentManager_1.agentManager.getAgentsByRestaurant(data.code).length
                });
                // Подтверждаем отправку клиенту
                socket.emit('print_sent', { success: true, code: data.code });
            }
            catch (error) {
                logger_1.logger.error('Error handling print command', {
                    socketId: socket.id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
                socket.emit('print_error', {
                    success: false,
                    error: error instanceof Error ? error.message : 'Print command failed'
                });
            }
        });
        // Handle get agents request
        socket.on('get-agents', (callback) => {
            const agents = socket.data.restaurantId
                ? AgentManager_1.agentManager.getAgentsByRestaurant(socket.data.restaurantId)
                : AgentManager_1.agentManager.getAllAgents();
            if (callback) {
                callback({ agents });
            }
            else {
                socket.emit('agents-updated', { agents });
            }
        });
        // Legacy support: get_connected_agents (веб-приложение)
        socket.on('get_connected_agents', (callback) => {
            const allAgents = AgentManager_1.agentManager.getAllAgents();
            logger_1.logger.info('get_connected_agents request', {
                socketId: socket.id,
                agentsCount: allAgents.length
            });
            socket.emit('connected-agents', allAgents);
            if (callback) {
                callback({ agents: allAgents });
            }
        });
        // Get agents in specific room (by pairing code)
        socket.on('get_agents_in_room', (roomCode, callback) => {
            const agents = AgentManager_1.agentManager.getAgentsByRestaurant(roomCode);
            logger_1.logger.info('get_agents_in_room request', {
                socketId: socket.id,
                roomCode,
                agentsCount: agents.length
            });
            socket.emit('room-agents', agents);
            if (callback) {
                callback({ agents });
            }
        });
        // Join room (by pairing code)
        socket.on('join_room', (roomCode) => {
            logger_1.logger.info('Client joining room', { socketId: socket.id, roomCode });
            socket.join(`restaurant:${roomCode}`);
            socket.data.restaurantId = roomCode;
        });
        // Handle get stats request
        socket.on('get-stats', (callback) => {
            const stats = {
                connectedAgents: AgentManager_1.agentManager.getCount(),
                restaurantAgents: AgentManager_1.agentManager.getAgentsByRestaurantGrouped(),
                printStats: PrintQueueManager_1.printQueueManager.getStats(),
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
            };
            if (callback) {
                callback(stats);
            }
            else {
                socket.emit('stats', stats);
            }
        });
        // Handle disconnect
        socket.on('disconnect', () => {
            logger_1.logger.info('Socket disconnected', {
                socketId: socket.id,
                role: socket.data.role,
                agentId: socket.data.agentId,
            });
            // Cleanup rate limiter
            rateLimit_1.socketRateLimiter.remove(socket.id);
            // Unregister agent if applicable
            if (socket.data.role === 'agent' && socket.data.restaurantId) {
                AgentManager_1.agentManager.unregisterBySocketId(socket.id);
                // 🔔 Notify clients in restaurant room about agent removal
                const roomAgents = AgentManager_1.agentManager.getAgentsByRestaurant(socket.data.restaurantId);
                io.to(`restaurant:${socket.data.restaurantId}`).emit('agents-updated', {
                    agents: roomAgents,
                });
            }
        });
    });
    // Periodic cleanup
    setInterval(() => {
        AgentManager_1.agentManager.cleanup();
    }, 60000); // Every minute
}
//# sourceMappingURL=handlers.js.map