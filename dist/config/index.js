"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    // Server
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '8080', 10),
    host: process.env.HOST || '0.0.0.0',
    // Supabase
    supabase: {
        url: process.env.SUPABASE_URL || '',
        anonKey: process.env.SUPABASE_ANON_KEY || '',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
    // Redis
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        password: process.env.REDIS_PASSWORD || undefined,
    },
    // JWT
    jwt: {
        secret: process.env.JWT_SECRET || 'development-secret-key',
        expiresIn: '24h',
    },
    // CORS
    cors: {
        origins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
    },
    // Rate Limiting
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    },
    // Monitoring
    monitoring: {
        logLevel: process.env.LOG_LEVEL || 'info',
        metricsEnabled: process.env.METRICS_ENABLED === 'true',
    },
    // Security
    security: {
        helmetEnabled: process.env.HELMET_ENABLED !== 'false',
        trustProxy: process.env.TRUST_PROXY === 'true',
    },
    // Development
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
};
// Validate required config
const requiredConfig = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'JWT_SECRET',
];
if (exports.config.isProduction) {
    const missing = requiredConfig.filter(key => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}
//# sourceMappingURL=index.js.map