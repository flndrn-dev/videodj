# Admin Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the central operations dashboard for videoDJ.Studio at admin.videodj.studio — covering Ghost monitoring, Linus analytics, system health, user management (beta testers), support (tickets + live chat), dev zone (kanban), and finance (Mavi Pay/Stripe).

**Architecture:** Next.js 16 + React 19 app in the monorepo at `admin/`. Uses Convex as the real-time database for all dashboard data. NextAuth with email magic links (via Resend) for authentication. Connects to Ghost Server API for monitoring data. Dark theme matching the DJ app aesthetic (`#14141f` background, `#ffff00` brand yellow).

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Shadcn UI, Framer Motion, lucide-animated, Convex (real-time DB), NextAuth (email magic link), Resend (transactional email), Stripe SDK (Mavi Pay integration).

---

## File Structure

```
admin/
├── app/
│   ├── layout.tsx                          # Root layout — dark theme, sidebar nav, auth wrapper
│   ├── page.tsx                            # Dashboard home — overview cards, key metrics
│   ├── auth/
│   │   ├── signin/page.tsx                 # Magic link sign-in
│   │   └── verify/page.tsx                 # Email verification landing
│   ├── ghost/
│   │   └── page.tsx                        # Ghost panel — heartbeat, errors, fixes, KB, notifications
│   ├── linus/
│   │   └── page.tsx                        # Linus panel — chat history, API usage, model config, commands
│   ├── system/
│   │   └── page.tsx                        # System panel — VPS health, Ollama, instances, streams
│   ├── users/
│   │   └── page.tsx                        # User management — invite, tiers, enable/disable, sessions
│   ├── support/
│   │   ├── page.tsx                        # Support tickets list
│   │   └── [ticketId]/page.tsx             # Single ticket view + reply thread
│   ├── devzone/
│   │   └── page.tsx                        # Kanban board — ideas, features, roadmap
│   ├── finance/
│   │   └── page.tsx                        # Finance — revenue, subscriptions, refunds, payouts
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts     # NextAuth API route
│   │   ├── ghost/route.ts                  # Proxy to Ghost Server API
│   │   ├── system/route.ts                 # VPS health check endpoints
│   │   └── support/
│   │       ├── route.ts                    # Support ticket CRUD
│   │       └── chat/route.ts               # Live chat WebSocket
│   └── hooks/
│       ├── useGhostHealth.ts               # Poll Ghost Server health
│       └── useSystemHealth.ts              # Poll VPS metrics
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx                     # Left sidebar navigation
│   │   ├── Header.tsx                      # Top bar — user avatar, notifications bell
│   │   └── AuthGate.tsx                    # Role-based access wrapper
│   ├── ghost/
│   │   ├── Heartbeat.tsx                   # Pulsing green/amber/red indicator
│   │   ├── ErrorLog.tsx                    # Filterable error table
│   │   ├── FixHistory.tsx                  # Fix attempts timeline
│   │   ├── KnowledgeBase.tsx               # KB browser with search
│   │   └── NotificationLog.tsx             # Email + Telegram log
│   ├── linus/
│   │   ├── ConversationHistory.tsx         # Chat session browser
│   │   ├── ApiUsageChart.tsx               # Request count, tokens, response time
│   │   ├── ModelConfig.tsx                 # Provider/model switcher
│   │   └── CommandStats.tsx                # Slash command usage chart
│   ├── system/
│   │   ├── VpsHealth.tsx                   # CPU/RAM/disk gauges
│   │   ├── OllamaStatus.tsx               # Model loaded, queue, response time
│   │   ├── AppInstances.tsx                # Connected sessions
│   │   └── StreamMonitor.tsx               # Active RTMP streams
│   ├── users/
│   │   ├── UserTable.tsx                   # User list with role/status
│   │   ├── InviteModal.tsx                 # Invite by email + set role
│   │   └── AccessTierBadge.tsx             # admin/support/beta/subscriber badge
│   ├── support/
│   │   ├── TicketList.tsx                  # Ticket table with status filters
│   │   ├── TicketThread.tsx                # Message thread for a ticket
│   │   ├── LiveChat.tsx                    # Real-time chat widget
│   │   └── AssignAgent.tsx                 # Assign support agent to ticket
│   ├── devzone/
│   │   ├── KanbanBoard.tsx                 # Drag-and-drop columns
│   │   ├── KanbanCard.tsx                  # Individual idea/feature card
│   │   └── NewIdeaModal.tsx                # Create new idea
│   ├── finance/
│   │   ├── RevenueChart.tsx                # Daily/weekly/monthly revenue
│   │   ├── SubscriptionTable.tsx           # Active subscriptions
│   │   ├── TransactionLog.tsx              # All transactions
│   │   └── PayoutSummary.tsx               # Stripe payout history
│   └── ui/                                 # Shadcn components (button, card, table, etc.)
├── lib/
│   ├── auth.ts                             # NextAuth config — magic link + Resend
│   ├── convex.ts                           # Convex client setup
│   └── stripe.ts                           # Stripe/Mavi Pay SDK wrapper
├── convex/
│   ├── schema.ts                           # Convex schema — users, tickets, devzone, etc.
│   ├── users.ts                            # User management mutations/queries
│   ├── tickets.ts                          # Support ticket mutations/queries
│   ├── devzone.ts                          # Kanban board mutations/queries
│   └── auth.ts                             # Auth-related Convex functions
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── Dockerfile
└── docker-compose.yml
```

