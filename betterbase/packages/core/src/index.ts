import type { BetterBaseResponse } from '@betterbase/shared';

export interface BetterBaseProjectConfig {
  name: string;
  mode: 'local' | 'neon' | 'turso';
}

export function createCoreProject(config: BetterBaseProjectConfig): BetterBaseResponse<BetterBaseProjectConfig> {
  return {
    data: config,
    error: null,
  };
}
