/**
 * Rate limiter for HTTP endpoints
 */
export declare const httpRateLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * Stricter rate limiter for print endpoints
 */
export declare const printRateLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * Socket.IO rate limiter (manual tracking)
 */
declare class SocketRateLimiter {
    private requests;
    private windowMs;
    private maxRequests;
    constructor(windowMs?: number, maxRequests?: number);
    check(socketId: string): boolean;
    remove(socketId: string): void;
    private cleanup;
}
export declare const socketRateLimiter: SocketRateLimiter;
export {};
//# sourceMappingURL=rateLimit.d.ts.map