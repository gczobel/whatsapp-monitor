# WhatsApp Monitor — Requirements Document

**Version:** 0.1  
**Status:** Draft  
**Author:** Gustavo  
**Date:** 2026-03-15

---

## 1. Overview

A self-hosted WhatsApp group monitoring application that runs as a Docker container on a home NAS. It watches a designated WhatsApp group, periodically sends the buffered messages to an LLM for classification and summarization, and delivers results back to the user's own WhatsApp number (Saved Messages). A web-based UI is accessible from any browser on the local network.

---

## 2. Guiding Principles

- **Self-hosted first** — no third-party services hold a WhatsApp session key.
- **Zero external DB dependency** — SQLite only, files on disk.
- **Provider-agnostic LLM** — swap Gemini / OpenAI / Ollama without touching business logic.
- **Multi-account by design** — data model and URL structure are account-scoped from day one, even though the UI currently exposes a single account.
- **Human-readable config** — JSON files editable outside the UI if needed.

---

## 3. System Context

```
WhatsApp Group
      ↓  (Baileys — WhatsApp Web protocol)
NAS Docker Container
      ├── Baileys session manager
      ├── Message buffer (SQLite)
      ├── Scan profile scheduler (cron)
      ├── LLM interface (provider-agnostic)
      ├── Delivery (WhatsApp Saved Messages via Baileys)
      └── Express web server → :3000
              ↓  HTTP + WebSocket
Browser (any device on local network)
      └── Web UI
```

On startup the process prints a clickable URL to the terminal:

```
🚀 WhatsApp Monitor started
📱 http://nas-ip:3000
```

---

## 4. Functional Requirements

### F1 — Session Management (per account)

| ID | Requirement |
|----|-------------|
| F1.1 | Link a WhatsApp account by displaying a QR code in the UI for the user to scan with their phone. |
| F1.2 | Show current session status: `linked` / `unlinked` / `expired`. |
| F1.3 | Allow logout / unlink of the session from the UI. |
| F1.4 | Persist the session so re-scanning is not required on app restart. |
| F1.5 | Session files stored under `sessions/<accountId>/`. |

### F2 — Group Selection (per account)

| ID | Requirement |
|----|-------------|
| F2.1 | After linking, list all available WhatsApp groups for the account. |
| F2.2 | Allow the user to select one group to monitor. |
| F2.3 | Store the selected group identifier in the account config. |
| F2.4 | Display the monitored group name on the dashboard. |

### F3 — Message Buffering

| ID | Requirement |
|----|-------------|
| F3.1 | Capture all incoming messages from the monitored group in real time. |
| F3.2 | Store each message in SQLite with: `account_id`, `group_id`, `timestamp`, `sender`, `content`, `processed_by` (profile id, nullable). |
| F3.3 | Messages are never deleted automatically — retention policy is a future requirement. |

### F4 — Scan Profiles (per account)

| ID | Requirement |
|----|-------------|
| F4.1 | A scan profile consists of: `name`, `prompt` (free text), `timer` (cron expression), `enabled` (boolean). |
| F4.2 | Profiles are created, edited, and deleted via the UI. |
| F4.3 | Profiles can be enabled or disabled without deleting them. |
| F4.4 | Each profile is associated with an `account_id`. |
| F4.5 | Profiles are stored in `config/profiles.json`. |
| F4.6 | Each profile run passes to the LLM: the previous LLM output for that profile (rolling summary) + all new messages since the last run. |
| F4.7 | LLM output per run is stored in SQLite with: `account_id`, `profile_id`, `timestamp`, `input_message_ids`, `output`. |

### F4.A — Timer Configuration (within profile)

| ID | Requirement |
|----|-------------|
| F4.A.1 | A preset builder in the UI allows selecting: every N minutes / hourly / daily at HH:MM / weekly. |
| F4.A.2 | The equivalent cron expression is displayed grayed-out next to the preset builder, updating live as the user adjusts. |
| F4.A.3 | A free-text cron field allows power users to enter expressions directly. |
| F4.A.4 | The cron expression is the canonical stored format in `profiles.json`. |

### F5 — LLM Interface

| ID | Requirement |
|----|-------------|
| F5.1 | The LLM interface is provider-agnostic. Providers are: OpenAI-compatible endpoint, Gemini API, Ollama (local). |
| F5.2 | Provider configuration includes: provider type, endpoint URL, API key (optional), model name. |
| F5.3 | Provider configuration is editable via the UI under global config. |
| F5.4 | Provider configuration is stored in `config/app.json`. |
| F5.5 | Swapping provider requires no changes to profiles or business logic. |

### F6 — Delivery

| ID | Requirement |
|----|-------------|
| F6.1 | Each profile result is sent to the user's own WhatsApp number (Saved Messages / My Number) via Baileys. |
| F6.2 | Results are also stored and viewable in the web UI history. |

### F7 — Web UI Structure

The UI is account-scoped. URL structure:

