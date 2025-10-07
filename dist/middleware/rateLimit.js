"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketRateLimiter = exports.printRateLimiter = exports.httpRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
/**
 * Rate limiter for HTTP endpoints
 */
exports.httpRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.rateLimit.windowMs,
    max: config_1.config.rateLimit.maxRequests,
    message: {
        error: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger_1.logger.warn('Rate limit exceeded', {
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
exports.printRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000, // 1 minute
    max: 30, // 30 prints per minute max
    message: {
        error: 'Too many print requests, please slow down.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger_1.logger.warn('Print rate limit exceeded', {
            ip: req.ip,
            userId: req.user?.userId,
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
    constructor(windowMs = 60000, maxRequests = 50) {
        this.requests = new Map();
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        // Cleanup old entries every 5 minutes
        setInterval(() => this.cleanup(), 300000);
    }
    check(socketId) {
        const now = Date.now();
        const timestamps = this.requests.get(socketId) || [];
        // Remove old timestamps outside the window
        const validTimestamps = timestamps.filter((timestamp) => now - timestamp < this.windowMs);
        if (validTimestamps.length >= this.maxRequests) {
            logger_1.logger.warn('Socket rate limit exceeded', { socketId });
            return false;
        }
        validTimestamps.push(now);
        this.requests.set(socketId, validTimestamps);
        return true;
    }
    remove(socketId) {
        this.requests.delete(socketId);
    }
    cleanup() {
        const now = Date.now();
        for (const [socketId, timestamps] of this.requests.entries()) {
            const validTimestamps = timestamps.filter((timestamp) => now - timestamp < this.windowMs);
            if (validTimestamps.length === 0) {
                this.requests.delete(socketId);
            }
            else {
                this.requests.set(socketId, validTimestamps);
            }
        }
        logger_1.logger.debug('Socket rate limiter cleanup completed', {
            activeConnections: this.requests.size,
        });
    }
}
exports.socketRateLimiter = new SocketRateLimiter();
//# sourceMappingURL=rateLimit.js.map