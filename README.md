<div align="center">

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/weroperking/Betterbase)

```
'                                                                                                        
'     ▄▄▄▄▄▄                                                      ▄▄▄▄▄▄                                 
'     ██▀▀▀▀██              ██        ██                          ██▀▀▀▀██                               
'     ██    ██   ▄████▄   ███████   ███████    ▄████▄    ██▄████  ██    ██   ▄█████▄  ▄▄█████▄   ▄████▄  
'     ███████   ██▄▄▄▄██    ██        ██      ██▄▄▄▄██   ██▀      ███████    ▀ ▄▄▄██  ██▄▄▄▄ ▀  ██▄▄▄▄██ 
'     ██    ██  ██▀▀▀▀▀▀    ██        ██      ██▀▀▀▀▀▀   ██       ██    ██  ▄██▀▀▀██   ▀▀▀▀██▄  ██▀▀▀▀▀▀ 
'     ██▄▄▄▄██  ▀██▄▄▄▄█    ██▄▄▄     ██▄▄▄   ▀██▄▄▄▄█   ██       ██▄▄▄▄██  ██▄▄▄███  █▄▄▄▄▄██  ▀██▄▄▄▄█ 
'     ▀▀▀▀▀▀▀     ▀▀▀▀▀      ▀▀▀▀      ▀▀▀▀     ▀▀▀▀▀    ▀▀       ▀▀▀▀▀▀▀    ▀▀▀▀ ▀▀   ▀▀▀▀▀▀     ▀▀▀▀▀  
'                                                                                                        
'                                                                                                        
```

**The AI-Native Backend-as-a-Service Platform**

Blazing-fast backend development with Sub-100ms Local Dev — Built on Bun + SQLite, deploy anywhere with PostgreSQL support.

*Database • Authentication • Realtime Subscriptions • Storage • Serverless Functions • Vector Search*

**Last Updated: 2026-03-30**

</div>

---

## Why Choose Betterbase?

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                           ✦ BETTERBASE ARCHITECTURE ✦                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  ┌──────────────┐           ┌──────────────────────────────┐           ┌─────────┐          │
│  │   Frontend   │           │                              │           │         │          │
│  │ (React, Vue, │─────────▶ │      BETTERBASE CORE        │──────────▶│   DB    │          │
│  │  Mobile,     │           │                              │           │ SQLite/ │          │
│  │  Svelte)     │           │  Auth  │  Realtime │ Storage │           │ Postgres│          │
│  └──────────────┘           │  RLS   │  Vector  │   Fns    │           └─────────┘          │
│                             └──────────────────────────────┘                                │
│                                        │                                                    │
│                                 ┌──────▼──────┐                                             │
│                                 │    IaC      │◀──── (Infrastructure as Code)              │
│                                 │  Layer      │                                             │
│                                 │ Convex-ish  │                                             │
│                                 │             │                                             │
│                                 └─────────────│                                             │
│                                                                                             │
│                                                                         ┌──────▼──────┐     │
│                                                                         │  Inngest    │     │
│                                                                         │  Workflows  │     │
│                                                                         └────────────┘│     |
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

| | TraditionalBAAS | Betterbase |
|--|------------------|------------|
| ⚡ | Slow local dev | **Sub-100ms dev** with Bun + SQLite |
| 🗄️ | Black box DB | **Full PostgreSQL** with raw SQL access |
| 🔍 | Basic search | **Full-text + Vector search** built-in |
| 🚀 | Cloud lock-in | **Self-host anywhere** with Docker |
| 📊 | Limited analytics | **Full observability** out of the box |
| 🔐 | Closed source | **100% open source** - deploy anywhere |

---

## Quick Start

```bash
# Install the CLI
bun install -g @betterbase/cli

# Create a new project (IaC mode - recommended)
bb init my-app
cd my-app
bun install
bb dev
```

Your project structure:

```
my-app/
├── betterbase/
│   ├── schema.ts         # Define tables (Convex-style)
│   ├── queries/          # Read functions (auto-subscribe)
│   ├── mutations/        # Write functions (transactions)
│   └── actions/          # Side-effects (scheduled, HTTP)
├── betterbase.config.ts  # Optional config
└── package.json
```

### Define Your Schema

Edit `betterbase/schema.ts`:

```typescript
import { defineSchema, defineTable, v } from "@betterbase/core/iac"

export const schema = defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
  }).uniqueIndex("by_email", ["email"]),
  
  posts: defineTable({
    title: v.string(),
    content: v.string(),
    published: v.boolean(),
    authorId: v.id("users"),
  }).index("by_author", ["authorId"]),
})
```

### Write Functions

```typescript
// betterbase/queries/posts.ts
import { query } from "@betterbase/core/iac"

export const listPosts = query({
  args: { published: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    return ctx.db.query("posts")
      .filter("published", "eq", args.published ?? true)
      .order("desc")
      .take(50)
  },
})
```

```typescript
// betterbase/mutations/posts.ts
import { mutation } from "@betterbase/core/iac"

export const createPost = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    authorId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("posts", {
      ...args,
      published: false,
    })
  },
})
```

