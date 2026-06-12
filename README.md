# TaxFlow Pro

**Offline Income Tax Return Filing Software for CA Firms**

A desktop application built with Electron + Next.js for Indian CA firms to manage client ITR filings entirely offline, with an encrypted credential vault and full audit trail.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 29 |
| Renderer UI | Next.js 14 + TypeScript |
| Database | SQLite via Prisma ORM |
| Vault | AES-256-GCM + PBKDF2 (Node.js `crypto`) |
| Styling | Pure CSS (no UI framework) |
| State | Zustand |

---

## Prerequisites

- **Node.js** 18 or higher (`node -v` to check)
- **npm** 9 or higher
- **Git**
- macOS, Windows 10+, or Ubuntu 20.04+ (64-bit)

---

## First-Time Setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/taxflow-pro.git
cd taxflow-pro
npm install
cd renderer && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set `VAULT_SALT` to a fresh random hex string:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output as the value of `VAULT_SALT`.

> ⚠️ **Important:** Once the vault is created, never change `VAULT_SALT`. Doing so makes all encrypted portal passwords unreadable.

### 3. Generate Prisma client

```bash
npx prisma generate
```

### 4. Run database migrations

```bash
npx prisma migrate dev --name init
```

---

## Running in Development

```bash
bash scripts/dev.sh
```

This script:
1. Checks `.env` (copies from `.env.example` if missing)
2. Installs dependencies if `node_modules` is absent
3. Runs Prisma migrations
4. Seeds the database with sample firm + clients (if empty)
5. Starts Next.js renderer on `localhost:3000`
6. Starts Electron once renderer is ready

### Flags

| Flag | Effect |
|---|---|
| `--reset` | Drop and recreate the SQLite database before starting |
| `--no-seed` | Skip the seed step even if DB is empty |

```bash
# Fresh start (wipes all data)
bash scripts/dev.sh --reset

# Start without seeding
bash scripts/dev.sh --no-seed
```

### Dev login credentials (after seed)

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `DevPassword@123` |
| Vault master password | `DevPassword@123` |

---

## Project Structure

```
taxflow-pro/
├── electron/
│   ├── main/
│   │   ├── index.ts          # Electron entry, window management
│   │   ├── database.ts       # Prisma init, migration runner
│   │   ├── vault.ts          # AES-256-GCM credential vault
│   │   ├── logger.ts         # Structured file logger
│   │   ├── utils/
│   │   │   └── appDirs.ts    # Platform data/log directory paths
│   │   └── ipc/
│   │       ├── authHandlers.ts
│   │       ├── clientHandlers.ts
│   │       ├── returnHandlers.ts
│   │       ├── documentHandlers.ts
│   │       └── settingsHandlers.ts
│   └── preload/
│       └── preload.ts        # Context bridge (window.taxflow API)
├── renderer/                 # Next.js app
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── components/
│   │       ├── auth/         # SetupWizard, UnlockScreen
│   │       ├── layout/       # AppShell, Sidebar, Topbar
│   │       ├── dashboard/    # Dashboard
│   │       ├── clients/      # ClientList, ClientDetail, ClientForm
│   │       └── common/       # StatusBadge, ConfirmDialog
│   ├── lib/
│   │   ├── electron.d.ts     # window.taxflow type declarations
│   │   ├── formatters.ts     # Currency, date, AY formatters
│   │   └── validators.ts     # PAN, Aadhaar, form validators
│   ├── store/
│   │   ├── authStore.ts
│   │   └── clientStore.ts
│   ├── styles/
│   │   └── globals.css       # Design system CSS variables + classes
│   └── next.config.js
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── shared/
│   ├── types/index.ts        # Shared TypeScript types
│   └── utils/panUtils.ts     # PAN/TAN utilities
├── scripts/
│   └── dev.sh
├── data/                     # SQLite DB lives here (gitignored)
├── .env.example
└── package.json
```

---

## IPC API Reference

All renderer ↔ main communication goes through `window.taxflow.*` (defined in `preload.ts`).

### Auth

```typescript
window.taxflow.auth.isSetupRequired()        // → { required: boolean }
window.taxflow.auth.setup(payload)           // Create firm + admin + vault
window.taxflow.auth.unlock(masterPassword)   // Unlock vault
window.taxflow.auth.lock()                   // Lock vault
window.taxflow.auth.login(username, password)
window.taxflow.auth.getFirmInfo()
```

### Clients

```typescript
window.taxflow.clients.list(filters?)
window.taxflow.clients.get(id)
window.taxflow.clients.create(data)
window.taxflow.clients.update(id, data)
window.taxflow.clients.delete(id)
window.taxflow.clients.getPortalPassword(clientId)  // Requires vault unlock
window.taxflow.clients.addBankAccount(clientId, data)
window.taxflow.clients.dashboardStats()
```

