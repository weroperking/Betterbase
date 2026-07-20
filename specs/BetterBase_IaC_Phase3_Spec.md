# BetterBase IaC — Phase 3 Specification

> **For Kilo Code Orchestrator**
> Depends on: BetterBase_IaC_Phase2_Spec.md (P2-01 through P2-30) fully complete.
> Execute tasks in strict order within each phase. Do not skip phases.
> All paths relative to monorepo root unless noted.
> Task prefix: **P3-**

---

## Overview — What Phase 3 Builds

This phase addresses the gaps identified from competitive analysis with Convex and user feedback. Phase 3 makes BetterBase not just equivalent to Convex, but **superior** in key areas that developers actually complain about.

| Area | Tasks | Delivers |
|---|---|---|
| **Optimistic Updates** | P3-01 – P3-04 | Client-side immediate updates with automatic rollback on failure |
| **SQL Query Access** | P3-05 – P3-08 | Raw SQL execution via ctx.db.execute() for power users |
| **Full-Text Search** | P3-09 – P3-13 | PostgreSQL FTS integration in betterbase/ schema and queries |
| **Vector Search** | P3-14 – P3-18 | pgvector integration with similarity search in IaC layer |
| **Better Query Diagnostics** | P3-19 – P3-22 | Query analyzer, slow query warnings, index suggestions |
| **Data Portability** | P3-23 – P3-26 | Export/import tools, backup, migration utilities |
| **Developer Experience** | P3-27 – P3-30 | Error improvement, migration path from Convex |

**Total: 30 tasks across 7 phases.**

---

## Architectural Contract (Phase 3 adds on top of Phase 2)

### New ctx.db API additions

```typescript
// Existing from Phase 2 (unchanged)
ctx.db.get(table, id)
ctx.db.query(table).filter().order().take().collect()
ctx.db.insert(table, doc)
ctx.db.patch(table, id, doc)
ctx.db.delete(table, id)

// NEW in Phase 3
ctx.db.execute(sql: string, params?: unknown[])  // Raw SQL
ctx.db.search(table, query: string)             // Full-text search
ctx.db.similarity(table, embedding: number[], topK?: number)  // Vector search
ctx.db.analyze(query)                            // Query diagnostics
```

### Optimistic Updates Pattern

```typescript
// betterbase/mutations/todos.ts
export const createTodo = mutation({
  args: { text: v.string() },
  // NEW: return optimistic value
  optimistic: (args) => ({ _id: "temp-" + nanoid(), text: args.text, completed: false }),
  handler: async (ctx, args) => {
    return ctx.db.insert("todos", { text: args.text, completed: false });
  },
});
```

### New Validators

```typescript
// betterbase/schema.ts
import { v } from "@betterbase/core/iac";

export default defineSchema({
  documents: defineTable({
    title:   v.string(),
    content: v.fullText(),        // NEW: FTS-enabled field
    embedding: v.vector(1536),   // NEW: vector field for similarity search
    tags:    v.array(v.string()),
  }).index("by_title", ["title"]),
});
```

---

## Phase A — Optimistic Updates (P3-01 to P3-04)

### P3-01: Add optimistic field to mutation registration

**File:** `packages/core/src/iac/functions.ts`

Add `optimistic?: (args: Args) => unknown` to the mutation registration interface. This function returns the shape of data the client should display immediately.

```typescript
export interface MutationRegistration<Args extends z.ZodType, Return> {
  args: Args;
  handler: (ctx: MutationCtx, args: z.infer<Args>) => Promise<Return>;
  // NEW
  optimistic?: (args: z.infer<Args>) => unknown;
}
```

### P3-02: Extend client hooks to support optimistic returns

**Files:**
- `packages/client/src/iac/hooks.ts` — Update `useMutation` to:
  1. Call optimistic function immediately, set local state
  2. Make server request
  3. On success: replace optimistic with real data
  4. On error: show error, optionally revert to previous state

- `packages/client/src/iac/vanilla.ts` — Add `optimistic` option to mutation

The hook should return an `optimisticData` field in the result.

### P3-03: Create optimistic update test suite

**File:** `packages/client/test/optimistic.test.ts`

