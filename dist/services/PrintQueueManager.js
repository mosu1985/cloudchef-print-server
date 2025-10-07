"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printQueueManager = exports.PrintQueueManager = void 0;
const logger_1 = require("../utils/logger");
/**
 * Manages print command queue and history
 */
class PrintQueueManager {
    constructor() {
        this.commands = new Map();
        this.maxHistorySize = 1000; // Keep last 1000 commands
    }
    /**
     * Create a new print command
     */
    createCommand(id, restaurantId, userId, agentId, labelData) {
        const command = {
            id,
            restaurantId,
            userId,
            agentId,
            labelData,
            status: 'pending',
            createdAt: new Date(),
        };
        this.commands.set(id, command);
        // Cleanup if history gets too large
        if (this.commands.size > this.maxHistorySize) {
            this.cleanup();
        }
        logger_1.logger.info('Print command created', {
            commandId: id,
            restaurantId,
            agentId,
        });
        return command;
    }
    /**
     * Update command status
     */
    updateStatus(commandId, status, error) {
        const command = this.commands.get(commandId);
        if (command) {
            command.status = status;
            if (error) {
                command.error = error;
            }
            if (status === 'success' || status === 'failed') {
                command.completedAt = new Date();
            }
            logger_1.logger.info('Print command status updated', {
                commandId,
                status,
                error,
            });
        }
    }
    /**
     * Get command by ID
     */
    getCommand(commandId) {
        return this.commands.get(commandId);
    }
    /**
     * Get recent commands
     */
    getRecentCommands(limit = 50) {
        const commands = Array.from(this.commands.values());
        return commands
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, limit);
    }
    /**
     * Get commands by restaurant
     */
    getCommandsByRestaurant(restaurantId, limit = 50) {
        const commands = Array.from(this.commands.values()).filter((cmd) => cmd.restaurantId === restaurantId);
        return commands
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, limit);
    }
    /**
     * Get statistics
     */
    getStats() {
        const commands = Array.from(this.commands.values());
        return {
            total: commands.length,
            pending: commands.filter((c) => c.status === 'pending').length,
            printing: commands.filter((c) => c.status === 'printing').length,
            success: commands.filter((c) => c.status === 'success').length,
            failed: commands.filter((c) => c.status === 'failed').length,
        };
    }
    /**
     * Cleanup old commands
     */
    cleanup() {
        const commands = Array.from(this.commands.entries());
        const sorted = commands.sort(([, a], [, b]) => b.createdAt.getTime() - a.createdAt.getTime());
        // Keep only the most recent commands
        const toKeep = sorted.slice(0, this.maxHistorySize);
        this.commands = new Map(toKeep);
        logger_1.logger.debug('Print queue cleanup completed', {
            commandsRemaining: this.commands.size,
        });
    }
}
exports.PrintQueueManager = PrintQueueManager;
exports.printQueueManager = new PrintQueueManager();
//# sourceMappingURL=PrintQueueManager.js.map