---

## TIER 6: Admin Dashboard

### Phase 1 — Project Scaffold + Auth System

- [ ] **6.1 Initialize admin workspace** — Add `admin/` to monorepo workspaces, `npm init`, install Next.js 16, React 19, Tailwind v4, Shadcn, Framer Motion, lucide-animated
- [ ] **6.2 Next.js config** — `next.config.ts` with standalone output, port 3050, CORS for ghost.videodj.studio
- [ ] **6.3 Convex setup** — Install Convex, create project, define initial schema (users table with role, email, status, invitedAt, lastActive)
- [ ] **6.4 NextAuth + Resend magic link** — Email-only auth, no OAuth. Resend sends magic link from `noreply@videodj.studio`. Session includes user role from Convex.
- [ ] **6.5 Auth middleware** — Role-based route protection: admin = all routes, support_agent = /support only, reject all others
- [ ] **6.6 Layout shell** — Root layout with dark theme (`#14141f`), left sidebar nav (Ghost, Linus, System, Users, Support, Dev Zone, Finance), top header with user avatar + role badge + sign out
- [ ] **6.7 Dashboard home page** — Overview cards: Ghost status (heartbeat), active users, open tickets, today's revenue, system health summary. All cards link to their respective panels.
- [ ] **6.8 Dockerfile + docker-compose** — Production build, Traefik labels for admin.videodj.studio

### Phase 2 — Ghost Panel

- [ ] **6.9 Ghost health hook** — `useGhostHealth.ts` polls `ghost.videodj.studio/health` every 10s, returns status/uptime/connections/KB size
- [ ] **6.10 Heartbeat component** — Animated pulse (green/amber/red) with uptime counter, active connections count
- [ ] **6.11 Error log** — Fetches from `ghost.videodj.studio/knowledge/telemetry`, filterable table (severity, component, date range), search by error message
- [ ] **6.12 Fix history** — Timeline view of all fix attempts from telemetry log, color-coded (green=success, red=failed, yellow=pending), shows fix type and source (rules/KB/LLM)
- [ ] **6.13 Knowledge base browser** — Table of all KB entries from `ghost.videodj.studio/knowledge`, shows pattern, fix action, success rate, times seen, promoted status. Click to see full LLM analysis.
- [ ] **6.14 Notification log** — Table from `ghost.videodj.studio/knowledge/notifications`, shows channel (email/telegram), trigger type, message, timestamp

### Phase 3 — System Panel

