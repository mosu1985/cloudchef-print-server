import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthPayload } from '../types';

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
