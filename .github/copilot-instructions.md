# WhatsApp Monitor — Development Guide

**Version:** 0.1  
**Status:** Draft  
**Date:** 2026-03-15

---

## 1. Philosophy

This document is not optional reading. Every developer working on this project — including future-you — must follow these rules without exception.

The guiding principles are:

- **Quality open-source is welcome — choose consciously.** Popular, well-maintained, typed libraries are fine. Cargo-culting the first npm result is not.
- **Tests are not optional.** Every function that contains logic has a unit test. No exceptions.
- **The test suite and linter are always green.** A red test or a lint error is a blocker, not a footnote.
- **Automation enforces discipline.** Tests, linting, and circular dependency checks run automatically on every file change and before every commit. Human willpower is not the enforcement mechanism.
- **Explicit over clever.** Code is written to be read by a tired developer at 11pm. No magic, no over-abstraction.
- **Beautiful code is readable code.** Formatting is automated. Readability is not. No tool enforces good naming, honest functions, or clear intent — that is the developer's responsibility.

---

## 2. Tech Stack

| Concern | Choice | Reason |
|---------|--------|--------|
| Language | TypeScript (strict) | Type safety, IDE support, same language front and back |
| Runtime | Node.js LTS | Required by Baileys |
| WhatsApp | Baileys | Best-maintained unofficial WA library, TypeScript-native |
| Web server | Express | Minimal, well-understood, no magic |
| WebSocket | ws (via Express) | Lightweight, no framework dependency |
| Database | better-sqlite3 | Synchronous SQLite, zero config, fast |
| Test runner | Vitest | Fast, TypeScript-native, Jest-compatible API, built-in watch mode |
| Linter | ESLint + typescript-eslint | Industry standard TS linting |
| Formatter | Prettier | Non-negotiable formatting, no style debates |
| Git hooks | Husky + lint-staged | Enforces lint + test on commit |
| Container | Docker + Docker Compose | Deployment target is NAS |

---

## 3. Dependency Policy

### Rule: Quality Open-Source is Welcome — Justify It

This project does not avoid open-source libraries. The Node.js ecosystem is rich and using well-maintained, popular packages is the right call. However, every dependency must be consciously chosen — not cargo-culted, not grabbed because it was the first npm result, and not added by an AI assistant that didn't think about the alternatives.

Before running `npm install <package>`, answer these questions in a comment in the PR:

1. **What does it do?** One sentence.
2. **Is it popular and actively maintained?** Check: weekly npm downloads (>100k is a good signal), last publish date, open issues, GitHub stars.
3. **Is it secure?** Run `npm audit` after installing. Zero high/critical vulnerabilities on install.
4. **Does it have TypeScript types?** Either built-in or via `@types/`. No untyped dependencies.
5. **Is there a simpler alternative?** Native Node.js APIs (fetch, crypto, fs/promises) cover a lot — check there first.

If you cannot answer all five, do not add the package.

### Approved Core Dependencies (production)

```
@whiskeysockets/baileys   ← WhatsApp protocol
express                   ← HTTP server
ws                        ← WebSocket
better-sqlite3            ← SQLite
node-cron                 ← Cron scheduler
zod                       ← Runtime config/input validation only
```

### Approved Dev Dependencies

```
typescript
vitest
@vitest/coverage-v8
eslint
typescript-eslint
prettier
eslint-config-prettier
husky
lint-staged
madge                     ← circular dependency detection (see section 11)
@types/express
@types/better-sqlite3
@types/ws
@types/node
```

### Hard Rules (non-negotiable)

- No untyped dependencies — TypeScript types are required.
- No dependencies with known high/critical CVEs at install time.
- `npm audit` must pass clean on every commit (enforced via pre-push hook).
- Do not add a package to solve a problem that 10 lines of TypeScript would also solve.

---

## 4. Project Structure

```
/
├── src/
│   ├── config/           ← Config loading and validation (zod schemas)
│   ├── db/               ← SQLite setup, migrations, query functions
│   ├── whatsapp/         ← Baileys session management, message listener
│   ├── scheduler/        ← Cron profile runner
│   ├── llm/              ← Provider-agnostic LLM interface + adapters
│   ├── delivery/         ← WhatsApp Saved Messages delivery
│   ├── web/              ← Express server, routes, WebSocket
│   │   ├── routes/
│   │   └── public/       ← Static HTML/CSS/JS for UI
│   └── index.ts          ← Entry point
├── tests/
│   ├── unit/             ← Mirrors src/ structure exactly
│   └── fixtures/         ← Shared test data, mock factories
├── config/               ← Runtime config files (gitignored values)
│   ├── app.json
│   └── profiles.json
├── data/                 ← SQLite DB files (gitignored)
├── sessions/             ← Baileys session files (gitignored)
├── .eslintrc.json
├── .prettierrc
├── vitest.config.ts
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
├── REQUIREMENTS.md
└── DEVELOPMENT.md
```

