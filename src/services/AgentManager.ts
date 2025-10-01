import { ConnectedAgent, PrinterInfo } from '../types';
import { logger } from '../utils/logger';

/**
 * Manages connected Print Agents
 */
export class AgentManager {
  private agents: Map<string, ConnectedAgent> = new Map();

  /**
   * Register a new agent
   */
  register(
    agentId: string,
    socketId: string,
    restaurantId: string | null,
    userId: string | null,
    code: string,  // ✅ ДОБАВЛЕНО: Pairing code агента
    printerInfo: PrinterInfo | null,
    version: string,
    ip?: string
  ): ConnectedAgent {
    const agent: ConnectedAgent = {
      id: agentId,
      socketId,
      restaurantId,
      userId,
      code,  // ✅ ДОБАВЛЕНО: Сохраняем pairing code
      printerInfo,
      connectedAt: new Date(),
      lastSeen: new Date(),
      version,
      os: printerInfo?.model,
      ip,
    };

    this.agents.set(agentId, agent);

    logger.info('Agent registered', {
      agentId,
      socketId,
      restaurantId,
      userId,
      code,  // ✅ ДОБАВЛЕНО: Логируем code
      version,
    });

    return agent;
  }

  /**
   * Unregister an agent by socket ID
   */
  unregisterBySocketId(socketId: string): void {
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.socketId === socketId) {
        this.agents.delete(agentId);
        logger.info('Agent unregistered', { agentId, socketId });
        return;
      }
    }
  }

  /**
   * Update agent's last seen timestamp
   */
  updateLastSeen(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastSeen = new Date();
    }
  }

  /**
   * Update agent's printer info
   */
  updatePrinterInfo(agentId: string, printerInfo: PrinterInfo): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.printerInfo = printerInfo;
      agent.lastSeen = new Date();
      logger.info('Agent printer info updated', { agentId, printerInfo });
    }
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): ConnectedAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get agent by socket ID
   */
  getAgentBySocketId(socketId: string): ConnectedAgent | undefined {
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
  getAllAgents(): ConnectedAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents for a specific restaurant
   */
  getAgentsByRestaurant(restaurantId: string): ConnectedAgent[] {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.restaurantId === restaurantId
    );
  }

  /**
   * Get total agent count
   */
  getCount(): number {
    return this.agents.size;
  }

  /**
   * Get agents grouped by restaurant
   */
  getAgentsByRestaurantGrouped(): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const agent of this.agents.values()) {
      const restaurantId = agent.restaurantId || 'unknown';
      grouped[restaurantId] = (grouped[restaurantId] || 0) + 1;
    }
    return grouped;
  }

  /**
   * Check if agent is online
   */
  isOnline(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * Cleanup stale agents (not seen for more than 5 minutes)
   */
  cleanup(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [agentId, agent] of this.agents.entries()) {
      if (now - agent.lastSeen.getTime() > staleThreshold) {
        this.agents.delete(agentId);
        logger.warn('Stale agent removed', { agentId });
      }
    }
  }
}

export const agentManager = new AgentManager();
