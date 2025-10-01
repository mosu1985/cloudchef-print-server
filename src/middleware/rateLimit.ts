import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Rate limiter for HTTP endpoints
 */
export const httpRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
    });
  },
});

/**
 * Stricter rate limiter for print endpoints
 */
export const printRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 30, // 30 prints per minute max
  message: {
    error: 'Too many print requests, please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Print rate limit exceeded', {
      ip: req.ip,
      userId: (req as any).user?.userId,
    });
    res.status(429).json({
      error: 'Too many print requests, please slow down.',
    });
  },
});

/**
 * Socket.IO rate limiter (manual tracking)
 */
class SocketRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 50) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 300000);
  }

  check(socketId: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(socketId) || [];

    // Remove old timestamps outside the window
    const validTimestamps = timestamps.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    if (validTimestamps.length >= this.maxRequests) {
      logger.warn('Socket rate limit exceeded', { socketId });
      return false;
    }

    validTimestamps.push(now);
    this.requests.set(socketId, validTimestamps);

    return true;
  }

  remove(socketId: string): void {
    this.requests.delete(socketId);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [socketId, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(
        (timestamp) => now - timestamp < this.windowMs
      );
      if (validTimestamps.length === 0) {
        this.requests.delete(socketId);
      } else {
        this.requests.set(socketId, validTimestamps);
      }
    }
    logger.debug('Socket rate limiter cleanup completed', {
      activeConnections: this.requests.size,
    });
  }
}

export const socketRateLimiter = new SocketRateLimiter();
