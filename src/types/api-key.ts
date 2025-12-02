/**
 * API Key Management Types
 *
 * Type definitions for the api_keys table and related operations
 */

/**
 * Database row type for api_keys table
 */
export interface APIKey {
  id: string;
  provider_id: string | null;
  key_name: string;
  key_value_encrypted: string;
  key_hash: string;
  status: 'active' | 'disabled';
  quota_limit: number | null;
  usage_count: number;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  notes: string | null;
}

/**
 * Input type for creating a new API key
 */
export interface CreateAPIKeyInput {
  provider_id?: string | null;
  key_name: string;
  key_value: string; // Plaintext key value (will be encrypted before storage)
  quota_limit?: number | null;
  expires_at?: string | null;
  created_by?: string | null;
  notes?: string | null;
}

/**
 * Input type for updating an existing API key
 */
export interface UpdateAPIKeyInput {
  key_name?: string;
  key_value?: string; // If provided, will be re-encrypted
  status?: 'active' | 'disabled';
  quota_limit?: number | null;
  expires_at?: string | null;
  notes?: string | null;
}

/**
 * API Key with provider information (joined query result)
 */
export interface APIKeyWithProvider extends APIKey {
  provider?: {
    id: string;
    name: string;
    display_name: string;
    base_url: string;
  } | null;
}

/**
 * Masked API key for display (sensitive data hidden)
 */
export interface MaskedAPIKey {
  id: string;
  provider_id: string | null;
  provider_name?: string;
  key_name: string;
  key_value_masked: string; // e.g., "sk-1***cdef"
  status: 'active' | 'disabled';
  quota_limit: number | null;
  usage_count: number;
  usage_percentage: number | null; // usage_count / quota_limit * 100
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  notes: string | null;
}

/**
 * API Key statistics for dashboard
 */
export interface APIKeyStats {
  total_keys: number;
  active_keys: number;
  disabled_keys: number;
  keys_with_quota: number;
  total_usage: number;
  keys_near_quota: number; // usage > 80% of quota
  keys_expired: number;
}

/**
 * API Key usage record
 */
export interface APIKeyUsage {
  api_key_id: string;
  timestamp: string;
  success: boolean;
  error_message?: string;
  tokens_used?: number;
  cost?: number;
  metadata?: Record<string, unknown>;
}

/**
 * API response types
 */
export interface APIKeyResponse {
  success: boolean;
  data?: MaskedAPIKey | MaskedAPIKey[];
  error?: string;
  message?: string;
}

export interface CreateAPIKeyResponse {
  success: boolean;
  data?: {
    api_key: MaskedAPIKey;
    plaintext_key: string; // Only returned on creation, never stored
  };
  error?: string;
  message?: string;
}