### Rule: Test File Mirrors Source File

Every source file `src/foo/bar.ts` has a corresponding test file `tests/unit/foo/bar.test.ts`. No exceptions. If the file contains logic, it has a test file.

---

## 5. TypeScript Configuration

`tsconfig.json` must include these settings — do not relax them:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true
  }
}
```

`strict: true` enables: `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitAny`, `noImplicitThis`, `alwaysStrict`.

**There are no `// @ts-ignore` comments in this codebase.** If TypeScript complains, fix the code.

---

## 6. Linting

### ESLint Configuration

`.eslintrc.json`:

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "prettier"
  ],
  "parserOptions": {
    "project": true
  },
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "no-console": ["warn", { "allow": ["info", "warn", "error"] }]
  }
}
```

### Prettier Configuration

`.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "trailingComma": "all"
}
```

### Running the Linter

```bash
npm run lint        ← check only
npm run lint:fix    ← auto-fix safe issues
npm run format      ← run prettier
```

`package.json` scripts:

```json
{
  "scripts": {
    "lint": "eslint src tests --ext .ts",
    "lint:fix": "eslint src tests --ext .ts --fix",
    "format": "prettier --write src tests",
    "format:check": "prettier --check src tests"
  }
}
```

---

## 7. Testing

### Rules

1. **Every function with logic has at least one unit test.**
2. **Every edge case is tested:** null inputs, empty arrays, malformed config, network errors.
3. **Tests are deterministic.** No `setTimeout`, no random values, no dependency on real network or filesystem. Use mocks.
4. **Tests are fast.** The full suite must complete in under 30 seconds. If a test is slow, it is doing too much.
5. **Tests document behavior.** Test names are sentences: `should return empty array when no messages since last run`.
6. **No testing implementation details.** Test inputs and outputs, not internal state.

### Vitest Configuration

`vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/web/public/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
```

Coverage below 80% on any of the four metrics is a **build failure**.

### Running Tests

```bash
npm test              ← run once
npm run test:watch    ← watch mode (see section 8)
npm run test:coverage ← with coverage report
```

`package.json` scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Test Structure Example

```typescript
// tests/unit/scheduler/profile-runner.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildLLMInput } from '../../../src/scheduler/profile-runner';