### Returns

```typescript
window.taxflow.returns.create(data)
window.taxflow.returns.get(id)
window.taxflow.returns.listForClient(clientId)
window.taxflow.returns.updateStatus(id, status)
window.taxflow.returns.upsertSalary(returnId, data)
window.taxflow.returns.upsertOtherSources(returnId, data)
window.taxflow.returns.upsertDeductions(returnId, data)
window.taxflow.returns.addTds(returnId, entry)
window.taxflow.returns.addTaxPayment(returnId, payment)
window.taxflow.returns.getAssessmentYears(clientId)
```

### Documents

```typescript
window.taxflow.documents.upload(clientId, filePath, metadata)
window.taxflow.documents.list(clientId)
window.taxflow.documents.open(documentId)
window.taxflow.documents.delete(documentId)
```

### Settings

```typescript
window.taxflow.settings.get(key)
window.taxflow.settings.getAll()
window.taxflow.settings.set(key, value)
window.taxflow.settings.updateFirm(data)
```

---

## Design System

All UI tokens are in `renderer/styles/globals.css`. Never use inline colour values.

| Token | Value |
|---|---|
| `--bg-base` | `#0D1117` — page background |
| `--bg-surface` | `#161B22` — cards, sidebar |
| `--bg-elevated` | `#1E2530` — inputs, elevated cards |
| `--brand-primary` | `#D4A017` — amber gold, buttons |
| `--brand-text` | `#F0C040` — brand text on dark |

Key utility classes: `btn`, `btn-primary`, `btn-secondary`, `btn-danger`, `card`, `card-elevated`, `form-input`, `form-group`, `data-table`, `badge-*`, `stat-card`, `empty-state`, `pan-field`, `amount`, `spinner`

---

## Architecture Rules

1. **IPC only** — renderer never touches the filesystem or DB directly.
2. **Dev mock fallback** — every component checks `typeof window.taxflow === 'undefined'` and uses mock data in browser-only dev.
3. **Vault gate** — `getPortalPassword` and any password read requires the vault to be unlocked first.
4. **PAN uppercase** — always stored and displayed uppercase; `panUtils.ts` for parsing.
5. **Currency** — always `toLocaleString('en-IN')` + `₹` prefix + `.amount` CSS class.
6. **No UI libraries** — no MUI, Ant Design, Chakra, shadcn. Pure CSS from `globals.css`.
7. **Navigation** — all navigation via `onNavigate(page: AppPage)` prop; no `router.push()` inside components.

---

## Building for Production

```bash
# Build renderer
cd renderer && npm run build && cd ..

# Package Electron app
npm run build         # Compiles electron/main with tsc
npm run dist          # electron-builder packages to dist/
```

Output installers will be in `dist/`:
- macOS: `.dmg`
- Windows: `.exe` (NSIS installer)
- Linux: `.AppImage`

---

## Database Management

```bash
# Open Prisma Studio (visual DB browser)
npx prisma studio

# Reset DB (dev only)
npx prisma migrate reset

# Apply schema changes
npx prisma migrate dev --name describe_your_change

# Re-seed only
npx ts-node prisma/seed.ts
```

---

## Logs

Application logs are written to the platform data directory:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/TaxFlow Pro/logs/` |
| Windows | `%APPDATA%\TaxFlow Pro\logs\` |
| Linux | `~/.config/TaxFlow Pro/logs/` |

Log level is controlled by `LOG_LEVEL` in `.env` (`error` / `warn` / `info` / `debug`).

---

## Security Notes

- All portal passwords are encrypted with AES-256-GCM before being stored in SQLite.
- The vault key is derived from the master password using PBKDF2 (SHA-512, 600,000 iterations by default).
- The master password is never stored anywhere — only a salted hash of the user login password is stored in the DB.
- Every sensitive action (client password view, portal login, bulk export) is recorded in the `AuditLog` table.
- The SQLite database file is stored in the OS user data directory, not the app bundle.

---

## Phase Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Setup, Client Master, Dashboard, Credential Vault | ✅ Complete |
| 2 | Return filing — Salary, House Property, Other Sources, Deductions | Planned |
| 3 | TDS entry, Tax payments, Form 26AS reconciliation | Planned |
| 4 | Document management, PDF generation | Planned |
| 5 | Portal automation (ITD e-filing), Acknowledgement tracking | Planned |

---

*TaxFlow Pro — Built for Indian CA firms. Offline. Secure. Fast.*
