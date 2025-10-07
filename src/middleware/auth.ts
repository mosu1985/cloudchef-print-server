import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthPayload } from '../types';
import { supabaseAdmin } from '../utils/supabase';

/**
 * Verify JWT token from Socket.IO handshake
 */
export const verifySocketToken = (socket: Socket): AuthPayload | null => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      logger.warn('Socket connection attempt without token', { socketId: socket.id });
      return null;
    }

    const decoded = jwt.verify(token, config.jwt.secret) as AuthPayload;
    
    logger.info('Socket token verified', { 
      socketId: socket.id,
      userId: decoded.userId,
      email: decoded.email 
    });

    return decoded;
  } catch (error) {
    logger.error('Socket token verification failed', { 
      socketId: socket.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
};

/**
 * Generate JWT token for agent or web client
 */
export const generateToken = (payload: Omit<AuthPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: '24h',
  });
};

/**
 * Verify token from HTTP request
 */
export const verifyHttpToken = (authHeader?: string): AuthPayload | null => {
  try {
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, config.jwt.secret) as AuthPayload;

    return decoded;
  } catch (error) {
    logger.error('HTTP token verification failed', { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
};

/**
 * Verify agent token from Supabase database
 * Agent tokens have format: agent_<RESTAURANTCODE>_<32hex>
 */
export const verifyAgentToken = async (token: string): Promise<{ valid: boolean; restaurantCode?: string; tokenId?: string; error?: string }> => {
  try {
    logger.info('🔍 Проверяем токен агента:', token ? `${token.substring(0, 20)}...` : 'отсутствует');

    // Проверяем формат токена
    const agentKeyPattern = /^agent_([A-Z0-9]{8})_([a-f0-9]{32})$/;
    const match = token.match(agentKeyPattern);
    
    if (!match) {
      logger.error('❌ Неверный формат токена агента. Ожидается: agent_<8 chars>_<32 hex chars>');
      return {
        valid: false,
        error: 'Неверный формат токена агента. Ожидается формат: agent_XXXXXXXX_<32 hex chars>'
      };
    }

    const [, restaurantCode, apiKey] = match;

    // Проверяем токен в Supabase
    const { data, error } = await supabaseAdmin
      .from('agent_tokens')
      .select('id, restaurant_code, is_active, created_at')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      logger.error('❌ Токен агента не найден в базе данных или неактивен', {
        restaurantCode,
        error: error?.message,
      });
      return {
        valid: false,
        error: 'Токен агента недействителен или был отозван. Создайте новый токен в веб-приложении.'
      };
    }

    // Обновляем last_used_at
    await supabaseAdmin
      .from('agent_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id);

    logger.info('✅ Токен агента валиден:', {
      restaurantCode,
      tokenId: data.id,
      createdAt: data.created_at,
    });

    return {
      valid: true,
      restaurantCode: data.restaurant_code,
      tokenId: data.id,
    };
  } catch (error) {
    logger.error('❌ Ошибка проверки токена агента', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      valid: false,
      error: 'Ошибка проверки токена агента'
    };
  }
};