- [ ] **6.15 VPS health endpoint** — API route that SSHes to KVM4 (or reads `/proc`) to get CPU, RAM, disk, network stats
- [ ] **6.16 VPS health gauges** — Circular gauges for CPU, RAM, disk usage. Green < 70%, amber 70-90%, red > 90%
- [ ] **6.17 Ollama status** — Fetch from `localhost:11434/api/version` and `/api/ps`, show model loaded, running requests, uptime
- [ ] **6.18 App instances** — Fetch active WebSocket connections from Ghost Server, show session IDs, connection duration
- [ ] **6.19 Stream monitor** — Show active RTMP streams if any (from DJ app API), bitrate, uptime, platform

### Phase 4 — User Management

- [ ] **6.20 Convex users schema** — Table: id, email, name, role (admin/support_agent/beta_tester/subscriber), status (active/invited/disabled), invitedAt, lastActive, invitedBy
- [ ] **6.21 User table component** — Sortable/filterable table of all users, role badges (color-coded), status toggle, last active timestamp
- [ ] **6.22 Invite modal** — Form: email, role selector, optional name. Sends invite via Resend from `noreply@videodj.studio`. Creates user in Convex with status=invited.
- [ ] **6.23 Access control** — When user signs into app.videodj.studio, check Convex users table: exists + status=active → allow, otherwise → show "Contact admin for access" page
- [ ] **6.24 Bulk actions** — Select multiple users, bulk enable/disable/change role
- [ ] **6.25 Beta tester tracking** — Show which beta testers are actively using the app, last session, total sessions, bugs reported

### Phase 5 — Linus Panel

- [ ] **6.26 Linus data pipeline** — Ghost Server needs a new endpoint to store Linus conversation data. Add `/linus/conversations` and `/linus/stats` to Ghost Server API. DJ app agent route POSTs conversation summaries to Ghost Server after each exchange.
- [ ] **6.27 Conversation history browser** — Searchable list of all Linus sessions, click to see full thread, filter by user/date
- [ ] **6.28 API usage charts** — Line charts: requests/day, tokens/day, avg response time. Pie chart: provider breakdown (Claude vs Ollama vs mock)
- [ ] **6.29 Model config panel** — Show current provider/model, switch between providers (writes to DJ app .env via Ghost Server API), test connection button
- [ ] **6.30 Command stats** — Bar chart of most-used slash commands, success/failure rates per command

### Phase 6 — Support System

- [ ] **6.31 Convex tickets schema** — Table: id, subject, status (open/in_progress/resolved/closed), priority (low/medium/high/urgent), customerEmail, customerName, assignedTo, messages (array of {sender, text, timestamp, attachments}), createdAt, updatedAt
- [ ] **6.32 Inbound email handler** — API route that receives email webhooks from Resend (support@videodj.studio), creates ticket in Convex or appends to existing thread
- [ ] **6.33 Ticket list page** — Filterable table: status, priority, assigned agent, date range, search. Status badges color-coded. Click to open ticket.
- [ ] **6.34 Ticket thread view** — Full conversation thread, reply box with rich text, attach files. Reply sends email back to customer via Resend. Updates ticket in Convex.
- [ ] **6.35 Assign agent** — Dropdown to assign ticket to a support_agent user. Agent gets email notification.
- [ ] **6.36 Live chat widget (admin side)** — Real-time chat panel in support section. Shows active chat sessions from the customer-facing widget on the SaaS site. Agent can reply in real-time.
- [ ] **6.37 Live chat widget (customer side)** — Embeddable chat widget for videodj.studio and app.videodj.studio. Connects to admin via WebSocket. Falls back to creating a ticket if no agent is online.

### Phase 7 — Dev Zone (Kanban)

- [ ] **6.38 Convex devzone schema** — Table: id, title, description, column (ideas/todo/in_progress/testing/done), priority, tags, createdAt, updatedAt, createdBy
- [ ] **6.39 Kanban board** — 5 columns: Ideas → Todo → In Progress → Testing → Done. Drag-and-drop between columns (Framer Motion drag). Color-coded priority borders.
- [ ] **6.40 Card component** — Shows title, description preview, priority badge, tags, date. Click to expand with full description editor.
- [ ] **6.41 New idea modal** — Title, description (markdown), priority selector, tags input
- [ ] **6.42 Filters and search** — Filter by priority, tag, column. Search by title/description.

