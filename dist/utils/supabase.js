"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config");
const logger_1 = require("./logger");
// Create Supabase client with service role for server-side operations
exports.supabaseAdmin = (0, supabase_js_1.createClient)(config_1.config.supabase.url, config_1.config.supabase.serviceRoleKey || config_1.config.supabase.anonKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
// Validate Supabase connection
if (!config_1.config.supabase.url || !config_1.config.supabase.serviceRoleKey) {
    logger_1.logger.warn('⚠️ Supabase credentials not configured. Token validation will fail.');
}
else {
    logger_1.logger.info('✅ Supabase client initialized for agent token validation');
}
exports.default = exports.supabaseAdmin;
//# sourceMappingURL=supabase.js.map