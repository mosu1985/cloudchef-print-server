export declare const config: {
    nodeEnv: string;
    port: number;
    host: string;
    supabase: {
        url: string;
        anonKey: string;
        serviceRoleKey: string;
    };
    redis: {
        url: string;
        password: string;
    };
    jwt: {
        secret: string;
        expiresIn: string;
    };
    cors: {
        origins: string[];
    };
    rateLimit: {
        windowMs: number;
        maxRequests: number;
    };
    monitoring: {
        logLevel: string;
        metricsEnabled: boolean;
    };
    security: {
        helmetEnabled: boolean;
        trustProxy: boolean;
    };
    isDevelopment: boolean;
    isProduction: boolean;
};
//# sourceMappingURL=index.d.ts.map