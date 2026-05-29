import { loadCredentials } from "./credentials";
import { error } from "./logger";
import { ProjectEnvironment } from "../commands/iac/env-detector";
import { SerializedSchema } from "@betterbase/core/iac";

export function requireAuth(): { token: string; serverUrl: string } {
  const creds = loadCredentials();
  if (!creds?.token) {
    error("Not logged in. Run `bb login` first.");
    process.exit(1);
  }
  return { token: creds.token, serverUrl: creds.server_url };
}

export async function apiRequest<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const { token, serverUrl } = requireAuth();

  const url = `${serverUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: "Request failed" }))) as {
      error?: string;
    };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export class ApiClient {
  constructor(private baseUrl: string = "") {}

  // NEW: Project registration
  async registerProject(data: {
    name: string;
    environment: string;
    config: ProjectEnvironment;
  }): Promise<{ id: string }> {
    return this.post('/api/projects', data);
  }

  // NEW: Schema synchronization
  async syncSchema(data: {
    projectId: string;
    schema: SerializedSchema;
    force?: boolean;
  }): Promise<{ success: boolean }> {
    return this.post(`/api/projects/${data.projectId}/schema`, data);
  }

  // NEW: Environment synchronization
  async syncEnvironment(data: {
    projectId: string;
    envConfig: ProjectEnvironment;
  }): Promise<void> {
    return this.post(`/api/projects/${data.projectId}/environment`, data);
  }

	// NEW: Get project by slug/name
	async getProject(slug: string): Promise<{ id: string; slug: string } | null> {
		return this.get(`/api/projects/${slug}`).catch(() => null);
	}

	// NEW: Validate API key
	async validateApiKey(apiKey: string): Promise<boolean> {
		try {
			const res = await fetch(`${this.baseUrl}/api/auth/validate`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
			});
			return res.ok;
		} catch {
			return false;
		}
	}

  // NEW: Validate API key (doesn't require existing credentials)
	async validateApiKey(apiKey: string): Promise<boolean> {
		try {
			const res = await fetch(`${this.baseUrl}/api/auth/validate`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const { token, serverUrl } = requireAuth();
    const url = `${this.baseUrl}${endpoint}`;
    
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(errorBody.error ?? `HTTP ${res.status}`);
    }
    
    return res.json();
  }

  private get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  private post<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, { 
      method: "POST", 
      body: JSON.stringify(data) 
    });
  }

  private put<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, { 
      method: "PUT", 
      body: JSON.stringify(data) 
    });
  }

  private delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

export function createApiClient(baseUrl?: string): ApiClient {
  return new ApiClient(baseUrl);
}