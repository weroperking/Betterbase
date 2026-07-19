/**
 * RLS Evaluator - Application-Layer RLS for SQLite
 *
 * This module provides runtime evaluation of RLS policies for SQLite databases
 * which don't have native RLS support. It parses policy expressions and
 * evaluates them against the current user session and record data.
 */

import { UnauthorizedError } from "@betterbase/shared";
import type { PolicyDefinition } from "./types";

/**
 * Evaluate a policy expression at runtime
 *
 * Supports:
 * - auth.uid() = column_name
 * - auth.role() = 'value'
 * - true (allow all)
 * - false (deny all)
 *
 * @param policyExpression - The policy expression string to evaluate
 * @param userId - The current user's ID from the session
 * @param operation - The database operation type
 * @param record - The record being evaluated (for row-level checks)
 * @returns true if policy allows the operation, false otherwise
 */
export function evaluatePolicy(
	policyExpression: string,
	userId: string | null,
	operation: "select" | "insert" | "update" | "delete",
	record?: Record<string, unknown>,
): boolean {
	// Handle simple boolean policies
	if (policyExpression === "true") {
		return true;
	}

	if (policyExpression === "false") {
		return false;
	}

	// Handle auth.uid() = column references
	// Example: "auth.uid() = user_id"
	const uidMatch = policyExpression.match(/auth\.uid\(\)\s*=\s*(\w+)/);
	if (uidMatch) {
		const columnName = uidMatch[1];
		const columnValue = record?.[columnName];

		if (userId === null) {
			return false; // Deny if no authenticated user
		}

		// Compare userId with the column value
		return String(userId) === String(columnValue);
	}

	// Handle auth.uid() IS NOT NULL
	// Example: "auth.uid() IS NOT NULL"
	if (/auth\.uid\(\)\s+IS\s+NOT\s+NULL/i.test(policyExpression)) {
		// Allow any authenticated user
		return userId !== null;
	}

	// Handle auth.role() = 'value'
	// Example: auth.role() = 'admin'
	const roleMatch = policyExpression.match(/auth\.role\(\)\s*=\s*'([^']+)'/);
	if (roleMatch) {
		const requiredRole = roleMatch[1];
		// The role is supplied via the optional `role` argument below when present.
		// Otherwise fall back to a sensible default: an authenticated session is
		// considered to have the "authenticated" role.
		const role = (record as { __role?: string } | undefined)?.__role ?? "authenticated";
		return role === requiredRole;
	}

	// Unknown policy format - deny by default for security
	console.warn(`[RLS] Unknown policy expression: ${policyExpression}`);
	return false;
}

/**
 * Apply RLS policies to a SELECT query
 * Fetches rows first, then filters through the evaluator
 *
 * @param rows - Array of records fetched from the database
 * @param policies - Array of policy definitions for the table
 * @param userId - The current user's ID (null for anonymous)
 * @returns Filtered rows that match RLS policies
 */
export function applyRLSSelect(
	rows: Record<string, unknown>[],
	policies: PolicyDefinition[],
	userId: string | null,
): Record<string, unknown>[] {
	// If no policies, return all rows (or none for non-authenticated if needed)
	if (policies.length === 0) {
		// Default behavior: allow public read if no policies
		return rows;
	}

	// Find all SELECT policies for this table
	const selectPolicies = policies.filter((p) => p.select || p.using);

	// If no SELECT policies, check if there are any policies
	if (selectPolicies.length === 0) {
		// No policy defined - apply default based on authentication
		if (userId === null) {
			return []; // Deny anonymous by default
		}
		return rows;
	}

	// Filter rows through all policies - rows pass if ANY policy allows
	return rows.filter((row) => {
		// If ANY policy allows access, the row passes
		return selectPolicies.some((policy) => {
			const policyExpr = policy.select || policy.using;
			return evaluatePolicy(policyExpr!, userId, "select", row);
		});
	});
}

/**
 * Check if an INSERT operation is allowed
 *
 * @param policy - The INSERT policy expression
 * @param userId - The current user's ID (null for anonymous)
 * @param record - The record being inserted
 * @throws UnauthorizedError if the operation is denied
 */
export function applyRLSInsert(
	policy: string | undefined,
	userId: string | null,
	record: Record<string, unknown>,
): void {
	// If no policy, check authentication requirement
	if (!policy) {
		if (userId === null) {
			throw new UnauthorizedError("Insert requires authentication");
		}
		return; // Allow authenticated users
	}

	// Evaluate the policy
	const allowed = evaluatePolicy(policy, userId, "insert", record);

	if (!allowed) {
		throw new UnauthorizedError("Insert denied by RLS policy");
	}
}

/**
 * Check if an UPDATE operation is allowed
 *
 * @param policy - The UPDATE policy expression
 * @param userId - The current user's ID (null for anonymous)
 * @param record - The record being updated
 * @throws UnauthorizedError if the operation is denied
 */
export function applyRLSUpdate(
	policy: string | undefined,
	userId: string | null,
	record: Record<string, unknown>,
): void {
	// If no policy, check authentication requirement
	if (!policy) {
		if (userId === null) {
			throw new UnauthorizedError("Update requires authentication");
		}
		return; // Allow authenticated users
	}

	// Evaluate the policy - use "using" or "withCheck" expression
	const policyExpr = policy;
	const allowed = evaluatePolicy(policyExpr, userId, "update", record);

	if (!allowed) {
		throw new UnauthorizedError("Update denied by RLS policy");
	}
}

/**
 * Check if a DELETE operation is allowed
 *
 * @param policy - The DELETE policy expression
 * @param userId - The current user's ID (null for anonymous)
 * @param record - The record being deleted
 * @throws UnauthorizedError if the operation is denied
 */
export function applyRLSDelete(
	policy: string | undefined,
	userId: string | null,
	record: Record<string, unknown>,
): void {
	// If no policy, check authentication requirement
	if (!policy) {
		if (userId === null) {
			throw new UnauthorizedError("Delete requires authentication");
		}
		return; // Allow authenticated users
	}

	// Evaluate the policy
	const allowed = evaluatePolicy(policy, userId, "delete", record);

	if (!allowed) {
		throw new UnauthorizedError("Delete denied by RLS policy");
	}
}

/**
 * Middleware factory for applying RLS to database operations
 * This can be integrated with the query execution layer
 *
 * @param policies - Array of policy definitions
 * @param getUserId - Function to get current user ID from request context
 * @returns RLS middleware functions
 */
export function createRLSMiddleware(policies: PolicyDefinition[], getUserId: () => string | null) {
	return {
		/**
		 * Apply RLS to SELECT operations
		 */
		select: (rows: Record<string, unknown>[]) => {
			const userId = getUserId();
			return applyRLSSelect(rows, policies, userId);
		},

		/**
		 * Apply RLS to INSERT operations
		 */
		insert: (record: Record<string, unknown>) => {
			const userId = getUserId();
			const policy = policies.find((p) => p.insert || p.withCheck);
			applyRLSInsert(policy?.insert || policy?.withCheck, userId, record);
		},

		/**
		 * Apply RLS to UPDATE operations
		 */
		update: (record: Record<string, unknown>) => {
			const userId = getUserId();
			const policy = policies.find((p) => p.update || p.using);
			applyRLSUpdate(policy?.update || policy?.using, userId, record);
		},

		/**
		 * Apply RLS to DELETE operations
		 */
		delete: (record: Record<string, unknown>) => {
			const userId = getUserId();
			const policy = policies.find((p) => p.delete);
			applyRLSDelete(policy?.delete, userId, record);
		},
	};
}
