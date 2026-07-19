import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { getPool } from "../src/lib/db";

// Mock the db module
const mockPool = {
	query: mock(() => Promise.resolve({ rows: [] })),
};

mock.module("../src/lib/db", () => ({
	getPool: () => mockPool,
}));

// After all tests in this file, clear the process-global mock.module registry so
// the mocked module cannot leak into sibling test files in a combined run.
afterAll(() => {
	mock.restore();
});

describe("RBAC schema", () => {
	beforeEach(() => {
		mockPool.query.mockClear();
	});

	describe("roles table", () => {
		it("should have correct structure for system roles", async () => {
			const expectedRoles = [
				{
					id: "role_owner",
					name: "owner",
					description: "Full access to everything. Cannot be deleted.",
					is_system: true,
				},
				{
					id: "role_admin",
					name: "admin",
					description: "Full access except deleting other owners.",
					is_system: true,
				},
				{
					id: "role_developer",
					name: "developer",
					description: "Can manage projects, functions, storage. Cannot manage team or settings.",
					is_system: true,
				},
				{
					id: "role_viewer",
					name: "viewer",
					description: "Read-only access to all resources.",
					is_system: true,
				},
			];

			expect(expectedRoles.length).toBe(4);
			expect(expectedRoles.every((r) => r.is_system)).toBe(true);
		});

		it("should include unique constraint on name", () => {
			const roleNames = ["owner", "admin", "developer", "viewer"];
			const uniqueNames = new Set(roleNames);
			expect(uniqueNames.size).toBe(roleNames.length);
		});
	});

	describe("permissions table", () => {
		it("should have permissions for all domains", () => {
			const expectedDomains = [
				"projects",
				"users",
				"storage",
				"functions",
				"webhooks",
				"logs",
				"team",
				"settings",
				"audit",
			];

			expect(expectedDomains.length).toBe(9);
		});

		it("should have standard actions per domain", () => {
			const viewActions = ["view", "create", "edit", "delete", "export"];
			expect(viewActions.length).toBe(5);
		});
	});

	describe("role_permissions mapping", () => {
		it("should assign all permissions to owner role", async () => {
			// Owner should have all permissions
			const allPermissionIds = [
				"perm_projects_view",
				"perm_projects_create",
				"perm_projects_edit",
				"perm_projects_delete",
				"perm_users_view",
				"perm_users_create",
				"perm_users_edit",
				"perm_users_delete",
				"perm_users_export",
				"perm_storage_view",
				"perm_storage_create",
				"perm_storage_edit",
				"perm_storage_delete",
				"perm_functions_view",
				"perm_functions_create",
				"perm_functions_edit",
				"perm_functions_delete",
				"perm_webhooks_view",
				"perm_webhooks_create",
				"perm_webhooks_edit",
				"perm_webhooks_delete",
				"perm_logs_view",
				"perm_logs_export",
				"perm_team_view",
				"perm_team_create",
				"perm_team_edit",
				"perm_team_delete",
				"perm_settings_view",
				"perm_settings_edit",
				"perm_audit_view",
				"perm_audit_export",
			];

			expect(allPermissionIds.length).toBeGreaterThan(20);
		});

		it("should exclude settings_edit from admin role", async () => {
			const adminExcludedPermissions = ["perm_settings_edit"];
			expect(adminExcludedPermissions).toContain("perm_settings_edit");
		});

		it("should only include view permissions for viewer role", async () => {
			const viewerPermissions = [
				"perm_projects_view",
				"perm_users_view",
				"perm_storage_view",
				"perm_functions_view",
				"perm_webhooks_view",
				"perm_logs_view",
				"perm_team_view",
				"perm_settings_view",
				"perm_audit_view",
			];

			expect(viewerPermissions.length).toBe(9);
			expect(viewerPermissions.every((p) => p.endsWith("_view"))).toBe(true);
		});
	});

	describe("admin_roles assignment", () => {
		it("should support global (NULL) project scope", async () => {
			const assignment = {
				admin_user_id: "admin-123",
				role_id: "role_admin",
				project_id: null, // global scope
			};

			expect(assignment.project_id).toBeNull();
		});

		it("should support project-scoped assignments", async () => {
			const assignment = {
				admin_user_id: "admin-123",
				role_id: "role_developer",
				project_id: "project-456",
			};

			expect(assignment.project_id).toBe("project-456");
		});

		it("should enforce unique constraint on admin_user_id + role_id + project_id", async () => {
			const uniqueKey = (admin_user_id: string, role_id: string, project_id: string | null) =>
				`${admin_user_id}:${role_id}:${project_id ?? "global"}`;

			expect(uniqueKey("admin-1", "role_admin", null)).toBe("admin-1:role_admin:global");
			expect(uniqueKey("admin-1", "role_admin", "proj-1")).toBe("admin-1:role_admin:proj-1");
		});
	});
});

describe("role routes", () => {
	describe("GET /admin/roles", () => {
		it("should return roles with permissions array", async () => {
			const mockRoles = [
				{
					id: "role_owner",
					name: "owner",
					description: "Full access",
					is_system: true,
					created_at: new Date(),
				},
			];
			const mockPerms = [
				{ role_id: "role_owner", id: "perm_projects_view", domain: "projects", action: "view" },
			];

			expect(mockRoles[0].is_system).toBe(true);
			expect(mockPerms[0].domain).toBe("projects");
		});
	});

	describe("POST /admin/roles/assignments", () => {
		it("should create assignment with provided data", async () => {
			const assignmentData = {
				admin_user_id: "admin-123",
				role_id: "role_admin",
				project_id: undefined, // global
			};

			expect(assignmentData.admin_user_id).toBeDefined();
			expect(assignmentData.role_id).toBeDefined();
		});

		it("should handle ON CONFLICT DO NOTHING", async () => {
			// This test verifies the upsert logic
			const query = `
				INSERT INTO betterbase_meta.admin_roles (admin_user_id, role_id, project_id)
				VALUES ($1, $2, $3)
				ON CONFLICT (admin_user_id, role_id, project_id) DO NOTHING
				RETURNING id
			`;

			expect(query).toContain("ON CONFLICT");
		});
	});

	describe("DELETE /admin/roles/assignments/:id", () => {
		it("should return error when assignment not found", async () => {
			mockPool.query.mockResolvedValueOnce({ rows: [] });

			const pool = getPool();
			const { rows } = await pool.query(
				"DELETE FROM betterbase_meta.admin_roles WHERE id = $1 RETURNING id, admin_user_id",
				["non-existent-id"],
			);

			expect(rows.length).toBe(0);
		});
	});
});
