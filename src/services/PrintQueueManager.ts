import { PrintCommand } from '../types';
import { logger } from '../utils/logger';

/**
 * Manages print command queue and history
 */
export class PrintQueueManager {
  private commands: Map<string, PrintCommand> = new Map();
  private maxHistorySize = 1000; // Keep last 1000 commands

  /**
   * Create a new print command
   */
  createCommand(
    id: string,
    restaurantId: string,
    userId: string,
    agentId: string,
    labelData: any
  ): PrintCommand {
    const command: PrintCommand = {
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

    logger.info('Print command created', {
      commandId: id,
      restaurantId,
      agentId,
    });

    return command;
  }

  /**
   * Update command status
   */
  updateStatus(
    commandId: string,
    status: PrintCommand['status'],
    error?: string
  ): void {
    const command = this.commands.get(commandId);
    if (command) {
      command.status = status;
      if (error) {
        command.error = error;
      }
      if (status === 'success' || status === 'failed') {
        command.completedAt = new Date();
      }
      logger.info('Print command status updated', {
        commandId,
        status,
        error,
      });
    }
  }

  /**
   * Get command by ID
   */
  getCommand(commandId: string): PrintCommand | undefined {
    return this.commands.get(commandId);
  }

  /**
   * Get recent commands
   */
  getRecentCommands(limit: number = 50): PrintCommand[] {
    const commands = Array.from(this.commands.values());
    return commands
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get commands by restaurant
   */
  getCommandsByRestaurant(restaurantId: string, limit: number = 50): PrintCommand[] {
    const commands = Array.from(this.commands.values()).filter(
      (cmd) => cmd.restaurantId === restaurantId
    );
    return commands
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    pending: number;
    printing: number;
    success: number;
    failed: number;
  } {
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
  private cleanup(): void {
    const commands = Array.from(this.commands.entries());
    const sorted = commands.sort(
      ([, a], [, b]) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    // Keep only the most recent commands
    const toKeep = sorted.slice(0, this.maxHistorySize);
    this.commands = new Map(toKeep);

    logger.debug('Print queue cleanup completed', {
      commandsRemaining: this.commands.size,
    });
  }
}

export const printQueueManager = new PrintQueueManager();
