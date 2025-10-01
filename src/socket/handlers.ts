import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { agentManager } from '../services/AgentManager';
import { printQueueManager } from '../services/PrintQueueManager';
import { socketRateLimiter } from '../middleware/rateLimit';
import { verifySocketToken } from '../middleware/auth';
import { ClientRegistration, PrintRequest, PrintResponse } from '../types';

/**
 * Initialize Socket.IO handlers
 */
export function initializeSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    logger.info('New socket connection', {
      socketId: socket.id,
      ip: socket.handshake.address,
    });

    // Optional: Verify JWT authentication (for web clients)
    // Agents use pairing code authentication instead
    const authPayload = verifySocketToken(socket);
    if (authPayload) {
      logger.info('Socket authenticated with JWT', { 
        socketId: socket.id,
        userId: authPayload.userId 
      });
    } else {
      logger.info('Socket connection without JWT (will authenticate via pairing code)', { 
        socketId: socket.id 
      });
    }

    // Handle Print Agent registration (legacy format with pairing code)
    socket.on('register_agent', (data: { code: string; printerInfo?: any }, callback?: (response: any) => void) => {
      try {
        logger.info('Print Agent registration with pairing code', { socketId: socket.id, code: data.code });

        const agentId = uuidv4();
        // Use pairing code as restaurantId for now (codes are unique)
        const restaurantId = data.code;
        const code = data.code;  // ✅ ДОБАВЛЕНО: Сохраняем pairing code
        
        const agent = agentManager.register(
          agentId,
          socket.id,
          restaurantId,
          null,
          code,  // ✅ ДОБАВЛЕНО: Передаем code в AgentManager
          data.printerInfo || null,
          'unknown',
          socket.handshake.address
        );

        socket.data.agentId = agentId;
        socket.data.role = 'agent';
        socket.data.restaurantId = restaurantId;
        socket.data.code = code;  // ✅ ДОБАВЛЕНО: Сохраняем code в socket.data

        // Join restaurant room
        socket.join(`restaurant:${restaurantId}`);

        socket.emit('agent_registered', {
          success: true,
          agentId,
          restaurantId,
          code,  // ✅ ДОБАВЛЕНО: Отправляем code в ответе
        });

        logger.info('Print Agent registered successfully', {
          socketId: socket.id,
          agentId,
          restaurantId,
          code,  // ✅ ДОБАВЛЕНО: Логируем code
        });

        // 🔔 Notify all clients in restaurant room about new agent
        const roomAgents = agentManager.getAgentsByRestaurant(restaurantId);
        io.to(`restaurant:${restaurantId}`).emit('agents-updated', {
          agents: roomAgents,
        });

        if (callback) {
          callback({ success: true, agentId, restaurantId, code });  // ✅ ДОБАВЛЕНО: code в callback
        }
      } catch (error) {
        logger.error('Print Agent registration error', {
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
    socket.on('register', (data: ClientRegistration, callback?: (response: any) => void) => {
      try {
        logger.info('Client registration', { socketId: socket.id, data });

        if (data.role === 'agent') {
          // Register Print Agent
          const agentId = uuidv4();
          const code = data.restaurantId || 'unknown';  // ✅ ДОБАВЛЕНО: используем restaurantId как code
          const agent = agentManager.register(
            agentId,
            socket.id,
            data.restaurantId || null,
            authPayload?.userId || null,
            code,  // ✅ ИСПРАВЛЕНО: добавлен параметр code
            data.printerInfo || null,
            data.version || 'unknown',
            socket.handshake.address
          );

          socket.data.agentId = agentId;
          socket.data.role = 'agent';
          socket.data.restaurantId = data.restaurantId;

          // Join restaurant room
          if (data.restaurantId) {
            socket.join(`restaurant:${data.restaurantId}`);
          }

          // Notify all clients about new agent
          io.emit('agents-updated', {
            agents: agentManager.getAllAgents(),
          });

          if (callback) {
            callback({
              success: true,
              agentId,
              message: 'Agent registered successfully',
            });
          }
        } else {
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
            ? agentManager.getAgentsByRestaurant(socket.data.restaurantId)
            : agentManager.getAllAgents();

          socket.emit('agents-updated', { agents });

          if (callback) {
            callback({
              success: true,
              message: 'Client registered successfully',
            });
          }
        }
      } catch (error) {
        logger.error('Registration error', {
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
    socket.on('print-label', async (data: PrintRequest, callback?: (response: PrintResponse) => void) => {
      try {
        // Rate limiting
        if (!socketRateLimiter.check(socket.id)) {
          const response: PrintResponse = {
            success: false,
            error: 'Rate limit exceeded. Please slow down.',
          };
          if (callback) callback(response);
          return;
        }

        logger.info('Print request received', {
          socketId: socket.id,
          userId: socket.data.userId,
          restaurantId: socket.data.restaurantId || data.restaurantId,
          targetAgentId: data.targetAgentId,
        });

        const restaurantId = data.restaurantId || socket.data.restaurantId;
        if (!restaurantId) {
          const response: PrintResponse = {
            success: false,
            error: 'Restaurant ID is required',
          };
          if (callback) callback(response);
          return;
        }

        // Find target agent
        let targetAgent;
        if (data.targetAgentId) {
          targetAgent = agentManager.getAgent(data.targetAgentId);
          if (!targetAgent) {
            const response: PrintResponse = {
              success: false,
              error: 'Target agent not found or offline',
            };
            if (callback) callback(response);
            return;
          }
        } else {
          // Find any online agent for this restaurant
          const agents = agentManager.getAgentsByRestaurant(restaurantId);
          targetAgent = agents.find((a) => a.printerInfo?.status === 'ready') || agents[0];

          if (!targetAgent) {
            const response: PrintResponse = {
              success: false,
              error: 'No online agents found for this restaurant',
            };
            if (callback) callback(response);
            return;
          }
        }

        // Create print command
        const commandId = uuidv4();
        const command = printQueueManager.createCommand(
          commandId,
          restaurantId,
          socket.data.userId || authPayload?.userId || 'unknown',
          targetAgent.id,
          data.labelData
        );

        // Send print command to agent
        io.to(targetAgent.socketId).emit('print-command', {
          commandId,
          labelData: data.labelData,
        });

        // Update command status
        printQueueManager.updateStatus(commandId, 'printing');

        // Send success response
        const response: PrintResponse = {
          success: true,
          commandId,
          message: 'Print command sent to agent',
        };
        if (callback) callback(response);

        logger.info('Print command sent to agent', {
          commandId,
          agentId: targetAgent.id,
          restaurantId,
        });
      } catch (error) {
        logger.error('Print request error', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        const response: PrintResponse = {
          success: false,
          error: 'Print request failed',
        };
        if (callback) callback(response);
      }
    });

    // Handle print result from agent
    socket.on('print-result', (data: { commandId: string; success: boolean; error?: string }) => {
      logger.info('Print result received', {
        socketId: socket.id,
        commandId: data.commandId,
        success: data.success,
      });

      if (data.success) {
        printQueueManager.updateStatus(data.commandId, 'success');
      } else {
        printQueueManager.updateStatus(data.commandId, 'failed', data.error);
      }

      // Notify relevant clients
      const command = printQueueManager.getCommand(data.commandId);
      if (command) {
        io.to(`restaurant:${command.restaurantId}`).emit('print-completed', {
          commandId: data.commandId,
          success: data.success,
          error: data.error,
        });
      }
    });

    // Handle agent status update
    socket.on('agent-status', (data: { printerInfo: any }) => {
      const agentId = socket.data.agentId;
      if (agentId) {
        agentManager.updatePrinterInfo(agentId, data.printerInfo);
        
        // Notify all clients
        io.emit('agents-updated', {
          agents: agentManager.getAllAgents(),
        });
      }
    });

    // Handle heartbeat (web clients)
    socket.on('heartbeat', () => {
      const agentId = socket.data.agentId;
      if (agentId) {
        agentManager.updateLastSeen(agentId);
      }
      socket.emit('heartbeat-ack');
    });

    // Handle agent_heartbeat (Print Agents)
    socket.on('agent_heartbeat', (data: { status?: string; timestamp?: number; printerStatus?: string }) => {
      const agentId = socket.data.agentId;
      if (agentId) {
        agentManager.updateLastSeen(agentId);
        logger.debug('Agent heartbeat received', { agentId, ...data });
      }
    });

    // 🖨️ Handle print_command from web clients
    socket.on('print_command', (data: { code: string; labelData: any; userInfo?: any }) => {
      try {
        logger.info('Print command received from web client', { 
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
        
        logger.info('Print command forwarded to agents', { 
          room: roomName,
          jobId: printJobData.jobId,
          agentsInRoom: agentManager.getAgentsByRestaurant(data.code).length
        });

        // Подтверждаем отправку клиенту
        socket.emit('print_sent', { success: true, code: data.code });
      } catch (error) {
        logger.error('Error handling print command', {
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
    socket.on('get-agents', (callback?: (response: any) => void) => {
      const agents = socket.data.restaurantId
        ? agentManager.getAgentsByRestaurant(socket.data.restaurantId)
        : agentManager.getAllAgents();

      if (callback) {
        callback({ agents });
      } else {
        socket.emit('agents-updated', { agents });
      }
    });

    // Legacy support: get_connected_agents (веб-приложение)
    socket.on('get_connected_agents', (callback?: (response: any) => void) => {
      const allAgents = agentManager.getAllAgents();
      logger.info('get_connected_agents request', { 
        socketId: socket.id, 
        agentsCount: allAgents.length 
      });

      socket.emit('connected-agents', allAgents);

      if (callback) {
        callback({ agents: allAgents });
      }
    });

    // Get agents in specific room (by pairing code)
    socket.on('get_agents_in_room', (roomCode: string, callback?: (response: any) => void) => {
      const agents = agentManager.getAgentsByRestaurant(roomCode);
      logger.info('get_agents_in_room request', { 
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
    socket.on('join_room', (roomCode: string) => {
      logger.info('Client joining room', { socketId: socket.id, roomCode });
      socket.join(`restaurant:${roomCode}`);
      socket.data.restaurantId = roomCode;
    });

    // Handle get stats request
    socket.on('get-stats', (callback?: (response: any) => void) => {
      const stats = {
        connectedAgents: agentManager.getCount(),
        restaurantAgents: agentManager.getAgentsByRestaurantGrouped(),
        printStats: printQueueManager.getStats(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      };

      if (callback) {
        callback(stats);
      } else {
        socket.emit('stats', stats);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info('Socket disconnected', {
        socketId: socket.id,
        role: socket.data.role,
        agentId: socket.data.agentId,
      });

      // Cleanup rate limiter
      socketRateLimiter.remove(socket.id);

      // Unregister agent if applicable
      if (socket.data.role === 'agent' && socket.data.restaurantId) {
        agentManager.unregisterBySocketId(socket.id);

        // 🔔 Notify clients in restaurant room about agent removal
        const roomAgents = agentManager.getAgentsByRestaurant(socket.data.restaurantId);
        io.to(`restaurant:${socket.data.restaurantId}`).emit('agents-updated', {
          agents: roomAgents,
        });
      }
    });
  });

  // Periodic cleanup
  setInterval(() => {
    agentManager.cleanup();
  }, 60000); // Every minute
}
