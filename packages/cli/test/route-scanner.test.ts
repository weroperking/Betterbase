import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RouteScanner } from "../src/utils/route-scanner";

describe("RouteScanner", () => {
	test("extracts hono routes with auth and schemas (GET + POST)", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "users.ts"),
				`
import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';

const createUserSchema = z.object({ email: z.string().email() });
export const users = new Hono();

users.get('/users', authMiddleware, (c) => c.json({ users: [] }));
users.post('/users', async (c) => {
  const body = await c.req.json();
  createUserSchema.parse(body);
  return c.json({ ok: true });
});
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			expect(routes["/users"]).toBeDefined();
			expect(routes["/users"].length).toBe(2);
			expect(routes["/users"][0].method).toBe("GET");
			expect(routes["/users"][1].method).toBe("POST");
			expect(routes["/users"][0].requiresAuth).toBe(true);
			expect(routes["/users"][1].inputSchema).toBe("createUserSchema");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("extracts PATCH routes", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "items.ts"),
				`
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { z } from 'zod';

const updateItemSchema = z.object({ name: z.string().optional(), price: z.number().optional() });
export const items = new Hono();

items.patch('/items/:id', authMiddleware, async (c) => {
  const body = await c.req.json();
  updateItemSchema.parse(body);
  return c.json({ updated: true });
});
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			expect(routes["/items/:id"]).toBeDefined();
			expect(routes["/items/:id"].length).toBe(1);
			expect(routes["/items/:id"][0].method).toBe("PATCH");
			expect(routes["/items/:id"][0].requiresAuth).toBe(true);
			expect(routes["/items/:id"][0].inputSchema).toBe("updateItemSchema");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("extracts DELETE routes", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "items.ts"),
				`
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';

export const items = new Hono();

items.delete('/items/:id', authMiddleware, (c) => {
  return c.json({ deleted: true });
});
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			expect(routes["/items/:id"]).toBeDefined();
			expect(routes["/items/:id"].length).toBe(1);
			expect(routes["/items/:id"][0].method).toBe("DELETE");
			expect(routes["/items/:id"][0].requiresAuth).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("extracts public routes with no auth", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "health.ts"),
				`
import { Hono } from 'hono';

export const health = new Hono();

health.get('/health', (c) => c.json({ status: 'ok' }));
health.get('/ping', (c) => c.text('pong'));
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			expect(routes["/health"]).toBeDefined();
			expect(routes["/health"].length).toBe(1);
			expect(routes["/health"][0].method).toBe("GET");
			expect(routes["/health"][0].requiresAuth).toBe(false);

			expect(routes["/ping"]).toBeDefined();
			expect(routes["/ping"].length).toBe(1);
			expect(routes["/ping"][0].method).toBe("GET");
			expect(routes["/ping"][0].requiresAuth).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("handles malformed decorators / syntax errors in route definitions", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "broken.ts"),
				`
import { Hono } from 'hono';

export const broken = new Hono();

broken.get('/valid', (c) => c.json({ ok: true }));

broken.post('/malformed', ((c) => {
  return c.json({ broken: true });
);
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			expect(routes["/valid"]).toBeDefined();
			expect(routes["/valid"].length).toBe(1);
			expect(routes["/valid"][0].method).toBe("GET");
			expect(routes["/valid"][0].requiresAuth).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("discovers routes in nested directory groups", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });
			mkdirSync(path.join(routesDir, "admin"), { recursive: true });
			mkdirSync(path.join(routesDir, "api/v1"), { recursive: true });

			writeFileSync(
				path.join(routesDir, "admin", "dashboard.ts"),
				`
import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth';
export const admin = new Hono();
admin.get('/admin/dashboard', authMiddleware, (c) => c.json({ stats: {} }));
`,
			);

			writeFileSync(
				path.join(routesDir, "api", "v1", "posts.ts"),
				`
import { Hono } from 'hono';
export const posts = new Hono();
posts.get('/api/v1/posts', (c) => c.json({ posts: [] }));
posts.post('/api/v1/posts', (c) => c.json({ created: true }));
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			expect(routes["/admin/dashboard"]).toBeDefined();
			expect(routes["/admin/dashboard"].length).toBe(1);
			expect(routes["/admin/dashboard"][0].method).toBe("GET");
			expect(routes["/admin/dashboard"][0].requiresAuth).toBe(true);

			expect(routes["/api/v1/posts"]).toBeDefined();
			expect(routes["/api/v1/posts"].length).toBe(2);
			expect(routes["/api/v1/posts"][0].method).toBe("GET");
			expect(routes["/api/v1/posts"][1].method).toBe("POST");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("extracts routes with multiple middleware", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "secure.ts"),
				`
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { loggerMiddleware } from '../middleware/logger';

export const secure = new Hono();

secure.get('/secure/data', loggerMiddleware, authMiddleware, rateLimitMiddleware, (c) => {
  return c.json({ data: 'sensitive' });
});

secure.post('/secure/data', rateLimitMiddleware, loggerMiddleware, authMiddleware, async (c) => {
  return c.json({ ok: true });
});
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			expect(routes["/secure/data"]).toBeDefined();
			expect(routes["/secure/data"].length).toBe(2);
			expect(routes["/secure/data"][0].method).toBe("GET");
			expect(routes["/secure/data"][0].requiresAuth).toBe(true);
			expect(routes["/secure/data"][1].method).toBe("POST");
			expect(routes["/secure/data"][1].requiresAuth).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("extracts routes with query parameter validation", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "search.ts"),
				`
import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';

const searchQuerySchema = z.object({ q: z.string().min(1), page: z.string().optional() });
const createSearchSchema = z.object({ term: z.string() });

export const search = new Hono();

search.get('/search', authMiddleware, (c) => {
  const query = c.req.query();
  searchQuerySchema.parse(query);
  return c.json({ results: [] });
});

search.post('/search', authMiddleware, async (c) => {
  const body = await c.req.json();
  createSearchSchema.parse(body);
  return c.json({ indexed: true });
});
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			expect(routes["/search"]).toBeDefined();
			expect(routes["/search"].length).toBe(2);
			expect(routes["/search"][0].method).toBe("GET");
			expect(routes["/search"][0].requiresAuth).toBe(true);
			expect(routes["/search"][0].inputSchema).toBe("searchQuerySchema");
			expect(routes["/search"][1].method).toBe("POST");
			expect(routes["/search"][1].requiresAuth).toBe(true);
			expect(routes["/search"][1].inputSchema).toBe("createSearchSchema");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("handles mixed protected and public routes in the same file", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "products.ts"),
				`
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { z } from 'zod';

const createProductSchema = z.object({ name: z.string(), price: z.number() });
export const products = new Hono();

products.get('/products', (c) => c.json({ products: [] }));
products.get('/products/:id', (c) => c.json({ product: {} }));
products.post('/products', authMiddleware, async (c) => {
  const body = await c.req.json();
  createProductSchema.parse(body);
  return c.json({ created: true });
});
products.delete('/products/:id', authMiddleware, (c) => {
  return c.json({ deleted: true });
});
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			expect(routes["/products"]).toBeDefined();
			expect(routes["/products"].length).toBe(2);
			expect(routes["/products"][0].method).toBe("GET");
			expect(routes["/products"][0].requiresAuth).toBe(false);
			expect(routes["/products"][1].method).toBe("POST");
			expect(routes["/products"][1].requiresAuth).toBe(true);
			expect(routes["/products"][1].inputSchema).toBe("createProductSchema");

			expect(routes["/products/:id"]).toBeDefined();
			expect(routes["/products/:id"].length).toBe(2);
			expect(routes["/products/:id"][0].method).toBe("GET");
			expect(routes["/products/:id"][0].requiresAuth).toBe(false);
			expect(routes["/products/:id"][1].method).toBe("DELETE");
			expect(routes["/products/:id"][1].requiresAuth).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("handles empty route files with no handlers", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "empty.ts"),
				`
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';

export const empty = new Hono();
`,
			);

			writeFileSync(
				path.join(routesDir, "has-routes.ts"),
				`
import { Hono } from 'hono';
export const has = new Hono();
has.get('/has', (c) => c.json({ yep: true }));
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			expect(routes["/has"]).toBeDefined();
			expect(routes["/has"].length).toBe(1);
			expect(routes["/has"][0].method).toBe("GET");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	// ========== NEW TEST SCENARIOS ==========

	test("PATCH and DELETE routes with both auth and no-auth variants", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "mixed-auth.ts"),
				`
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { z } from 'zod';

const patchSchema = z.object({ title: z.string() });

export const articles = new Hono();

// No-auth PATCH
articles.patch('/articles/:id', async (c) => {
  const body = await c.req.json();
  patchSchema.parse(body);
  return c.json({ ok: true });
});

// Auth DELETE
articles.delete('/articles/:id', authMiddleware, (c) => {
  return c.json({ deleted: true });
});

// Auth PATCH with optionalAuth variant
articles.patch('/articles/:id/lock', authMiddleware, (c) => {
  return c.json({ locked: true });
});

// Public DELETE
articles.delete('/articles/:id/soft', (c) => {
  return c.json({ softDeleted: true });
});
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			// /articles/:id - PATCH (no auth)
			expect(routes["/articles/:id"]).toBeDefined();
			const patchRoutes = routes["/articles/:id"].filter((r) => r.method === "PATCH");
			expect(patchRoutes.length).toBe(1);
			expect(patchRoutes[0].requiresAuth).toBe(false);
			expect(patchRoutes[0].inputSchema).toBe("patchSchema");

			// /articles/:id - DELETE (auth)
			const deleteRoutes = routes["/articles/:id"].filter((r) => r.method === "DELETE");
			expect(deleteRoutes.length).toBe(1);
			expect(deleteRoutes[0].requiresAuth).toBe(true);

			// /articles/:id/lock - PATCH (auth)
			expect(routes["/articles/:id/lock"]).toBeDefined();
			expect(routes["/articles/:id/lock"][0].method).toBe("PATCH");
			expect(routes["/articles/:id/lock"][0].requiresAuth).toBe(true);

			// /articles/:id/soft - DELETE (no auth)
			expect(routes["/articles/:id/soft"]).toBeDefined();
			expect(routes["/articles/:id/soft"][0].method).toBe("DELETE");
			expect(routes["/articles/:id/soft"][0].requiresAuth).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("No-auth routes (routes without requireAuth or optionalAuth)", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "public.ts"),
				`
import { Hono } from 'hono';

export const public = new Hono();

public.get('/public', (c) => c.json({ public: true }));
public.post('/public', (c) => c.json({ posted: true }));
public.put('/public/:id', (c) => c.json({ updated: true }));
public.patch('/public/:id', (c) => c.json({ patched: true }));
public.delete('/public/:id', (c) => c.json({ deleted: true }));
public.head('/public/head', (c) => c.text(''));
public.options('/public/options', (c) => c.text(''));
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			expect(routes["/public"]).toBeDefined();
			expect(routes["/public"].length).toBe(2);
			expect(routes["/public"].every((r) => r.requiresAuth === false)).toBe(true);

			expect(routes["/public/:id"]).toBeDefined();
			expect(routes["/public/:id"].length).toBe(3);
			expect(routes["/public/:id"].every((r) => r.requiresAuth === false)).toBe(true);

			expect(routes["/public/head"]).toBeDefined();
			expect(routes["/public/head"][0].requiresAuth).toBe(false);

			expect(routes["/public/options"]).toBeDefined();
			expect(routes["/public/options"][0].requiresAuth).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("Malformed decorators (missing parentheses, invalid syntax)", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "malformed.ts"),
				`
import { Hono } from 'hono';

export const malformed = new Hono();

// Valid route before malformed
malformed.get('/valid1', (c) => c.json({ ok: true }));

// Missing parentheses on handler
malformed.post('/bad1', (c) => c.json({ shouldWork: true }));
malformed.post('/bad2', c => c.json({ missingParens: true }));

// Extra closing parenthesis
malformed.get('/bad3', (c) => c.json({ extra: true }));

// Incomplete arrow function
malformed.put('/bad4', (c) => {

// Invalid decorator call - missing closing paren for route path
malformed.delete('/bad5', (c) => c.json({ deleteMe: true });

// Valid route after malformed
malformed.get('/valid2', (c) => c.json({ stillOk: true }));
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			// Valid route 1 should be extracted
			expect(routes["/valid1"]).toBeDefined();
			expect(routes["/valid1"][0].method).toBe("GET");
			expect(routes["/valid1"][0].requiresAuth).toBe(false);

			// /bad1 - post with valid handler syntax
			expect(routes["/bad1"]).toBeDefined();
			expect(routes["/bad1"][0].method).toBe("POST");

			// /bad2 - post with missing parens in arrow param - should still work if parseable
			// Actually this would be a syntax error - the scanner should skip it
			// The scanner tries to parse the file; if parse fails it may get 0 routes
			// Let's check what actually happens - the file itself has syntax errors
			// So scanner will either fail gracefully or not extract those lines
			// We can only assert that valid routes are extracted

			// /bad3 - syntax error (extra paren in string literal not a real error, but let's check)
			// Actually "extra: true }));" inside string is fine

			// /bad4 - incomplete arrow function (parse error)
			// Should not be extracted

			// /bad5 - missing closing paren - syntax error
			// Should not be extracted

			// Valid route 2 should be extracted
			expect(routes["/valid2"]).toBeDefined();
			expect(routes["/valid2"][0].method).toBe("GET");
			expect(routes["/valid2"][0].requiresAuth).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("Nested route groups (app.group('/api', ...) with nested routes)", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "grouped.ts"),
				`
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';

const app = new Hono();

// Group with prefix
const api = app.group('/api');

api.get('/stats', (c) => c.json({ stats: {} }));
api.post('/stats', authMiddleware, (c) => c.json({ created: true }));

// Nested group
const v1 = api.group('/v1');

v1.get('/users', (c) => c.json({ users: [] }));
v1.get('/users/:id', (c) => c.json({ user: {} }));
v1.post('/users', authMiddleware, async (c) => {
  const body = await c.req.json();
  return c.json({ created: true });
});

// Deeply nested
const deep = api.group('/admin');
deep.get('/dashboard', authMiddleware, (c) => c.json({ data: 'admin' }));
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			// /api/stats routes
			expect(routes["/api/stats"]).toBeDefined();
			expect(routes["/api/stats"].length).toBe(2);
			expect(routes["/api/stats"][0].method).toBe("GET");
			expect(routes["/api/stats"][0].requiresAuth).toBe(false);
			expect(routes["/api/stats"][1].method).toBe("POST");
			expect(routes["/api/stats"][1].requiresAuth).toBe(true);

			// /api/v1/users routes
			expect(routes["/api/v1/users"]).toBeDefined();
			expect(routes["/api/v1/users"].length).toBe(2);
			expect(routes["/api/v1/users"][0].method).toBe("GET");
			expect(routes["/api/v1/users"][0].requiresAuth).toBe(false);
			expect(routes["/api/v1/users"][1].method).toBe("POST");
			expect(routes["/api/v1/users"][1].requiresAuth).toBe(true);

			// /api/v1/users/:id
			expect(routes["/api/v1/users/:id"]).toBeDefined();
			expect(routes["/api/v1/users/:id"][0].method).toBe("GET");
			expect(routes["/api/v1/users/:id"][0].requiresAuth).toBe(false);

			// /api/admin/dashboard
			expect(routes["/api/admin/dashboard"]).toBeDefined();
			expect(routes["/api/admin/dashboard"][0].method).toBe("GET");
			expect(routes["/api/admin/dashboard"][0].requiresAuth).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("Mixed public/protected in same file (detailed)", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "mixed.ts"),
				`
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { corsMiddleware } from '../middleware/cors';
import { z } from 'zod';

const createSchema = z.object({ name: z.string() });
const updateSchema = z.object({ name: z.string().optional() });

export const api = new Hono();

api.get('/public-get', (c) => c.json({ public: true }));
api.post('/public-post', (c) => c.json({ posted: true }));

api.get('/protected-get', authMiddleware, (c) => c.json({ protected: true }));
api.post('/protected-post', authMiddleware, async (c) => {
  const body = await c.req.json();
  createSchema.parse(body);
  return c.json({ created: true });
});

api.patch('/protected-patch', authMiddleware, async (c) => {
  const body = await c.req.json();
  updateSchema.parse(body);
  return c.json({ patched: true });
});

api.delete('/protected-delete', authMiddleware, (c) => c.json({ deleted: true }));
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			// Public routes
			expect(routes["/public-get"]).toBeDefined();
			expect(routes["/public-get"][0].requiresAuth).toBe(false);
			expect(routes["/public-post"]).toBeDefined();
			expect(routes["/public-post"][0].requiresAuth).toBe(false);

			// Protected routes
			expect(routes["/protected-get"]).toBeDefined();
			expect(routes["/protected-get"][0].requiresAuth).toBe(true);

			expect(routes["/protected-post"]).toBeDefined();
			expect(routes["/protected-post"][0].requiresAuth).toBe(true);
			expect(routes["/protected-post"][0].inputSchema).toBe("createSchema");

			expect(routes["/protected-patch"]).toBeDefined();
			expect(routes["/protected-patch"][0].requiresAuth).toBe(true);
			expect(routes["/protected-patch"][0].inputSchema).toBe("updateSchema");

			expect(routes["/protected-delete"]).toBeDefined();
			expect(routes["/protected-delete"][0].requiresAuth).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("Routes with CORS and other middleware that might confuse scanner", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "bb-routes-"));
		try {
			const routesDir = path.join(root, "src/routes");
			mkdirSync(routesDir, { recursive: true });

			writeFileSync(
				path.join(routesDir, "middleware.ts"),
				`
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware } from '../middleware/auth';

export const api = new Hono();

// CORS before auth
api.get('/cors-auth', cors(), authMiddleware, (c) => c.json({ data: 'both' }));

// CORS only (no auth) - should not be flagged as requiring auth
api.get('/cors-only', cors(), (c) => c.json({ public: true }));

// Auth before CORS - still requires auth
api.post('/auth-cors', authMiddleware, cors(), async (c) => {
  return c.json({ ok: true });
});

// Multiple non-auth middleware before auth (compression, timeout, etc.)
api.get('/multi-middleware', logger(), cors(), authMiddleware, (c) => c.json({ ok: true }));

// auth at different position in chain
api.get('/middleware-chain', cors(), logger(), authMiddleware, (c) => c.json({ ok: true }));

// Route with compression middleware
import { compress } from 'hono/compress';
api.get('/compressed', compress(), authMiddleware, (c) => c.json({ size: 'small' }));

// Route with only non-auth middleware (cors + logger)
api.get('/public-with-middleware', cors(), logger(), (c) => c.json({ public: true }));
`,
			);

			const scanner = new RouteScanner();
			const routes = scanner.scan(routesDir);

			// CORS + Auth route - should require auth
			expect(routes["/cors-auth"]).toBeDefined();
			expect(routes["/cors-auth"][0].requiresAuth).toBe(true);

			// CORS only - should NOT require auth
			expect(routes["/cors-only"]).toBeDefined();
			expect(routes["/cors-only"][0].requiresAuth).toBe(false);

			// Auth + CORS - should require auth
			expect(routes["/auth-cors"]).toBeDefined();
			expect(routes["/auth-cors"][0].requiresAuth).toBe(true);

			// Multiple middleware before auth - should still require auth
			expect(routes["/multi-middleware"]).toBeDefined();
			expect(routes["/multi-middleware"][0].requiresAuth).toBe(true);

			// Middleware chain - auth present
			expect(routes["/middleware-chain"]).toBeDefined();
			expect(routes["/middleware-chain"][0].requiresAuth).toBe(true);

			// Compression + Auth
			expect(routes["/compressed"]).toBeDefined();
			expect(routes["/compressed"][0].requiresAuth).toBe(true);

			// CORS + Logger only (no auth) - should NOT require auth
			expect(routes["/public-with-middleware"]).toBeDefined();
			expect(routes["/public-with-middleware"][0].requiresAuth).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
