"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAgentToken = exports.verifyHttpToken = exports.generateToken = exports.verifySocketToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const supabase_1 = require("../utils/supabase");
/**
 * Verify JWT token from Socket.IO handshake
 */
const verifySocketToken = (socket) => {
    try {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
        if (!token) {
            logger_1.logger.warn('Socket connection attempt without token', { socketId: socket.id });
            return null;
        }
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
        logger_1.logger.info('Socket token verified', {
            socketId: socket.id,
            userId: decoded.userId,
            email: decoded.email
        });
        return decoded;
    }
    catch (error) {
        logger_1.logger.error('Socket token verification failed', {
            socketId: socket.id,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return null;
    }
};
exports.verifySocketToken = verifySocketToken;
/**
 * Generate JWT token for agent or web client
 */
const generateToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, config_1.config.jwt.secret, {
        expiresIn: '24h',
    });
};
exports.generateToken = generateToken;
/**
 * Verify token from HTTP request
 */
const verifyHttpToken = (authHeader) => {
    try {
        if (!authHeader?.startsWith('Bearer ')) {
            return null;
        }
        const token = authHeader.replace('Bearer ', '');
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
        return decoded;
    }
    catch (error) {
        logger_1.logger.error('HTTP token verification failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return null;
    }
};
exports.verifyHttpToken = verifyHttpToken;
/**
 * Verify agent token from Supabase database
 * Agent tokens have format: agent_<RESTAURANTCODE>_<32hex>
 */
const verifyAgentToken = async (token) => {
    try {
        logger_1.logger.info('🔍 Проверяем токен агента:', token ? `${token.substring(0, 20)}...` : 'отсутствует');
        // Проверяем формат токена
        const agentKeyPattern = /^agent_([A-Z0-9]{8})_([a-f0-9]{32})$/;
        const match = token.match(agentKeyPattern);
        if (!match) {
            logger_1.logger.error('❌ Неверный формат токена агента. Ожидается: agent_<8 chars>_<32 hex chars>');
            return {
                valid: false,
                error: 'Неверный формат токена агента. Ожидается формат: agent_XXXXXXXX_<32 hex chars>'
            };
        }
        const [, restaurantCode, apiKey] = match;
        // Проверяем токен в Supabase
        const { data, error } = await supabase_1.supabaseAdmin
            .from('agent_tokens')
            .select('id, restaurant_code, is_active, created_at')
            .eq('token', token)
            .eq('is_active', true)
            .single();
        if (error || !data) {
            logger_1.logger.error('❌ Токен агента не найден в базе данных или неактивен', {
                restaurantCode,
                error: error?.message,
            });
            return {
                valid: false,
                error: 'Токен агента недействителен или был отозван. Создайте новый токен в веб-приложении.'
            };
        }
        // Обновляем last_used_at
        await supabase_1.supabaseAdmin
            .from('agent_tokens')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', data.id);
        logger_1.logger.info('✅ Токен агента валиден:', {
            restaurantCode,
            tokenId: data.id,
            createdAt: data.created_at,
        });
        return {
            valid: true,
            restaurantCode: data.restaurant_code,
            tokenId: data.id,
        };
    }
    catch (error) {
        logger_1.logger.error('❌ Ошибка проверки токена агента', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return {
            valid: false,
            error: 'Ошибка проверки токена агента'
        };
    }
};
exports.verifyAgentToken = verifyAgentToken;
//# sourceMappingURL=auth.js.map