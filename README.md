# WhatsApp Monitor

Self-hosted WhatsApp group monitor. Watches a group, runs LLM scans on a schedule, delivers results to your WhatsApp Saved Messages.

## First run

```bash
npm install
npm run build
npm run start
```

Open http://localhost:3000 → Setup → scan QR → Group → select group → Profiles → configure.

## Full reset (re-link + history backfill)

Wipes the database and session, then re-links. WhatsApp pushes ~24h of message history on the fresh QR scan.

```bash
# Stop the app first (Ctrl+C), then:
rm -rf sessions/ data/monitor.db data/monitor.db-shm data/monitor.db-wal
npm run start
```

Open http://localhost:3000 → Setup → scan QR → re-select group in Group tab.

## DB-only reset (keep session, lose history)

Use this after schema changes. No QR scan needed, but history is NOT backfilled.

```bash
rm data/monitor.db data/monitor.db-shm data/monitor.db-wal
```
