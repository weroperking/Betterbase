export interface MockFetchRoute {
  method?: string;
  url: string | RegExp;
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export function mockFetch(
  routes: MockFetchRoute[],
): typeof globalThis.fetch & { calls: Request[] } {
  const calls: Request[] = [];

  const mock = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const request = new Request(input instanceof Request ? input : url, init);
    calls.push(request);

    for (const route of routes) {
      const urlMatch =
        typeof route.url === "string"
          ? url.includes(route.url)
          : route.url.test(url);
      const methodMatch = !route.method || route.method === method;

      if (urlMatch && methodMatch) {
        return new Response(JSON.stringify(route.body), {
          status: route.status,
          headers: {
            "Content-Type": "application/json",
            ...route.headers,
          },
        });
      }
    }

    return new Response(JSON.stringify({ error: "unmocked" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  };

  (mock as unknown as { calls: Request[] }).calls = calls;
  return mock as typeof globalThis.fetch & { calls: Request[] };
}

export const DEVICE_CODE_RESPONSE = {
  device_code: "device_code_abc123",
  user_code: "ABCD-EFGH",
  verification_uri: "https://api.betterbase.io/device",
};

export const TOKEN_RESPONSE_PENDING = { error: "authorization_pending" };

export const TOKEN_RESPONSE_SUCCESS = {
  access_token: "access_token_xyz789",
};

export const ADMIN_ME_RESPONSE = {
  admin: { email: "admin@test.com" },
};

export const ADMIN_LOGIN_RESPONSE = {
  token: "api_key_token_123",
  admin: { email: "admin@test.com" },
};

export const ADMIN_LOGIN_ERROR = { error: "Invalid credentials" };