### Run

```bash
bb dev
```

Your backend runs at `http://localhost:3000`. The dashboard is at `http://localhost:3001`.

---

## Key Features

| Feature | Description |
|---------|-------------|
| **IaC Layer** | Convex-inspired: define schema + functions in TypeScript |
| **Auto-Realtime** | Queries auto-subscribe to changes |
| **Type Safety** | Full TypeScript inference, no code generation needed |
| **Migrations** | Automatic diff + apply on `bb dev` |
| **Raw SQL** | `ctx.db.execute()` for complex queries |
| **Full-Text Search** | PostgreSQL GIN indexes via `ctx.db.search()` |
| **Vector Search** | pgvector + HNSW for embeddings |
| **Serverless Functions** | Deploy custom API functions |
| **Storage** | S3-compatible object storage |
| **Webhooks** | Event-driven with signed payloads |
| **Background Jobs** | Durable workflows via Inngest |
| **RLS** | Row-level security policies |
| **Branching** | Preview environments per branch |

---

## Betterbase vs Convex

| Feature | Convex | Betterbase |
|---------|--------|------------|
| Database | Black box | Full PostgreSQL |
| Raw SQL | Not available | `ctx.db.execute()` |
| Full-Text Search | Not built-in | PostgreSQL FTS |
| Vector Search | Limited | pgvector + HNSW |
| Self-Hosting | Not supported | Docker to your infra |
| Migration | — | `bb migrate from-convex` |

**Betterbase gives you Convex simplicity with full SQL power.**

---

## Inngest Integration