Test that:
- Optimistic data appears immediately in UI
- On server success, data syncs correctly
- On server failure, error is shown and data can be reverted
- Multiple concurrent mutations don't conflict

### P3-04: Document optimistic updates pattern

**File:** `docs/iac/08-optimistic-updates.md`

Explain how to use the feature, when to use it, and best practices.

---

## Phase B — Raw SQL Access (P3-05 to P3-08)

### P3-05: Add DatabaseWriter.execute() method

**File:** `packages/core/src/iac/db-context.ts`

Add to `DatabaseWriter` class:

```typescript
async execute(sql: string, params?: unknown[]): Promise<{
  rows: unknown[];
  rowCount: number;
}>
```

This runs raw SQL through the project's database connection. Must use the project schema.

### P3-06: Add DatabaseReader.execute() for queries

**File:** `packages/core/src/iac/db-context.ts`

Add read-only `execute` to `DatabaseReader` with same signature.

### P3-07: Create SQL query sanitization layer

**File:** `packages/core/src/iac/db-context.ts`

- Only allow SELECT statements on reader
- Strip dangerous commands (DROP, TRUNCATE, etc.) unless in admin mode
- Automatically prefix table names with project schema
- Log all executed queries for debugging

### P3-08: Document SQL access pattern

**File:** `docs/iac/09-raw-sql.md`

Explain when to use raw SQL vs. the query builder, security considerations, and examples.

---

## Phase C — Full-Text Search (P3-09 to P3-13)

### P3-09: Add v.fullText() validator

**File:** `packages/core/src/iac/validators.ts`

Create validator that marks a field for PostgreSQL full-text search index:

```typescript
export function fullText(): VString {
  return {
    parse: (v) => {
      if (typeof v !== "string") throw new Error("fullText requires string");
      return v;
    },
    schema: () => z.string(),
    sqlType: "tsvector",  // Special handling in migration
    isFullText: true,
  };
}
```

### P3-10: Update schema migration to create FTS indexes

**File:** `packages/core/src/iac/generators/migration-gen.ts`

When generating migrations:
- Detect `isFullText: true` fields
- Create GIN index on tsvector column
- Add function to generate search vector from text

### P3-11: Add ctx.db.search() method

**File:** `packages/core/src/iac/db-context.ts`

```typescript
search(table: string, query: string, options?: {
  limit?: number;
  rank?: boolean;
}): Promise<SearchResult[]>
```

Uses PostgreSQL `to_tsquery` and `ts_rank` for relevance scoring.

### P3-12: Add search to query builder chain

**File:** `packages/core/src/iac/db-context.ts`

Allow chaining `.search(query)` after `.query(table)`:

```typescript
ctx.db.query("documents")
  .search("typescript")
  .order("rank")
  .take(20)
  .collect()
```

### P3-13: Document full-text search pattern

**File:** `docs/iac/10-full-text-search.md`

---

## Phase D — Vector Search (P3-14 to P3-18)

### P3-14: Add v.vector(dimensions) validator

**File:** `packages/core/src/iac/validators.ts`

```typescript
export function vector(dimensions: number): VAny {
  return {
    parse: (v) => {
      if (!Array.isArray(v) || v.length !== dimensions) {
        throw new Error(`Vector must have ${dimensions} dimensions`);
      }
      return v;
    },
    schema: () => z.array(z.number()),
    sqlType: "vector",  // Uses pgvector
    dimensions,
  };
}
```

### P3-15: Update migration generator for pgvector

**File:** `packages/core/src/iac/generators/migration-gen.ts`

- Enable pgvector extension if not present
- Create vector columns with appropriate dimensions
- Create HNSW indexes for efficient similarity search

### P3-16: Add ctx.db.similarity() method

**File:** `packages/core/src/iac/db-context.ts`

```typescript
similarity(
  table: string,
  embedding: number[],
  options?: {
    column?: string;      // default: "embedding"
    topK?: number;         // default: 10
    threshold?: number;    // optional similarity threshold
  }
): Promise<SimilarityResult[]>
```

Uses `<->` (L2 distance), `<#>`, or `<=>` (cosine) operators.

