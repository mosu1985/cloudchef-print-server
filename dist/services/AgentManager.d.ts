import { ConnectedAgent, PrinterInfo } from '../types';
/**
 * Manages connected Print Agents
 */
export declare class AgentManager {
    private agents;
    /**
     * Register a new agent
     */
    register(agentId: string, socketId: string, restaurantId: string | null, userId: string | null, code: string, // ✅ ДОБАВЛЕНО: Pairing code агента
    printerInfo: PrinterInfo | null, version: string, ip?: string): ConnectedAgent;
    /**
     * Unregister an agent by socket ID
     */
    unregisterBySocketId(socketId: string): void;
    /**
     * Update agent's last seen timestamp
     */
    updateLastSeen(agentId: string): void;
    /**
     * Update agent's printer info
     */
    updatePrinterInfo(agentId: string, printerInfo: PrinterInfo): void;
    /**
     * Get agent by ID
     */
    getAgent(agentId: string): ConnectedAgent | undefined;
    /**
     * Get agent by socket ID
     */
    getAgentBySocketId(socketId: string): ConnectedAgent | undefined;
    /**
     * Get all agents
     */
    getAllAgents(): ConnectedAgent[];
    /**
     * Get agents for a specific restaurant
     */
    getAgentsByRestaurant(restaurantId: string): ConnectedAgent[];
    /**
     * Get total agent count
     */
    getCount(): number;
    /**
     * Get agents grouped by restaurant
     */
    getAgentsByRestaurantGrouped(): Record<string, number>;
    /**
     * Check if agent is online
     */
    isOnline(agentId: string): boolean;
    /**
     * Cleanup stale agents (not seen for more than 5 minutes)
     */
    cleanup(): void;
}
export declare const agentManager: AgentManager;
//# sourceMappingURL=AgentManager.d.ts.map