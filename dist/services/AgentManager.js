"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentManager = exports.AgentManager = void 0;
const logger_1 = require("../utils/logger");
/**
 * Manages connected Print Agents
 */
class AgentManager {
    constructor() {
        this.agents = new Map();
    }
    /**
     * Register a new agent
     */
    register(agentId, socketId, restaurantId, userId, code, // ✅ ДОБАВЛЕНО: Pairing code агента
    printerInfo, version, ip) {
        const agent = {
            id: agentId,
            socketId,
            restaurantId,
            userId,
            code: (code || '').toUpperCase(), // ✅ ДОБАВЛЕНО: Сохраняем pairing code в верхнем регистре
            printerInfo,
            connectedAt: new Date(),
            lastSeen: new Date(),
            version,
            os: printerInfo?.model,
            ip,
        };
        this.agents.set(agentId, agent);
        logger_1.logger.info('Agent registered', {
            agentId,
            socketId,
            restaurantId,
            userId,
            code, // ✅ ДОБАВЛЕНО: Логируем code
            version,
        });
        return agent;
    }
    /**
     * Unregister an agent by socket ID
     */
    unregisterBySocketId(socketId) {
        for (const [agentId, agent] of this.agents.entries()) {
            if (agent.socketId === socketId) {
                this.agents.delete(agentId);
                logger_1.logger.info('Agent unregistered', { agentId, socketId });
                return;
            }
        }
    }
    /**
     * Update agent's last seen timestamp
     */
    updateLastSeen(agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.lastSeen = new Date();
        }
    }
    /**
     * Update agent's printer info
     */
    updatePrinterInfo(agentId, printerInfo) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.printerInfo = printerInfo;
            agent.lastSeen = new Date();
            logger_1.logger.info('Agent printer info updated', { agentId, printerInfo });
        }
    }
    /**
     * Get agent by ID
     */
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    /**
     * Get agent by socket ID
     */
    getAgentBySocketId(socketId) {
        for (const agent of this.agents.values()) {
            if (agent.socketId === socketId) {
                return agent;
            }
        }
        return undefined;
    }
    /**
     * Get all agents
     */
    getAllAgents() {
        return Array.from(this.agents.values());
    }
    /**
     * Get agents for a specific restaurant
     */
    getAgentsByRestaurant(restaurantId) {
        return Array.from(this.agents.values()).filter((agent) => agent.restaurantId === restaurantId);
    }
    /**
     * Get total agent count
     */
    getCount() {
        return this.agents.size;
    }
    /**
     * Get agents grouped by restaurant
     */
    getAgentsByRestaurantGrouped() {
        const grouped = {};
        for (const agent of this.agents.values()) {
            const restaurantId = agent.restaurantId || 'unknown';
            grouped[restaurantId] = (grouped[restaurantId] || 0) + 1;
        }
        return grouped;
    }
    /**
     * Check if agent is online
     */
    isOnline(agentId) {
        return this.agents.has(agentId);
    }
    /**
     * Cleanup stale agents (not seen for more than 5 minutes)
     */
    cleanup() {
        const now = Date.now();
        const staleThreshold = 5 * 60 * 1000; // 5 minutes
        for (const [agentId, agent] of this.agents.entries()) {
            if (now - agent.lastSeen.getTime() > staleThreshold) {
                this.agents.delete(agentId);
                logger_1.logger.warn('Stale agent removed', { agentId });
            }
        }
    }
}
exports.AgentManager = AgentManager;
exports.agentManager = new AgentManager();
//# sourceMappingURL=AgentManager.js.map