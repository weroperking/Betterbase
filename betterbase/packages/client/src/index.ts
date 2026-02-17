import type { BetterBaseResponse } from '@betterbase/shared';

export interface BetterBaseClientOptions {
  projectUrl: string;
  apiKey?: string;
}

export class BetterBaseClient {
  constructor(private readonly options: BetterBaseClientOptions) {}

  getProjectUrl(): BetterBaseResponse<string> {
    return {
      data: this.options.projectUrl,
      error: null,
    };
  }
}
