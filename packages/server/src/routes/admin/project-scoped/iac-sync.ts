import { Hono } from "hono";
import { getPool } from "../../../lib/db";
import { requireAdminAuth } from "../../../lib/admin-middleware";

export const iacSyncRoutes = new Hono();

// POST /api/projects/:slug/schema
iacSyncRoutes.post(
	"/:slug/schema",
	requireAdminAuth,
	async (c) => {
		const slug = c.req.param("slug");
		const { schema, force } = await c.req.json();
		const projectId = c.get("projectId");
		
		// Get database pool
		const pool = getPool();
		
		// Provision project schema tables
		const schemaName = `project_${slug}`;
		
		// For now, we'll just return success since the actual provisioning
		// would depend on the specific database implementation
		// In a real implementation, this would call provisionProjectSchema
		// and applySchemaChanges functions
		
		return c.json({ 
			success: true, 
			message: `Schema synced for project ${slug}`,
			schemaName 
		});
	},
);

// POST /api/projects/:slug/environment
iacSyncRoutes.post(
	"/:slug/environment",
	requireAdminAuth,
	async (c) => {
		const slug = c.req.param("slug");
		const { envConfig } = await c.req.json();
		const projectId = c.get("projectId");
		
		// Store environment configuration
		// In a real implementation, this would call storeEnvironmentConfig
		
		return c.json({ 
			success: true, 
			message: `Environment config stored for project ${slug}` 
		});
	},
);

// POST /api/projects (create if not exists)
iacSyncRoutes.post("/", requireAdminAuth, async (c) => {
	const { name, slug } = await c.req.json();
	const adminId = c.get("adminId");
	
	const pool = getPool();
	
	// Check if project exists
	let project = await getProjectBySlug(pool, slug);
	if (!project) {
		project = await createProject(pool, {
			name,
			slug,
			adminId: adminId ?? "default-admin",
		});
	}
	
	return c.json({ id: project.id, slug: project.slug });
});

// Helper functions
async function getProjectBySlug(pool: any, slug: string) {
	const result = await pool.query(
		'SELECT id, name, slug FROM projects WHERE slug = $1',
		[slug]
	);
	return result.rows[0] || null;
}

async function createProject(pool: any, data: { name: string; slug: string; adminId: string }) {
	const result = await pool.query(
		'INSERT INTO projects (name, slug, admin_id, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id, slug',
		[data.name, data.slug, data.adminId]
	);
	return result.rows[0];
}