describe('buildLLMInput', () => {
  it('should include previous summary when one exists', () => {
    const result = buildLLMInput({
      previousSummary: 'Building quiet yesterday.',
      newMessages: [{ sender: 'Yossi', content: 'Noise at 8am', timestamp: new Date() }],
    });
    expect(result).toContain('Building quiet yesterday.');
    expect(result).toContain('Noise at 8am');
  });

  it('should handle empty previous summary', () => {
    const result = buildLLMInput({
      previousSummary: null,
      newMessages: [{ sender: 'Yossi', content: 'Noise at 8am', timestamp: new Date() }],
    });
    expect(result).not.toContain('null');
    expect(result).toContain('Noise at 8am');
  });

  it('should return prompt-only string when no new messages', () => {
    const result = buildLLMInput({
      previousSummary: 'All quiet.',
      newMessages: [],
    });
    expect(result).toContain('All quiet.');
    expect(result).toContain('no new messages');
  });
});
```

---

## 8. Watch Mode — Continuous Feedback

During development, always run the watcher in a terminal. It re-runs the full test suite and linter on every file change.

```bash
npm run dev:check
```

This script runs Vitest in watch mode with lint on change. Add to `package.json`:

```json
{
  "scripts": {
    "dev:check": "vitest --reporter=verbose"
  }
}
```

For lint-on-change, use a second terminal:

```bash
npm run lint:watch
```

Which uses `nodemon` (dev-only, acceptable) to watch `src/` and `tests/`:

```json
{
  "scripts": {
    "lint:watch": "nodemon --watch src --watch tests --ext ts --exec 'npm run lint'"
  }
}
```

**Rule: both terminals must be open and green before pushing any commit.**

---

## 9. Git Hooks — Commit-Time Enforcement

Husky runs lint + tests on every commit attempt. A failing lint or test **blocks the commit**.

### Setup (run once after cloning)

```bash
npm install
npx husky install
```

`.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"
npx lint-staged
```

`lint-staged` in `package.json`:

```json
{
  "lint-staged": {
    "src/**/*.ts": [
      "eslint --fix",
      "prettier --write"
    ],
    "tests/**/*.ts": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

`.husky/pre-push`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"
npm audit --audit-level=high && npm run lint && npm run check:circular && npm test
```

**Rule: `git commit --no-verify` is forbidden.** If the hooks are failing, fix the code.

---

## 10. Git Workflow

### Branch Naming

```
feature/<short-description>     ← new functionality
fix/<short-description>         ← bug fix
refactor/<short-description>    ← no behavior change
chore/<short-description>       ← tooling, deps, config
```

### Commit Messages

Follow Conventional Commits:

```
feat: add cron preset builder to profile editor
fix: handle empty message buffer in profile runner
test: add unit tests for LLM input builder
refactor: extract message formatter from scheduler
chore: update Baileys to 6.x
```

### Rules

- **No commits directly to `main`.**
- **Every PR must have green CI** (lint + tests) before merge.
- **One logical change per commit.** Do not bundle unrelated changes.
- **Do not comment out code.** Delete it. Git remembers.

---

## 11. Module Design Rules

### Keep Modules Small and Focused

Each module in `src/` has one responsibility. Use line count as a signal, not a rule: a file that is hard to scan in one read is probably doing too much. Prefer splitting when a natural seam exists (separate concerns, reusable logic), not just to hit a number.

---

### Circular Dependencies — Zero Tolerance

**This is the most important structural rule in this document.**

Circular dependencies are silent killers. They do not always cause a runtime crash — Node.js resolves many of them with `undefined` values at import time, which causes bugs that are extremely hard to trace. They are also the most common mistake made by developers (and AI assistants) who are only looking at a small portion of the codebase at a time.

A circular dependency occurs when module A imports from module B, which (directly or transitively) imports from module A:

```
// ❌ CIRCULAR — will cause subtle bugs

// src/scheduler/runner.ts
import { formatResult } from '../web/formatter';   // scheduler imports web

// src/web/formatter.ts
import { getLastResult } from '../scheduler/store'; // web imports scheduler
```

The codebase has exactly **zero circular dependencies at all times.** Not "we'll fix it later." Zero. Always.

---

### The Dependency Graph — Law, Not Suggestion

The allowed import directions between modules are fixed. This diagram is the law:

```
                    ┌─────────┐
                    │ config/ │  ← imported by everyone
                    └────┬────┘     imports nothing
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       ┌─────┐      ┌────────┐    ┌──────────┐
       │ db/ │      │  llm/  │    │ whatsapp/│
       └──┬──┘      └───┬────┘    └────┬─────┘
          │             │              │
          └──────┬───────┘             │
                 ▼                     ▼
           ┌───────────┐         ┌──────────┐
           │ scheduler/│         │ delivery/│
           └─────┬─────┘         └────┬─────┘
                 │                    │
                 └─────────┬──────────┘
                           ▼
                       ┌──────┐
                       │ web/ │  ← imports from all, exported to nothing
                       └──────┘
```

**Permitted imports — memorize this:**

| Module | May import from |
|--------|----------------|
| `config/` | nothing |
| `db/` | `config/` |
| `llm/` | `config/` |
| `whatsapp/` | `config/`, `db/` |
| `scheduler/` | `config/`, `db/`, `llm/` |
| `delivery/` | `config/`, `whatsapp/` |
| `web/` | `config/`, `db/`, `scheduler/`, `llm/`, `delivery/`, `whatsapp/` |

**If your import is not in this table, it is forbidden.** `web/` is the only module that assembles everything — it is the top of the graph. Nothing imports from `web/`.

---

### Automated Detection — madge

`madge` is a dev dependency that statically analyzes the import graph and detects circular dependencies. It runs automatically. There is no manual verification.

**Run on demand:**

```bash
npm run check:circular
```

`package.json` script:

```json
{
  "scripts": {
    "check:circular": "madge --circular --extensions ts src/"
  }
}
```

Expected output when clean:

```
✔ No circular dependency found!
```

Any other output is a **blocker**. Do not commit. Fix the dependency first.

---

### Enforcement — Circular Check Runs on Every Commit

The circular dependency check is added to the pre-push hook alongside lint and tests:

`.husky/pre-push`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"
npm run lint && npm run check:circular && npm test
```

Order matters: circular check runs before tests because a circular dependency can cause tests to pass with incorrect behavior (undefined imports do not always throw).

---

### How Circular Dependencies Get Created — Know Your Enemy

These are the most common patterns that introduce circular dependencies, especially when code is written incrementally or by an AI that sees only one file at a time:

**Pattern 1 — Shared types pulled from the wrong place**

```typescript
// ❌ Bad: web/ defines a type, scheduler/ imports it
// src/web/types.ts
export interface ProfileResult { ... }

// src/scheduler/runner.ts
import type { ProfileResult } from '../web/types'; // ← scheduler imports web
```

Fix: shared types belong in `config/` or a dedicated `src/types.ts` at the root level, importable by everyone.

**Pattern 2 — Convenience re-exports**

```typescript
// ❌ Bad: db/index.ts re-exports everything including something from scheduler/
// src/db/index.ts
export { insertMessage } from './messages';
export { getLastProfileRun } from '../scheduler/store'; // ← pulls in scheduler
```

Fix: `db/index.ts` exports only what lives in `db/`. Never re-export from another module.

**Pattern 3 — "Just one helper" imports**

```typescript
// ❌ Bad: a small utility function that "lives" in the wrong module
// src/llm/utils.ts
import { getProfile } from '../scheduler/profiles'; // ← llm imports scheduler
```

Fix: if a utility is needed by multiple modules, it belongs in `config/` or a shared `src/utils.ts` that has no imports from any domain module.

**Pattern 4 — Event emitters used as shortcuts**

```typescript
// ❌ Bad: scheduler imports web's event emitter to push live updates
// src/scheduler/runner.ts
import { wsEmitter } from '../web/socket'; // ← scheduler imports web
```

Fix: invert the dependency. `web/` subscribes to events emitted by `scheduler/`, not the other way around. Pass the emitter in via dependency injection at startup.

---

### When You Are Tempted to Break the Graph

If you find yourself needing to import in a direction not listed in the table, stop. Do not add the import. Instead ask:

1. **Is this a shared type?** → Move it to `src/types.ts` or `config/`.
2. **Is this a shared utility?** → Move it to `src/utils.ts`.
3. **Does module A need to react to events from module B?** → Use dependency injection or an event emitter passed in from `index.ts`.
4. **Is the module boundary wrong?** → Maybe the function belongs in a different module entirely.

If none of these apply, the architecture needs a review — not a workaround.

---

### Dependency Injection Over Imports

Do not instantiate dependencies inside functions. Pass them in. This is what makes unit testing trivial and also naturally prevents circular imports — if you inject dependencies at startup in `index.ts`, modules never need to import each other directly.

```typescript
// ❌ Bad — untestable, creates hidden coupling
export async function runProfile(profile: Profile): Promise<void> {
  const db = new Database('./data/monitor.db');
  const llm = new GeminiClient();
  const messages = db.getNewMessages(profile.id);
  ...
}

// ✅ Good — injectable, testable, no hidden imports
export async function runProfile(
  profile: Profile,
  db: DatabaseClient,
  llm: LLMClient,
): Promise<void> {
  const messages = db.getNewMessages(profile.id);
  ...
}
```

`src/index.ts` is the only place where all modules are instantiated and wired together. It is the composition root. Everything else receives its dependencies as parameters.

---

## 12. LLM Interface Contract

The LLM interface is a TypeScript interface. Every provider implements it. Business logic depends only on the interface, never on a concrete provider.

```typescript
// src/llm/interface.ts

export interface LLMClient {
  complete(prompt: string): Promise<string>;
}
```

Providers live in `src/llm/providers/`:

```
src/llm/providers/gemini.ts
src/llm/providers/openai.ts
src/llm/providers/ollama.ts
```

Each is a class implementing `LLMClient`. The factory in `src/llm/factory.ts` reads the config and returns the correct implementation. Nothing outside `src/llm/` knows which provider is active.

---

## 13. Database Rules

- All SQL is written explicitly — no query builders, no ORMs.
- All DB access goes through functions in `src/db/`. No SQL outside that directory.
- Migrations are plain numbered `.sql` files in `src/db/migrations/` run on startup.
- All DB functions are synchronous (better-sqlite3 is synchronous by design).
- All DB functions are unit-testable by passing in an in-memory SQLite instance.

```typescript
// src/db/messages.ts
import type { Database } from 'better-sqlite3';

export function insertMessage(db: Database, message: NewMessage): void {
  db.prepare(`
    INSERT INTO messages (account_id, group_id, timestamp, sender, content)
    VALUES (@accountId, @groupId, @timestamp, @sender, @content)
  `).run(message);
}
```

---

## 14. Environment Variables

The app reads these environment variables at startup. All are validated via a zod schema in `src/config/env.ts`. If any required variable is missing, the process exits with a clear error message.

```
PORT                  ← default 3000
CONFIG_PATH           ← default ./config
DATA_PATH             ← default ./data
SESSIONS_PATH         ← default ./sessions
LOG_LEVEL             ← default "info"
```

Secrets (API keys) live in `config/app.json`, not in environment variables — they are user-managed config, not deployment config.

---

## 15. Docker

### Dockerfile Rules

- Use a specific Node LTS version tag — never `node:latest`.
- Multi-stage build: `builder` stage compiles TypeScript, `runner` stage is minimal.
- Run as a non-root user.
- `data/`, `config/`, and `sessions/` are mounted as volumes — never baked into the image.

### docker-compose.yml (development + production)

```yaml
version: '3.9'

services:
  whatsapp-monitor:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config
      - ./data:/app/data
      - ./sessions:/app/sessions
    environment:
      - PORT=3000
      - LOG_LEVEL=info
    restart: unless-stopped
```

### Building and Running

```bash
docker compose up --build       ← build and start
docker compose logs -f          ← follow logs
docker compose down             ← stop
```

---

## 16. Logging

- Use `console.info`, `console.warn`, `console.error` only — no logging library.
- Every log line includes: timestamp, module name, log level, message.
- No `console.log` — use `console.info` for informational output.
- No logging of raw WhatsApp message content in production — log metadata only (sender hash, timestamp, length).
- Startup must log the web UI URL as the last line:

```
[2026-03-15T08:00:00Z] [index] [INFO] WhatsApp Monitor running → http://localhost:3000
```

---

## 17. Code Quality Rules

No linter enforces these rules. They are enforced by code review, by your own judgment, and by the next developer who reads your code. Prettier handles formatting. Everything in this section is about **readability, honesty, and intent**.

When in doubt, ask: *would a tired developer understand this at 11pm without context?* If the answer is no, rewrite it.

---

### Naming

Names are the most read part of any codebase. Spend time on them.

- **Name things for what they are, not their type.** `messages` not `msgArray`. `account` not `accountObj`.
- **No abbreviations** except universally accepted ones: `id`, `url`, `db`, `llm`, `ts` (timestamp). Everything else is spelled out. `previousSummary` not `prevSum`. `accountId` not `accId`.
- **Functions are verbs.** `buildLLMInput`, `insertMessage`, `parseProfile`, `fetchGroupList`. If you cannot name a function with a verb that describes exactly what it does, it is not a well-defined function.
- **Booleans are questions.** `isLinked`, `hasNewMessages`, `shouldDeliver`, `isEnabled`. Never `linked`, `newMessages`, `deliver`.
- **No meaningless class names.** `Manager`, `Handler`, `Helper`, `Utils`, `Service`, `Processor` are names you give something when you do not know what it actually is. If you cannot name the responsibility precisely, the design is wrong. Rename it or rethink it.

```typescript
// ❌ Bad naming
const mgr = new SessionManager();
const accHelper = new AccountHelper();
const res = await svc.proc(msgs, true);

// ✅ Good naming
const session = new WhatsAppSession();
const account = loadAccount(accountId);
const summary = await summarizeMessages(newMessages, previousSummary);
```

---

### Function Design

- **One function, one responsibility.** If you need the word "and" to describe what a function does, split it into two.
- **Maximum 3 parameters.** If you need more, the caller should pass a named options object.
- **No boolean parameters.** `send(true)` — true what? Use an options object or two named functions.

```typescript
// ❌ Bad — what does true mean here?
await deliver(result, true, false);

// ✅ Good — intent is explicit
await deliver(result, { urgent: true, saveToHistory: false });
```

- **Maximum 40 lines per function.** If it is longer, it is doing too much. Extract.
- **Early returns over nested conditionals.** Fail fast, guard at the top, keep the happy path at the lowest indentation level.

```typescript
// ❌ Bad — happy path is buried
function processMessages(messages: Message[]): Result {
  if (messages.length > 0) {
    const first = messages[0];
    if (first !== undefined) {
      if (first.content.length > 0) {
        // happy path finally starts here, indented 3 levels
      }
    }
  }
  return emptyResult();
}

// ✅ Good — guards up front, happy path obvious
function processMessages(messages: Message[]): Result {
  if (messages.length === 0) return emptyResult();
  const first = messages[0];
  if (first === undefined) return emptyResult();
  if (first.content.length === 0) return emptyResult();

  // happy path starts here, at indent level 0
}
```

---

### Comments

- **Comments explain why, never what.** The code says what. If you need a comment to explain what the code does, the code needs to be rewritten, not commented.
- **No commented-out code.** Ever. Git is the history. If you think you might need it later, you will not. Delete it.
- **No `// TODO` or `// FIXME`** in committed code. Open an issue in the tracker instead.

```typescript
// ❌ Bad — explains what (the code already says this)
// check if messages array is empty
if (messages.length === 0) return;

// ❌ Bad — commented-out code
// const result = await oldLLMClient.complete(prompt);
const result = await llm.complete(prompt);

// ✅ Good — explains why (not obvious from the code alone)
// Baileys fires the 'connection.update' event twice on reconnect.
// We guard with this flag to avoid processing the same QR code twice.
if (this.qrEmitted) return;
```

---

### Error Handling

- **No empty catch blocks.** If you catch an error, handle it, log it, or re-throw it with added context. Swallowing an error silently is never acceptable.
- **No error handling "for convenience."** A hidden failure is always worse than a visible crash.
- **Always add context when re-throwing.** Wrap the original error with information about what was happening.

```typescript
// ❌ Bad — error disappears
try {
  await sendToSavedMessages(result);
} catch (_) {}

// ❌ Bad — re-throws but loses context
try {
  await sendToSavedMessages(result);
} catch (error) {
  throw error;
}

// ✅ Good — logs context, preserves original error
try {
  await sendToSavedMessages(result);
} catch (error) {
  console.error('[delivery] Failed to deliver result for profile "%s"', profile.name, error);
  throw new Error(`Delivery failed for profile "${profile.name}": ${String(error)}`);
}
```

---

### No Clever Code

Clever code is code the author was proud of and the next reader will hate.

- **No nested ternaries.** One ternary for a simple conditional assignment is fine. Nesting them is not.
- **No one-liners that require a second read.** If you have to pause to understand a line, break it up.
- **No `!!value` coercions.** Use `value !== null && value !== undefined`, or better, fix the type so the value is never nullable at that point.
- **No `any` casts as a shortcut.** If TypeScript is complaining, fix the type. `any` is a lie you tell the compiler.

```typescript
// ❌ Bad — nested ternary, requires parsing
const status = isLinked ? hasGroup ? 'ready' : 'no-group' : 'unlinked';

// ✅ Good — readable conditionals
function getSessionStatus(isLinked: boolean, hasGroup: boolean): SessionStatus {
  if (!isLinked) return 'unlinked';
  if (!hasGroup) return 'no-group';
  return 'ready';
}
```

---

### Consistency

**The most important rule in this section.**

If there is already a pattern in the codebase for doing something, follow it. Do not introduce a second way to do the same thing because you prefer it, because a library suggests it, or because an AI assistant generated it differently.

Examples:
- If DB functions use the pattern `verbNoun(db, params)`, new DB functions follow the same pattern.
- If routes are structured one way in `web/routes/`, new routes follow the same structure.
- If errors are wrapped with a message string, new error wrapping uses the same format.

If you believe the existing pattern is wrong, that is a valid discussion — but the fix is to **refactor all instances** of the pattern in a dedicated commit, not to silently introduce a second pattern alongside the first.

A codebase with two patterns for the same thing is harder to read than a codebase with one imperfect pattern applied consistently.

---

## 18. Definition of Done

A feature is **done** when all of the following are true:

- [ ] All acceptance criteria from REQUIREMENTS.md are met
- [ ] Unit tests written and passing for all new logic
- [ ] Coverage thresholds (80%) still met
- [ ] Linter passes with zero warnings
- [ ] `npm run check:circular` reports zero circular dependencies
- [ ] `npm audit` reports zero high/critical vulnerabilities
- [ ] Prettier formatting applied
- [ ] Code Quality Rules (section 17) respected — reviewed by a human, not a tool
- [ ] No new dependencies added without justification comment in PR
- [ ] No `// TODO` or `// FIXME` left in committed code — open a tracked issue instead
- [ ] Docker build succeeds (`docker compose up --build`)
- [ ] REQUIREMENTS.md updated if scope changed

---

*End of document.*