### P3-17: Add embedding generation helper (client-side)

**File:** `packages/client/src/iac/embeddings.ts`

```typescript
// Uses OpenAI or other provider to generate embeddings
export async function generateEmbedding(text: string, provider?: string): Promise<number[]>
```

### P3-18: Document vector search pattern

**File:** `docs/iac/11-vector-search.md`

---

## Phase E — Query Diagnostics (P3-19 to P3-22)

### P3-19: Add ctx.db.analyze() method

**File:** `packages/core/src/iac/db-context.ts`

```typescript
analyze(query: QueryBuilder): Promise<{
  plan: unknown;        // EXPLAIN output
  estimatedCost: number;
  suggestedIndexes: string[];
  isSlow: boolean;
}>
```

Uses PostgreSQL EXPLAIN ANALYZE.

### P3-20: Add query complexity detector

**File:** `packages/core/src/iac/query-analyzer.ts`

Analyze query structure to detect:
- Full table scans
- Missing indexes
- N+1 query patterns
- Unbounded results (no .take())

### P3-21: Integrate diagnostics into CLI

**Files:**
- `packages/cli/src/commands/iac/analyze.ts` — New command
- `bb iac analyze` — Run analysis on project queries
- Output format: table of queries with complexity scores and suggestions

### P3-22: Document query optimization

**File:** `docs/iac/12-query-optimization.md`

---

## Phase F — Data Portability (P3-23 to P3-26)

### P3-23: Create data export command

**File:** `packages/cli/src/commands/iac/export.ts`

```bash
bb iac export --format json --output ./backup
bb iac export --format sql --output ./backup
bb iac export --table users --output ./users.json
```

Exports all or specific tables with schema.

### P3-24: Create data import command

**File:** `packages/cli/src/commands/iac/import.ts`

```bash
bb iac import --format json ./backup
bb iac import --dry-run ./backup  # Preview without applying
```

### P3-25: Add backup scheduler

**File:** `packages/server/src/routes/betterbase/cron.ts`

Allow scheduling automated backups:

```typescript
backup("daily", "0 2 * * *", { retentionDays: 30 });
```

### P3-26: Document data portability

**File:** `docs/iac/13-data-portability.md`

---

## Phase G — Developer Experience (P3-27 to P3-30)

### P3-27: Improve error messages

**Files:**
- `packages/core/src/iac/errors.ts` — New error classes
- Update `packages/server/src/routes/betterbase/index.ts` to use better errors

Make errors show:
- What function failed
- What arguments caused it
- Suggestion to fix it
- Link to docs

### P3-28: Create Convex migration tool

**File:** `packages/cli/src/commands/migrate/from-convex.ts`

```bash
bb migrate from-convex ./convex-project --output ./betterbase-project
```

Parses Convex schema and mutations, converts to BetterBase equivalents:
- `defineSchema` from Convex schema
- Convert validators (Convex values → v.*)
- Convert functions (query/mutation/action)

### P3-29: Add dev mode query log

**File:** `packages/cli/src/commands/dev/query-log.ts`

In `bb dev` mode, show a panel with:
- All queries executed
- Duration of each
- Warnings for slow queries

### P3-30: Update README with competitive advantages

**File:** `README.md`

Add section comparing to Convex, highlighting:
- SQL access
- Self-hosting ease
- No vendor lock-in
- Full-text and vector search built-in

---

## Implementation Notes

### Testing Strategy

- Each task should have corresponding tests
- Integration tests in `packages/cli/test/` and `packages/client/test/`
- E2E tests for export/import in `packages/cli/test/`

### Validation

- Run `bun run test` after each phase
- Run `bun run lint` after each phase  
- Run `bun run typecheck` after each phase

### Dependencies

Phase 3 builds on Phase 2. Ensure:
- `bb iac sync` works for schema creation
- WebSocket real-time works for subscriptions
- Client hooks are stable

---

## Exit Criteria

All 30 tasks complete with:
- Tests passing (1589+ as baseline, +30 new)
- Lint passing
- TypeScript compiling
- Documentation complete (docs/iac/ 08-13)
- No regressions from Phase 2