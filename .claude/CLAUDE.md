# WhatsApp Monitor — Project Context for Claude

## What this project is
Self-hosted WhatsApp group monitoring app. Runs as a Docker container on a home NAS.
Watches a WhatsApp group, periodically sends buffered messages to an LLM, delivers results
back to the user's own WhatsApp number (Saved Messages). Web UI at http://nas-ip:3000.

The user (Gustavo) monitors an **Israeli building WhatsApp group in Hebrew**.

**Always read `REQUIREMENTS.md` and `DEVELOPMENT.md` before making any changes.**

## Tech stack
TypeScript (strict) · Node.js · Baileys (WhatsApp) · Express · better-sqlite3 · node-cron · zod · Vitest

## Module dependency graph
```
config/     → nothing
db/         → config/
llm/        → config/
whatsapp/   → config/, db/
scheduler/  → config/, db/, llm/
delivery/   → config/, whatsapp/
web/        → config/, db/, scheduler/, llm/, delivery/, whatsapp/
```
Shared types → `src/types.ts` | Shared utils → `src/utils.ts`

## Scaffold status (completed 2026-03-16)
All toolchain checks passing: ESLint · Prettier · Vitest (20 tests) · madge (0 circular) · npm audit (0 vulns) · tsc build.

### Implemented
- `src/config/` — env + app.json/profiles.json loading via zod
- `src/db/` — SQLite schema (accounts, messages, scan_results + processed_by), all query functions
- `src/llm/` — `LLMClient` interface + Gemini / OpenAI / Ollama providers + factory
- `src/whatsapp/session.ts` — Baileys session (QR, connect, disconnect, message capture), static import
- `src/scheduler/` — cron runner, `buildLLMInput`, `runProfile`
- `src/delivery/sender.ts` — deliver result to WhatsApp Saved Messages
- `src/web/` — Express server, WebSocket, all 6 routes, server-rendered HTML (Tailwind + HTMX + Alpine.js)
- `src/index.ts` — composition root, dependency injection wiring

### Not yet done
- Integration/e2e tests (only unit tests exist)
- Dashboard live-refresh via WebSocket (QR display works, alert broadcast wired, but dashboard status card is not auto-refreshing)
- End-to-end Docker test on the NAS
- Multi-account UI (deliberately deferred per requirements)

## Key files
| File | Purpose |
|------|---------|
| `REQUIREMENTS.md` | Product requirements — source of truth |
| `DEVELOPMENT.md` | Coding standards — read before touching code |
| `src/index.ts` | Composition root — only place modules are wired together |
| `src/types.ts` | Shared domain types |
| `src/utils.ts` | escapeHtml, formatTimestamp, logPrefix |
| `config/app.json` | LLM provider config incl. API key (gitignored) |
| `config/profiles.json` | Account + scan profile definitions |

## Running checks
```bash
npm run lint && npm run check:circular && npm test   # must all pass before commit
npm run build                                         # tsc compile
npm run format                                        # Prettier
```