```
/config                         ← global: LLM provider, app settings
/accounts/:accountId/setup      ← QR code, session status, logout
/accounts/:accountId/group      ← group selection
/accounts/:accountId/profiles   ← scan profile CRUD
/accounts/:accountId/           ← dashboard: status, active profiles, last run times
/accounts/:accountId/history    ← LLM output history per profile
```

| ID | Requirement |
|----|-------------|
| F7.1 | Dashboard shows: session status, monitored group name, list of profiles with last run time and enabled state. |
| F7.2 | History view shows per-profile LLM output chronologically. |
| F7.3 | WebSocket connection pushes live urgent alerts to the dashboard without refresh. |
| F7.4 | Global config page allows LLM provider configuration. |
| F7.5 | Today with one account, the UI navigates directly to `/accounts/1/` — no account switcher is shown. |

---

## 5. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NF1 | Runs as a Docker container on headless Ubuntu with GPU (NAS). |
| NF2 | Web UI accessible at `http://nas-ip:3000` on the local network. |
| NF3 | Process startup prints a clickable URL to stdout. |
| NF4 | SQLite only — no external database required. |
| NF5 | Config is human-readable JSON, editable outside the UI. |
| NF6 | The app must survive container restart without requiring re-authentication (persistent session files). |
| NF7 | No WhatsApp session data is sent to any third-party service — all processing is local or via a user-configured API key. |

---

## 6. File & Directory Layout

```
/app
├── config/
│   ├── app.json          ← LLM provider, app-wide settings
│   └── profiles.json     ← accounts[], each with scan profiles[]
├── sessions/
│   └── <accountId>/      ← Baileys session files
├── data/
│   └── monitor.db        ← SQLite: messages, results
├── src/                  ← TypeScript source
└── Dockerfile
```

---

## 7. Data Model (Logical)

### accounts
| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| display_name | text | e.g. "Gustavo" |
| phone_number | text | |
| monitored_group_id | text | WhatsApp group JID |
| monitored_group_name | text | display name |

### messages
| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| account_id | integer FK | |
| group_id | text | |
| timestamp | datetime | |
| sender | text | |
| content | text | |

### scan_results
| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| account_id | integer FK | |
| profile_id | text | matches profile name in JSON |
| timestamp | datetime | |
| input_message_ids | text | JSON array |
| previous_summary | text | rolling summary passed to LLM |
| output | text | LLM response |

---

## 8. Configuration Schema

### config/app.json
```json
{
  "port": 3000,
  "llm": {
    "provider": "gemini",
    "endpoint": "https://generativelanguage.googleapis.com/v1beta",
    "apiKey": "...",
    "model": "gemini-2.0-flash"
  }
}
```

### config/profiles.json
```json
{
  "accounts": [
    {
      "id": 1,
      "displayName": "Gustavo",
      "profiles": [
        {
          "id": "urgent-scan",
          "name": "Urgent Scan",
          "prompt": "You are monitoring an Israeli building WhatsApp group (Hebrew). Review the messages and identify anything urgent: water/power/fire/security/elevator. Return a short summary or 'nothing urgent'.",
          "cron": "*/10 * * * *",
          "enabled": true
        },
        {
          "id": "daily-digest",
          "name": "Daily Digest",
          "prompt": "Summarize today's building group messages in Hebrew into 3-5 bullet points in English. Focus on: noise schedules, meetings, important notices. Ignore chatter.",
          "cron": "0 8,18 * * *",
          "enabled": true
        }
      ]
    }
  ]
}
```

---

## 9. Out of Scope (Current Version)

- Multi-account UI (account switcher, account management screen)
- Message retention / cleanup policy
- Multiple group monitoring per account
- Custom delivery channels (Telegram, Home Assistant, email)
- Authentication / access control on the web UI
- Mobile-optimized UI

---

## 10. Future Requirements

### FR1 — Multi-Account Support
The system is designed to support multiple WhatsApp accounts (e.g. a second account for another family member). This is **guaranteed to be implemented** and the following architectural commitments are made now:

- All database rows carry `account_id` from day one.
- Session files are stored under `sessions/<accountId>/`.
- All scan profiles belong to an `account_id`.
- URL structure is fully account-scoped (`/accounts/:accountId/...`).
- `profiles.json` uses an `accounts[]` array.
- The UI currently hides account-switching but the routing supports it.

When implemented, adding a second account requires: a new account entry in config, a new session folder, and an account switcher in the nav. No schema or routing changes needed.

### FR2 — Multiple Groups per Account
Architecture should not hard-code single-group assumptions beyond the config layer.

### FR3 — Message Retention Policy
Configurable auto-cleanup of old messages and results from SQLite.

### FR4 — Additional Delivery Channels
Telegram bot, Home Assistant push notification, email.

### FR5 — Web UI Authentication
Basic auth or token-based access control for the web UI when exposed beyond the local network.

---

*End of document.*
