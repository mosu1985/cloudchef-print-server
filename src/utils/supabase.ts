import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from './logger';

// Create Supabase client with service role for server-side operations
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Validate Supabase connection
if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  logger.warn('⚠️ Supabase credentials not configured. Token validation will fail.');
} else {
  logger.info('✅ Supabase client initialized for agent token validation');
}

export default supabaseAdmin;
