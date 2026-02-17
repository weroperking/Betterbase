# @betterbase/shared

Shared types, utilities, constants, and schemas used across BetterBase packages.

## Installation

From the monorepo root:

```bash
bun add @betterbase/shared --filter <consumer-package>
```

Or add a workspace dependency in your package `package.json`.

## Usage

```ts
import type { YourType } from '@betterbase/shared';
import { yourUtility } from '@betterbase/shared';
```

## What to add here

- [ ] Common TypeScript types and interfaces
- [ ] Shared utilities/helpers
- [ ] Shared constants and enums
- [ ] Shared validation schemas (e.g. Zod)
- [ ] Shared error/result primitives

## Notes

- Keep exports stable and documented.
- If publishing externally later, add changelog/versioning guidance.
- Include runnable usage examples as the package grows.
