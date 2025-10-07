import { PrintCommand } from '../types';
/**
 * Manages print command queue and history
 */
export declare class PrintQueueManager {
    private commands;
    private maxHistorySize;
    /**
     * Create a new print command
     */
    createCommand(id: string, restaurantId: string, userId: string, agentId: string, labelData: any): PrintCommand;
    /**
     * Update command status
     */
    updateStatus(commandId: string, status: PrintCommand['status'], error?: string): void;
    /**
     * Get command by ID
     */
    getCommand(commandId: string): PrintCommand | undefined;
    /**
     * Get recent commands
     */
    getRecentCommands(limit?: number): PrintCommand[];
    /**
     * Get commands by restaurant
     */
    getCommandsByRestaurant(restaurantId: string, limit?: number): PrintCommand[];
    /**
     * Get statistics
     */
    getStats(): {
        total: number;
        pending: number;
        printing: number;
        success: number;
        failed: number;
    };
    /**
     * Cleanup old commands
     */
    private cleanup;
}
export declare const printQueueManager: PrintQueueManager;
//# sourceMappingURL=PrintQueueManager.d.ts.map