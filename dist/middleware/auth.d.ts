import { Socket } from 'socket.io';
import { AuthPayload } from '../types';
/**
 * Verify JWT token from Socket.IO handshake
 */
export declare const verifySocketToken: (socket: Socket) => AuthPayload | null;
/**
 * Generate JWT token for agent or web client
 */
export declare const generateToken: (payload: Omit<AuthPayload, "iat" | "exp">) => string;
/**
 * Verify token from HTTP request
 */
export declare const verifyHttpToken: (authHeader?: string) => AuthPayload | null;
/**
 * Verify agent token from Supabase database
 * Agent tokens have format: agent_<RESTAURANTCODE>_<32hex>
 */
export declare const verifyAgentToken: (token: string) => Promise<{
    valid: boolean;
    restaurantCode?: string;
    tokenId?: string;
    error?: string;
}>;
//# sourceMappingURL=auth.d.ts.map