Betterbase uses [Inngest](https://www.inngest.com/) for durable workflows and background jobs.

### Deployment Modes

| Mode | Inngest Backend | Used By |
|------|----------------|---------|
| Cloud | `https://api.inngest.com` | BetterBase Cloud offering |
| Self-Hosted | `http://inngest:8288` | Docker deployment |
| Local Dev | `http://localhost:8288` | Development and testing |

### Environment Variables

```bash
# For local development
INNGEST_BASE_URL=http://localhost:8288

# For self-hosted production
INNGEST_BASE_URL=http://inngest:8288
INNGEST_SIGNING_KEY=your-signing-key
INNGEST_EVENT_KEY=your-event-key
```

### Features

- **Webhook Delivery**: Retryable, observable webhook delivery with automatic backoff
- **Notification Rules**: Cron-based metric polling with fan-out notifications
- **Background Exports**: Async CSV export with progress tracking

---

## Project Structure

Betterbase supports two patterns:

### 1. IaC Pattern (Recommended)

```
my-app/
├── betterbase/
│   ├── schema.ts         # defineSchema() + defineTable()
│   ├── queries/          # query() functions
│   ├── mutations/        # mutation() functions
│   ├── actions/          # action() functions
│   └── cron.ts           # scheduled functions
├── betterbase.config.ts  # Optional config
└── package.json
```

### 2. Original Pattern (Advanced)

```
my-app/
├── src/
│   ├── db/
│   │   ├── schema.ts     # Drizzle schema
│   │   └── migrate.ts    # Migration runner
│   ├── routes/           # Hono routes
│   └── functions/        # Serverless functions
├── betterbase.config.ts
└── package.json
```

Both patterns work together. Add `betterbase/` to any existing project.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `bb init [name]` | Create new project |
| `bb dev` | Start dev server |
| `bb iac sync` | Sync IaC schema |
| `bb iac analyze` | Analyze query performance |
| `bb migrate` | Run migrations |
| `bb generate types` | Generate TypeScript types |

---

## Client SDK

```bash
bun add @betterbase/client
```

```typescript
import { createClient } from '@betterbase/client'

const client = createClient({
  baseUrl: 'http://localhost:3000',
})

// Use IaC functions
const { data: posts } = await client.bff.queries.posts.listPosts({})

// Mutations
await client.bff.mutations.posts.createPost({
  title: 'Hello',
  content: 'World',
  authorId: 'user-123',
})
```

---

## Deployment

### Local

```bash
bb dev
```

### Docker

```bash
docker-compose up -d
```

### Self-Hosted

See [SELF_HOSTED.md](SELF_HOSTED.md) for full documentation.

```typescript
database: {
  provider: 'neon',
  connectionString: process.env.NEON_CONNECTION_STRING
}
```

### Turso (libSQL)

Best for edge deployments and distributed databases.

```typescript
database: {
  provider: 'turso',
  connectionString: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
}
```

### MySQL

Best for legacy applications or MySQL preference.

```typescript
database: {
  provider: 'mysql',
  connectionString: process.env.MYSQL_URL
}
```

### PlanetScale (MySQL-compatible)

Best for serverless MySQL with branch-based schema changes.

```typescript
database: {
  provider: 'planetscale',
  connectionString: process.env.PLANETSCALE_URL
}
```

---

## Authentication

### Setup BetterAuth

Initialize authentication in your project:

```bash
bb auth setup
```

This creates `src/auth/` with default configuration.

### Configure Providers

Edit `src/auth/index.ts`:

```typescript
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '../db'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite' // or 'postgres', 'mysql'
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    }
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24 // 1 day
  }
})
```

### Row Level Security

Betterbase integrates with database RLS for secure data access:

```typescript
// In your schema or via CLI
bb rls add \
  --table posts \
  --name users_own_posts \
  --command SELECT \
  --check "user_id = auth.uid()"
```

This ensures users can only access their own data.

---

## Ask Deepwiki

> *Your AI-powered development assistant, integrated directly into Betterbase.*

Ask Deepwiki provides intelligent context for AI-assisted development:

- **Smart Code Context**: Automatic `.betterbase-context.json` generation
- **IaC Analysis**: Understand your schema, queries, and mutations
- **Query Optimization**: Get recommendations for better performance
- **Documentation Generation**: Auto-generate docs from your code

**Deepwiki Badge**: The badge at the top of this README links to [Ask Deepwiki](https://deepwiki.com/weroperking/Betterbase), where you can chat with an AI that understands your entire Betterbase project.

### Using Ask Deepwiki

1. **Development**: Get instant answers about your IaC layer
2. **Debugging**: Understand query behavior and optimization
3. **Onboarding**: New team members can ask about your architecture
4. **Refactoring**: Get AI suggestions for improving your code

---

## Contributing

We welcome contributions! Please follow these steps:

### Getting Started

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/your-username/betterbase.git`
3. **Install** dependencies: `bun install`
4. **Create** a branch: `git checkout -b feature/my-feature`

### Development Setup

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun test

# Run linting
bun run lint
```

### Project Structure

```
betterbase/
├── apps/
│   └── test-project/      # Example/test project
├── packages/
│   ├── cli/              # @betterbase/cli
│   ├── client/           # @betterbase/client
│   └── core/             # @betterbase/core
├── templates/            # Project templates
└── turbo.json            # Turborepo configuration
```

### Code Style

We use Biome for code formatting and linting:

```bash
# Format code
bun run format

# Lint code
bun run lint

# Fix auto-fixable issues
bun run lint:fix
```

### Testing

```bash
# Run all tests
bun test

# Run tests for specific package
bun test --filter=@betterbase/cli

# Run tests in watch mode
bun test --watch
```

### Commit Messages

Follow Conventional Commits:

```
feat: add new feature
fix: resolve bug
docs: update documentation
refactor: restructure code
test: add tests
chore: maintenance
```

### Submitting Changes

1. Push your branch: `git push origin feature/my-feature`
2. Open a **Pull Request**
3. Fill out the PR template
4. Wait for review

---

## Code of Conduct

### Our Pledge

In the interest of fostering an open and welcoming environment, we as contributors and maintainers pledge to make participation in our project and our community a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

Examples of behavior that contributes to creating a positive environment include:

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

### Our Responsibilities

Project maintainers are responsible for clarifying the standards of acceptable behavior and are expected to take appropriate and fair corrective action in response to any instances of unacceptable behavior.

### Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be reported by contacting the project team at conduct@betterbase.io. All complaints will be reviewed and investigated and will result in a response that is deemed necessary and appropriate to the circumstances.

---

## Changelog

All notable changes to this project will be documented in this section.

### [1.0.0] - 2026-03-19

#### Added

- **AI Context Generation**: Automatic `.betterbase-context.json` generation for AI-assisted development
- **Branch Management**: New `bb branch` command for creating isolated preview environments
- **Vector Search**: pgvector-powered similarity search with embeddings support
- **Auto-REST**: Automatic CRUD route generation from Drizzle schema
- **Enhanced CLI**: Added 12 commands including branch, webhook management, and storage operations

#### Updated

- Updated copyright year to 2026
- Improved documentation with Last Updated timestamp
- Verified all features against current codebase structure
- Removed deprecated @betterbase/shared package references

#### Security

- Improved webhook signature verification
- Enhanced RLS policy engine

---

## License

Betterbase is open source under the [MIT License](LICENSE).

```
MIT License

Copyright (c) 2026 Betterbase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Community & Support

### Get Help

| Resource | Link |
|----------|------|
| **Discord** | [Discord](https://discord.gg/R6Dm6Cgy2E) |
| **GitHub Issues** | [GitHub Issues](https://github.com/weroperking/Betterbase/issues) |

### Contribute

| Resource | Link |
|----------|------|
| **GitHub** | [GitHub](https://github.com/weroperking/Betterbase) |
| **Contributing Guide** | [CONTRIBUTING.md](CONTRIBUTING.md) |
| **Good First Issues** | [Good First Issues](https://github.com/weroperking/Betterbase/labels/good-first-issue) |

---

<div align="center">

**Built with ❤️ by Weroperking**

[Website](#) • [Documentation](docs/README.md) • [Discord](https://discord.gg/R6Dm6Cgy2E) • [GitHub](https://github.com/weroperking/Betterbase) • [Twitter](#)

</div>