### Phase 8 — Finance (Mavi Pay / Stripe)

- [ ] **6.43 Stripe SDK setup** — Install `stripe` package, create `lib/stripe.ts` with Stripe client using Mavi Pay's Stripe keys. API routes for fetching data.
- [ ] **6.44 Revenue dashboard** — Line chart: daily revenue (last 30 days), weekly (last 12 weeks), monthly (last 12 months). Toggle between periods. Total revenue card.
- [ ] **6.45 Subscription table** — All active subscriptions: customer, plan, amount, start date, next billing, status. Filter by plan/status.
- [ ] **6.46 Transaction log** — All charges, refunds, payouts in chronological order. Filterable by type, date, amount. Export to CSV.
- [ ] **6.47 Payout summary** — Stripe payout history: amount, date, status, bank account. Upcoming payout estimate.
- [ ] **6.48 Key metrics cards** — MRR (Monthly Recurring Revenue), churn rate, ARPU (Average Revenue Per User), total customers, active trials

### Phase 9 — Database Management (Future)

- [ ] **6.49 DB connection panel** — When migrated from IndexedDB to PostgreSQL/Convex: show connection status, table sizes, row counts
- [ ] **6.50 Data browser** — Browse tables, search/filter records, edit individual records (admin only)
- [ ] **6.51 Backup/restore** — Trigger DB backups, view backup history, restore from backup
- [ ] **6.52 Migration tools** — Import data from IndexedDB exports, data validation, duplicate detection

### Phase 10 — Deploy

- [ ] **6.53 Build and push** — Build Docker image, push to GitHub, deploy via docker-compose on KVM4
- [ ] **6.54 Traefik routing** — SSL via Let's Encrypt for admin.videodj.studio
- [ ] **6.55 Convex production** — Deploy Convex to production, configure environment variables
- [ ] **6.56 Smoke test** — Verify all panels load, auth works, Ghost data flows, Telegram/email notifications work

---

## Access Roles

| Role | Dashboard Access | App Access |
|---|---|---|
| `admin` | All sections | Full access |
| `support_agent` | Support section only | No app access |
| `beta_tester` | No dashboard access | Full app access (free) |
| `subscriber` | No dashboard access | Full app access (paid, future) |

---

## Design System

- **Background:** `#14141f` (matches DJ app)
- **Borders:** `#2a2a3e`
- **Text:** `#e8e8f2`
- **Brand yellow:** `#ffff00` (accents, active states)
- **Success:** `#22c55e` (green)
- **Warning:** `#f59e0b` (amber)
- **Error:** `#ef4444` (red)
- **Deck A blue:** `#45b1e8` (used for certain charts/indicators)
- **Linus green:** `#afff92` (Linus panel accent)
- **Ghost purple:** `#a78bfa` (Ghost panel accent)

Each panel section has its own accent color for visual distinction in the sidebar and headers.

---

## Data Sources

| Panel | Data Source |
|---|---|
| Ghost | Ghost Server API (`ghost.videodj.studio`) — REST endpoints |
| Linus | Ghost Server API (new endpoints to add) + DJ app agent route |
| System | Direct SSH/API to KVM4, Ollama localhost API |
| Users | Convex database |
| Support | Convex database + Resend webhooks |
| Dev Zone | Convex database |
| Finance | Stripe API (via Mavi Pay keys) |
| DB Management | Direct database connection (future) |

---

## Build Order Rationale

1. **Scaffold + Auth first** — everything depends on authentication and role-based access
2. **Ghost panel** — data is already flowing from the deployed Ghost Server
3. **System panel** — quick wins, mostly reading server metrics
4. **User management** — needed before beta testers can use the app
5. **Linus panel** — requires adding endpoints to Ghost Server
6. **Support** — needed before public launch
7. **Dev Zone** — internal tool, lower priority
8. **Finance** — depends on Mavi Pay going live (~1 week)
9. **DB Management** — future, when migrating from IndexedDB
10. **Deploy** — after core panels are built
