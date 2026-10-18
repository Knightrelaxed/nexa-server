# N.E.X.A Ecosystem — Complete Architecture & File Tree

> **Document:** `docs/NEXA_FOLDER_ARCHITECTURE.md`  
> **Ecosystem:** N.E.X.A 3.4 (Sovereign Cloud Core, Finance Web Portal, Mobile Hardware Bridge, US Gemini Proxy & Universal CLI)  
> **Last Updated:** 2026-10-19  
> **Format:** Comprehensive Plain-Text ASCII Tree with Deep Functional Annotations  

---

## 1. N.E.X.A SERVER ARCHITECTURE (Node.js Sovereign Core)
* **Local Path:** `C:\workspace\nexa-server`
* **Production Host:** Azure Central Indonesia VPS (`/home/nexa/nexa-server`)
* **Role:** Sovereign Cognitive Core, Multi-Model Router, Database Ledger, Realtime Relays & Background Services
* **Current Version:** v3.4.0 (`src/config/version.js`)

```text
nexa-server/
├── Dockerfile                            # Production container build specification
├── .dockerignore                         # Docker build artifact exclusion rules
├── .gitignore                            # Git repository ignore rules
├── ecosystem.config.js                   # PM2 process manager configuration (VPS deployment)
├── package.json                          # Main project manifest & production dependencies (v3.4.0)
├── package-lock.json                     # Deterministic dependency lockfile
├── README.md                             # Repository overview & quick start guide
├── .env.example                          # Blueprint environment variable template
│
├── cloudflare-worker/                    # Cloudflare Edge Relay Subsystem
│   ├── nexa-relay.js                     # Edge proxy worker for Telegram Bot API & media processing
│   └── wrangler.toml                     # Cloudflare Worker deployment configuration
│
├── data/                                 # Local Storage & Snapshot Datastore
│   ├── facts_vectors.json                # In-memory snapshot of pgvector memory embeddings
│   └── transcripts_dump/                 # Raw conversation transcripts & session archives
│
├── database/                             # Database Migrations & Supabase PostgreSQL Schemas
│   ├── app_limits_migration.sql          # Screen time & application usage discipline rules
│   ├── budget_schema.sql                 # Expense categories, balances & budget tracking tables
│   ├── migration_daily_narratives.sql    # Daily cognitive narrative & identity evolution logs
│   ├── migration_directives_counters_v3_3_2.sql # Behavioral directives & runtime execution counters
│   ├── migration_enable_all_nexa_rls.sql # Comprehensive Row Level Security (RLS) hardening
│   ├── migration_enable_rls.sql          # Base RLS security policies
│   ├── migration_learning_loop_v3_3.sql  # Micro-reviewer cognitive reflection & feedback schema
│   ├── migration_learning_loop_v3_3_1.sql # Learning loop counter & schema refinements
│   ├── migration_notifier_recurring.sql  # Scheduled notifications & recurring task triggers
│   ├── migration_settings.sql            # Core assistant settings & user configuration store
│   ├── migration_split_transaction.sql   # Shared expense & transaction splitting ledger
│   ├── phase6_migration.sql              # Cognitive Identity, Mood Time-Series & Dual Memory tables
│   ├── phase7_migration.sql              # Causal Knowledge Graph & dynamic self-inference schema
│   ├── phase8_discipline_state_migration.sql # Screen lock, god-mode & discipline enforcement states
│   ├── schema.sql                        # Base consolidated PostgreSQL schema
│   ├── seed_phase9_core_identity.sql     # Seed data for core persona traits & executive identity
│   ├── seed_phase10_cron_architecture.sql # Seed configuration for scheduled cron tasks
│   └── whatsapp_and_platform_migration.sql # Multi-platform ingress & WhatsApp session tables
│
├── docs/                                 # Architecture Whitepapers & Documentation
│   ├── CORE_IDENTITY_AUDIT_REPORT.md     # Persona integrity & identity verification report
│   ├── GOOGLE_MASTER_OAUTH2_ARCHITECTURE_PLAN.md # Centralized OAuth2 token infrastructure
│   ├── JSON_PROTOCOL_SPECIFICATION.md    # Bidirectional WebSocket schema (Nexa Protocol 3.0)
│   ├── MOBILE_BRIDGE_TESTING_REPORT.md   # Sensor latency & hardware test logs
│   ├── NEXA_AZURE_VPS_PRODUCTION_ARCHITECTURE.md # Sovereign VPS Jakarta deployment whitepaper
│   ├── nexa_core_identity_dump_231.json  # Comprehensive persona trait snapshot & embeddings dump
│   ├── NEXA_FOLDER_ARCHITECTURE.md       # This complete ecosystem folder directory tree
│   ├── NEXA_MOBILE_BRIDGE_DOCUMENTATION.md # Complete Android bridge technical documentation
│   ├── NEXA_ORACLE_CLOUD_MIGRATION_PLAN.md # Secondary cloud disaster recovery plan
│   ├── NEXA_SECURITY_ARCHITECTURE_AND_HARDENING.md # Comprehensive security hardening guide
│   ├── NEXA_VERSION_EVOLUTION_ROADMAP.md # Version evolution & release milestone roadmap (v1.0 - v3.4.0)
│   ├── NEXA_Whitepaper.md                # General N.E.X.A architecture whitepaper (v3.4.0)
│   ├── PHASE6_DUAL_MEMORY_SYSTEM.md      # Dual-memory (Episodic + Semantic) architectural design
│   ├── PHASE_4_ADVANCED_WORKFLOW.md      # Autonomous background workflows & task chains
│   ├── PHASE_5_NEXA_V3_WEB_UI.md         # Web portal frontend specifications
│   └── PHASE_6_COGNITIVE_IDENTITY_ENGINE.md # Cognitive user modeling & identity inference engine
│
├── logs/                                 # Runtime application logs (PM2 / Express)
│
├── nexa-finance-web/                     # Next.js Sovereign Financial Web Portal (Arsitektur Terpisah di Bagian 2)
│
├── Plan/                                 # Architectural Blueprint & Engineering Challenges
│   ├── MODEL_BACKUP_GUIDE.md             # Multi-tier AI model failover guidelines
│   └── VPS_DEPLOYMENT_CHALLENGES.md      # Documented solutions for VPS networking & proxy quirks
│
├── scripts/                              # Maintenance, Migrations & Diagnostic Utilities
│   ├── audit_codebase.js                 # AST codebase scanner & dependency auditor
│   ├── audit_prompt_memory_efficiency.js # Memory token consumption & prompt bloat profiler
│   ├── backfill_directives.js            # Behavioral directives backfill utility (tested by directive_utils)
│   ├── clean_bad_memories.js             # Supabase memory hygiene & corrupted fact cleaner
│   ├── generate_google_master_token.js   # OAuth2 refresh token generator for Google APIs
│   ├── generate_vector_snapshot.js       # Disk-to-Supabase vector embedding synchronizer
│   └── trigger_weekly.js                 # Manual runner for weekly cognitive synthesis
│
├── tests/                                # Automated Unit Test Suites & Active Diagnostics
│   ├── cli_adapter.test.js               # Unit tests: CLI ingress adapter & multi-turn prompts
│   ├── common_handlers.test.js           # Unit tests: Shared domain intent handlers (15 bank cases, escaping)
│   ├── day_simulation.test.js            # Unit tests: Full 24-hour simulation (Briefing to Midnight)
│   ├── directive_utils.test.js           # Unit tests: Behavioral directive parsing & counter increments
│   ├── identity_directive_flow.test.js   # Unit tests: Dynamic persona directives & alignment flow
│   ├── micro_reviewer.test.js            # Unit tests: Micro-reviewer cognitive reflection & feedback loops
│   ├── playbook_counters.test.js         # Unit tests: Behavioral playbook counters & limits
│   ├── playbook_engine.test.js           # Unit tests: Playbook engine rules & conditional SOPs
│   ├── reviewer_resilience.test.js       # Unit tests: Reviewer engine fallback & fault tolerance
│   ├── signal_detector.test.js           # Unit tests: Real-time behavioral signal detector
│   ├── telegram_adapter.test.js          # Unit tests: Telegram adapter, action builders & callbacks
│   ├── test_all_crons.js                 # Diagnostic: Autonomous runner for all scheduled crons
│   ├── test_cf_relay_live.js             # Diagnostic: Cloudflare Edge relay live connectivity tester
│   ├── test_google_master_client.js      # Diagnostic: Google OAuth2 master client validator
│   ├── test_midnight_screen_trigger.js   # Evaluation: Midnight screen time trigger test
│   ├── topic_classifier.test.js          # Classification: Topic classification & fast prompt router
│   ├── upgrade.test.js                   # Migration: Schema upgrade & database integrity validator
│   └── version.test.js                   # Verification: Centralized version resolver & git SHA tests
│
├── tools/                                # Command Line & Developer Tools
│   ├── chat_cli.js                       # Interactive CLI terminal for talking to N.E.X.A
│   ├── get_gmail_token.js                # Interactive CLI for Gmail OAuth2 authentication
│   ├── get_tasks_token.js                # Interactive CLI for Google Tasks OAuth2 authentication
│   └── get_universal_token.js            # Unified Google Workspace token retriever
│
├── vercel-relay/                         # Vercel Serverless Failover Relay
│   ├── vercel.json                       # Vercel serverless routing & function timeout config
│   └── api/                              # Edge functions proxying Telegram & external webhooks
│       ├── relay.js                      # Inbound webhook relay function
│       ├── sendAction.js                 # Outbound Telegram action proxy
│       ├── transcribe.js                 # Audio transcription proxy
│       └── vision.js                     # Multimodal vision proxy
│
└── src/                                  # Main Backend Application Source Code
    ├── app.js                            # Express app setup, strict security headers, CORS & loopback
    │
    ├── config/                           # Environment, Persona & Version Configuration
    │   ├── env.js                        # Validated environment variable loader
    │   ├── model_backup_plan.json        # Dynamic fallback parameters & retry quotas
    │   ├── personality.js                # Master executive identity prompt & behavior boundaries
    │   └── version.js                    # Centralized version definition (v3.4.0) & Git SHA resolver
    │
    ├── core/                             # Core Cognitive & Inference Engines (9 Subsystems)
    │   ├── AI_Router.js                  # Master Cognitive Brain, Intent Classifier & Prompt Fusion
    │   ├── Fallback_Engine.js            # SACR v2.4 (15-Tier Dual-Mode Dynamic Fallback Router)
    │   ├── Live_Tool_Registry.js         # Function calling & Agent Tool execution catalog
    │   ├── Live_Voice_Engine.js          # Bidirectional real-time Gemini Live WebSocket relay
    │   ├── Notifier.js                   # Cross-channel proactive notification dispatcher & queue manager
    │   ├── Provider_Health.js            # Dynamic API health check, circuit breaker & failover tracker
    │   ├── Topic_Classifier.js           # Fast intent/topic classification & prompt template selector
    │   ├── Vision_Engine.js              # Multimodal visual analysis & OCR engine
    │   └── Voice_Engine.js               # Groq Whisper audio transcription engine
    │
    ├── domain/                           # Business Domain & Behavioral Engines (23 Engines)
    │   ├── Agenda_Manager.js             # Google Calendar schedule synchronizer & conflict detection
    │   ├── Anticipatory_Engine.js        # Proactive agency & anticipatory nudging engine
    │   ├── App_Discipline_Engine.js      # App usage evaluator, screen time limiter & app locks
    │   ├── Behavior_Engine.js            # Mood time-series & habit tracking engine
    │   ├── Budget_Engine.js              # Expense limit & financial balance tracker
    │   ├── Chrono_Consolidator.js        # Chronological context synthesizer & temporal timeline builder
    │   ├── Device_Control_Engine.js      # Remote hardware orchestration & Android bridge command emitter
    │   ├── Dialectic_Engine.js           # Dialectic reasoning, cognitive debate & counter-argument synthesis
    │   ├── Discipline_GodMode.js         # Strict focus & god-mode disciplinary rules enforcement
    │   ├── Episodic_Recall.js            # Long-term episodic memory RAG & semantic retrieval
    │   ├── Finance_Engine.js             # Financial transaction processor & double-entry logic
    │   ├── Finance_Intel.js              # Financial intelligence, spending pattern heuristics & anomaly detection
    │   ├── Inference_Engine.js           # Psychological trait & user pattern inferrer
    │   ├── Intelligence_Brief.js         # Morning Briefing, Midnight & Evening brief synthesizer
    │   ├── Intention_Engine.js           # Short & long-term commitments tracker
    │   ├── Location_Orchestrator.js      # Presence context, spatial reasoning & location queries
    │   ├── Memory_Hygiene_Engine.js      # Memory deduplication, decay manager & knowledge prune
    │   ├── Micro_Reviewer.js             # Micro-reviewer cognitive reflection, output quality critic & guardrails
    │   ├── Playbook_Engine.js            # Behavioral playbooks, conditional execution & contextual SOPs
    │   ├── Presence_Model.js             # User physical presence, device state & focus mode estimator
    │   ├── Signal_Detector.js            # Real-time behavioral signal detector & emotional state cue parser
    │   ├── Split_Engine.js               # Shared expense calculation & debt settlement ledger
    │   └── Task_Manager.js               # Google Tasks integration, task prioritization & overdue detector
    │
    ├── infrastructure/                   # External Services & Database Adaptations
    │   ├── Gmail_Client.js               # Gmail auto-sync (Mandiri transaction detection)
    │   ├── Google_Master_Client.js       # Centralized Google API OAuth2 client
    │   ├── Google_Tasks.js               # Google Tasks REST API client
    │   ├── Google_Workspace.js           # Google Calendar & Workspace integration
    │   ├── Location_Engine.js            # Reverse geocoding & coordinates resolver
    │   ├── Notion_Client.js              # Notion workspace sync (notes & database)
    │   ├── Supabase_Finance.js           # Supabase PostgreSQL financial ledger client
    │   ├── Supabase_Memories.js          # Supabase pgvector memory store & episodic facts
    │   └── Web_Search.js                 # Real-time web search crawler
    │
    ├── interfaces/                       # Ingress & Egress Channels (Modular Ingress Architecture v3.4.0)
    │   ├── cron.js                       # Autonomous cron scheduler (Briefings, Night check-ins, Habits)
    │   ├── webhook.js                    # Inbound webhook router & Telegram dispatcher
    │   │
    │   ├── common/                       # Shared Cross-Channel Ingress Subsystem
    │   │   ├── domain_dispatcher.js      # Unified intent dispatcher orchestrating domain handlers
    │   │   ├── follow_up_resolver.js     # Unified multi-turn follow-up resolver & clarification validator
    │   │   ├── helpers.js                # Multi-format currency parser, HTML escaping & formatters
    │   │   └── handlers/                 # Extracted Common Domain Intent Handlers
    │   │       ├── calendar_handler.js   # Agenda/Calendar intent orchestration & state retention
    │   │       ├── database_handler.js   # Dynamic database query, write & safe delete handlers
    │   │       ├── email_handler.js      # Gmail search, send, trash & platform-safe HTML escaping
    │   │       ├── finance_handler.js    # Financial tracking, splitting & account balances
    │   │       ├── memory_handler.js     # Episodic memory, 2nd brain vault & semantic recall
    │   │       ├── system_handler.js     # Core system diagnostics, presence, discipline & location
    │   │       └── task_handler.js       # Google Tasks CRUD & status synchronization
    │   │
    │   ├── cli/                          # Command Line Interface (Debug & Terminal Channel)
    │   │   ├── adapter.js                # CLI WebSocket/terminal communication adapter
    │   │   ├── intent_dispatcher.js      # CLI-specific intent routing & context binding
    │   │   └── interceptors.js           # CLI interceptors (Database confirmation & multi-turn flows)
    │   │
    │   ├── gmail/                        # Email Webhook & Polling Channel
    │   │   └── adapter.js                # Automated Gmail synchronization & transaction trigger
    │   │
    │   ├── mobile_bridge/                # Android Smartphone Hardware Gateway
    │   │   ├── adapter.js                # Master Neural-Peripheral Adapter & event handler
    │   │   └── MobileBridge_WS.js        # High-resilience WebSocket server (/ws), auth & ping watchdog
    │   │
    │   ├── telegram/                     # Telegram Bot User Interface Channel
    │   │   ├── actions.js                # Interactive keyboard callback actions & safe HTML builders
    │   │   ├── adapter.js                # Core Telegram ingress/egress adapter & formatting
    │   │   ├── callback_handler.js       # Inline keyboard button click router
    │   │   ├── command_handler.js        # Telegram slash commands handler (/start, /status, /help)
    │   │   ├── intent_dispatcher.js      # Telegram intent delegator to common domain dispatcher
    │   │   ├── interceptors.js           # Contextual interceptors (Check-ins, confirmations, database)
    │   │   ├── media_handler.js          # Inbound voice, photo, audio & document processor
    │   │   └── vault_handler.js          # Obsidian / 2nd Brain vault ingestion handler
    │   │
    │   └── whatsapp/                     # WhatsApp Integration Gateway (Backup Channel)
    │       ├── adapter.js                # Baileys WhatsApp client adapter
    │       ├── auth_storage.js           # Multi-device session authentication storage
    │       ├── formatter.js              # Markdown-to-WhatsApp text formatter
    │       └── README.md                 # Setup & pairing documentation
    │
    └── utils/                            # Shared Utilities & Network Security
        ├── directive_utils.js            # Directive parsing, counter increment & dynamic prompt injector
        ├── gemini_vector_cache.js        # In-memory vector embedding cache
        ├── logger.js                     # Structured colored asynchronous logger
        ├── security.js                   # Identity lock (Single Chat ID: 6798861902) & rate-limiting
        ├── telegram_network.js           # Resilient HTTP client with retry logic
        └── telegram_proxy.js             # Relay fallback & proxy route resolver
```

---

## 2. N.E.X.A FINANCE WEB ARCHITECTURE (Next.js 16 / React 19 / Tailwind / Supabase)
* **Local Path:** `C:\workspace\nexa-server\nexa-finance-web`
* **Target Runtime:** Node.js >= 18.0.0 (Next.js App Router)
* **Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Lucide React, Radix UI Primitives, Recharts, Supabase JS v2
* **Role:** Sovereign Financial Web Portal, Realtime Cashflow Dashboard, PWA Mobile Ledger & Analytics

```text
nexa-finance-web/
├── package.json                          # Next.js project manifest & dependencies (React 19, Supabase, Lucide)
├── package-lock.json                     # Deterministic lockfile
├── next.config.mjs                       # Next.js configuration (Webpack, optimization & security headers)
├── tsconfig.json                         # TypeScript compiler options & module resolution paths (@/*)
├── postcss.config.mjs                    # PostCSS plugin pipeline (@tailwindcss/postcss)
├── components.json                       # shadcn/ui design system configuration & tailwind prefix
├── middleware.ts                         # Edge routing middleware & authentication session guards
├── .npmrc                                # NPM package management flags
│
├── app/                                  # Next.js App Router (Routes & Server Components)
│   ├── layout.tsx                        # Root layout (Theme provider, Supabase provider, global toast)
│   ├── page.tsx                          # Root landing page & entry redirection logic
│   ├── globals.css                       # Global CSS variables, dark theme palette & base utilities
│   ├── icon.png                          # App favicon & browser tab branding icon
│   │
│   ├── accounts/                         # Financial Accounts Management Route
│   │   └── page.tsx                      # Bank accounts, e-wallets, cash balances & account detail drawer
│   │
│   ├── analytics/                        # Spending Analytics & Financial Intelligence Route
│   │   └── page.tsx                      # Cash flow charts, spending trends, category breakdown & monthly comparison
│   │
│   ├── budget/                           # Budget Planning & Limit Enforcement Route
│   │   └── page.tsx                      # Monthly budget allocations, group budgets & threshold progress bars
│   │
│   ├── dashboard/                        # Sovereign Executive Dashboard Route
│   │   └── page.tsx                      # Net worth overview, monthly velocity, quick transaction entry & summary cards
│   │
│   ├── login/                            # Authentication & Sovereign Access Route
│   │   └── page.tsx                      # Secure login portal & Supabase Auth session initialization
│   │
│   ├── records/                          # Complete Transaction Ledger Route
│   │   └── page.tsx                      # Full transaction history table, multi-parameter filtering & search
│   │
│   └── settings/                         # Configuration & Master Data Management Route
│       └── page.tsx                      # Account profiles, category hierarchies, wallet preferences & display settings
│
├── components/                           # Modular UI Component Library
│   ├── theme-provider.tsx                # NextThemes dark/light mode context provider
│   │
│   ├── providers/                        # Global Application State Providers
│   │   └── supabase-provider.tsx         # Supabase client context & real-time auth state listener
│   │
│   ├── settings/                         # Settings & Configuration Subcomponents
│   │   ├── settings-account-profile.tsx  # User profile & credentials management panel
│   │   ├── settings-accounts.tsx         # Master account catalog editor & account balance overrides
│   │   └── settings-categories.tsx       # Expense & income category hierarchy editor
│   │
│   ├── ui/                               # Atomic shadcn/ui Design Primitives (42 Components)
│   │   ├── accordion.tsx                 # Expandable collapsible panel
│   │   ├── alert-dialog.tsx              # Confirmation & destructive action modal
│   │   ├── alert.tsx                     # Inline contextual notification alert
│   │   ├── aspect-ratio.tsx              # Responsive media container
│   │   ├── avatar.tsx                    # User & account thumbnail avatar
│   │   ├── badge.tsx                     # Category status pill & intent label
│   │   ├── breadcrumb.tsx                # Hierarchical navigation breadcrumbs
│   │   ├── button-group.tsx              # Segmented action buttons container
│   │   ├── button.tsx                    # Primary, secondary, outline & ghost buttons
│   │   ├── calendar.tsx                  # Date picker & interactive monthly calendar
│   │   ├── card.tsx                      # Metric card & bordered panel container
│   │   ├── carousel.tsx                  # Swipeable horizontal card carousel
│   │   ├── chart.tsx                     # Recharts chart container & tooltip styling
│   │   ├── checkbox.tsx                  # Form checkbox toggle
│   │   ├── collapsible.tsx               # Minimalist accordion collapse
│   │   ├── command.tsx                   # Fast command palette & quick search dialog
│   │   ├── context-menu.tsx              # Right-click contextual action popup
│   │   ├── dialog.tsx                    # Centered modal dialog wrapper
│   │   ├── drawer.tsx                    # Mobile-friendly slide-over drawer (Vaul)
│   │   ├── dropdown-menu.tsx             # Action trigger dropdown menu
│   │   ├── empty.tsx                     # Zero-state placeholder illustration
│   │   ├── field.tsx                     # Form field container & label wrapper
│   │   ├── form.tsx                      # React Hook Form integration & validation
│   │   ├── hover-card.tsx                # Hover popover card for previews
│   │   ├── input-group.tsx               # Input with attached icon/button prefix
│   │   ├── input-otp.tsx                 # One-time pin & 2FA input boxes
│   │   ├── input.tsx                     # Text, number & currency input field
│   │   ├── item.tsx                      # Generic list item layout
│   │   ├── kbd.tsx                       # Keyboard shortcut indicator badge
│   │   ├── label.tsx                     # Accessible form field label
│   │   ├── menubar.tsx                   # Desktop menu bar component
│   │   ├── navigation-menu.tsx           # Primary top-level navigation bar
│   │   ├── pagination.tsx                # Ledger pagination controls
│   │   ├── popover.tsx                   # Floating popover panel
│   │   ├── progress.tsx                  # Horizontal budget limit progress bar
│   │   ├── radio-group.tsx               # Mutually exclusive selection group
│   │   ├── resizable.tsx                 # Resizable split-pane layout
│   │   ├── scroll-area.tsx               # Custom minimalist scrollbar viewport
│   │   ├── select.tsx                    # Accessible dropdown select input
│   │   ├── separator.tsx                 # Horizontal/vertical divider line
│   │   ├── sheet.tsx                     # Slide-in side drawer panel
│   │   ├── sidebar.tsx                   # Responsive collapsible sidebar framework
│   │   ├── skeleton.tsx                  # Data loading shimmer placeholders
│   │   ├── slider.tsx                    # Range slider for budget adjustments
│   │   ├── sonner.tsx                    # Modern toast notifications wrapper
│   │   ├── spinner.tsx                   # Loading state animated spinner
│   │   ├── switch.tsx                    # Boolean toggle switch
│   │   ├── table.tsx                     # Structured ledger data table
│   │   ├── tabs.tsx                      # Tabbed view switcher (e.g. Income vs Expense)
│   │   ├── textarea.tsx                  # Multi-line text note input
│   │   ├── toast.tsx                     # Legacy toast notification primitive
│   │   ├── toaster.tsx                   # Toast notification mount target
│   │   ├── toggle-group.tsx              # Multi-option toggle group
│   │   ├── toggle.tsx                    # Single binary toggle button
│   │   ├── tooltip.tsx                   # Hover tooltip explanation box
│   │   ├── use-mobile.tsx                # Mobile breakpoint detection hook
│   │   └── use-toast.ts                  # Toast notification trigger hook
│   │
│   └── wallet/                           # Specialized Financial Domain Widgets (17 Modules)
│       ├── account-detail-view.tsx       # Single account transaction history & balance inspector
│       ├── accounts-view.tsx             # Visual account balance grid (Bank, E-Wallet, Cash)
│       ├── add-account-modal.tsx         # Modal for connecting new financial accounts
│       ├── add-transaction-modal.tsx     # Fast multi-item expense/income recording modal
│       ├── analytics-view.tsx            # Expense breakdown charts & cashflow velocity
│       ├── app-shell.tsx                 # Universal responsive shell (Topbar, Sidebar & Mobile Nav)
│       ├── bottom-nav.tsx                # Mobile PWA bottom navigation tab bar
│       ├── budget-group-modal.tsx        # Budget group creation & category grouping modal
│       ├── budget-view.tsx               # Visual budget trackers, alerts & percentage gauges
│       ├── dashboard-view.tsx            # Executive KPI summary cards & financial highlights
│       ├── filter-sidebar.tsx            # Advanced transaction filter panel (Date, Account, Category)
│       ├── month-selector.tsx            # Interactive month/year period switcher
│       ├── period-selector.tsx           # Daily, weekly, monthly & annual filter switcher
│       ├── records-view.tsx              # Paginated transaction record stream & row actions
│       ├── sidebar.tsx                   # Desktop navigation sidebar with collapse support
│       ├── topbar.tsx                    # Header bar with user profile, sync indicator & quick actions
│       └── transaction-detail-modal.tsx  # Transaction inspector, category edit & delete confirmation
│
├── hooks/                                # Custom React Hooks
│   ├── use-finance-data.ts               # Core reactive hook: Supabase data fetching, cache & real-time sync
│   ├── use-mobile.ts                     # Responsive layout detector for mobile viewports
│   └── use-toast.ts                      # UI notification toaster helper
│
├── lib/                                  # Utility Libraries & Database Adaptations
│   ├── icon-map.ts                       # Dynamic category icon mapping (Lucide icons to category names)
│   ├── utils.ts                          # Tailwind class merger (clsx + twMerge) & formatting helpers
│   ├── wallet-data.ts                    # Mock fallback data & financial calculation algorithms
│   │
│   └── supabase/                         # Supabase Data Access Layer
│       ├── client.ts                     # Typed Supabase browser/server client initializer
│       ├── mutations.ts                  # Database write operations (Insert, update & soft-delete transactions)
│       ├── queries.ts                    # High-performance data queries (Balances, categories, monthly summaries)
│       ├── schema.sql                    # SQL schema definitions for finance tables
│       └── types.ts                      # Strict TypeScript types for Supabase database tables
│
├── public/                               # Static Assets & PWA Configuration
│   ├── manifest.json                     # Progressive Web App (PWA) manifest specification
│   ├── sw.js                             # Service Worker for offline asset caching & PWA lifecycle
│   └── icons/                            # High-resolution PWA launcher icons
│       ├── icon-192x192.png              # Standard mobile home screen icon
│       ├── icon-512x512.png              # Splash screen & high-density display icon
│       └── icon-maskable.png             # Android adaptive maskable launcher icon
│
└── styles/                               # Global Style Definitions
    └── globals.css                       # Tailwind v4 theme directives & CSS custom properties
```

---

## 3. N.E.X.A MOBILE BRIDGE ARCHITECTURE (Android 16 / One UI 8 / Kotlin)
* **Local Path:** `C:\workspace\nexa-mobile-bridge`
* **Target Hardware:** Samsung Galaxy A33 5G
* **Package:** `com.nexa.mobilebridge`
* **Role:** Physical Hardware Peripheral, Sensor Synthesis, UI Automation & Multimodal Live Call Host

```text
nexa-mobile-bridge/
├── build.gradle.kts                      # Root Gradle build script & plugin definitions
├── settings.gradle.kts                   # Project module inclusion & repository settings
├── gradle.properties                     # Gradle daemon & JVM memory allocations
├── local.properties                      # Android SDK path & local developer configurations
├── gradlew                               # Unix Gradle wrapper executable
├── gradlew.bat                           # Windows Gradle wrapper executable
│
├── docs/                                 # Protocol Specifications & Testing Reports
│   ├── JSON_PROTOCOL_SPECIFICATION.md    # Full bidirectional JSON payload spec (Nexa Protocol 3.0)
│   ├── MOBILE_BRIDGE_TESTING_REPORT.md   # Hardware sensor & latency test results
│   └── NEXA_MOBILE_BRIDGE_DOCUMENTATION.md # Super-complete technical documentation
│
└── app/                                  # Main Android Application Module
    ├── build.gradle.kts                  # App dependencies (Compose, Hilt, CameraX, OkHttp, Coroutines)
    │
    └── src/main/
        ├── AndroidManifest.xml           # Permissions, services, receivers & activity manifests
        │
        ├── res/                          # Android UI Resources & Configurations
        │   ├── drawable/                 # Vector drawables & app background assets
        │   ├── mipmap-*/                 # Application adaptive launcher icons (N.E.X.A Logo)
        │   ├── values/                   # Color palettes, string resources & theme definitions
        │   └── xml/                      # System integration XMLs:
        │       ├── accessibility_service_config.xml # Accessibility flags (interactive clicks, UI tree)
        │       ├── backup_rules.xml      # Android data backup policies
        │       └── data_extraction_rules.xml # Data extraction security policies
        │
        └── java/com/nexa/mobilebridge/   # Kotlin Source Code
            │
            ├── NexaBridgeApp.kt          # Application entry point (@HiltAndroidApp)
            ├── MainActivity.kt           # Jetpack Compose Edge-to-Edge root container
            ├── Navigation.kt             # Jetpack Compose Navigation Graph
            ├── NavigationKeys.kt         # Navigation route destination constants
            ├── NexaBridgeService.kt      # 24/7 Foreground Service (WakeLock + WifiLock)
            ├── NexaAccessibilityService.kt # System Accessibility (Click, Scroll, Screenshot, UI Tree)
            ├── SafeBankingLauncherActivity.kt # Banking launcher with privacy screen shielding
            ├── TransparentCameraActivity.kt # Background CameraX photo capture without UI distraction
            │
            ├── core/                     # Core Engine Components
            │   ├── context/
            │   │   └── ContextEngine.kt  # Multi-sensor synthesis & situational compound rule engine
            │   ├── di/                   # Dependency Injection (Dagger Hilt)
            │   │   ├── AppModule.kt      # Context & DataStore dependency provider
            │   │   └── NetworkModule.kt  # OkHttpClient & JSON serialization provider
            │   ├── network/              # WebSocket & Networking Subsystems
            │   │   ├── NexaHttpClient.kt # HTTP helper client
            │   │   ├── NexaWebSocketClient.kt # OkHttp WebSocket client & keepalive ping (20s)
            │   │   └── ReconnectOrchestrator.kt # 4-Phase Tiered Retry Engine + Voice TTS alerts
            │   ├── receiver/
            │   │   └── BootCompletedReceiver.kt # Auto-start service on device reboot
            │   ├── security/
            │   │   ├── HmacVerifier.kt   # HMAC-SHA256 signature verifier (GodMode Privilege >= 3)
            │   │   └── MBankingShieldManager.kt # Banking app detection & overlay shielding
            │   ├── sensor/               # Physical Hardware Sensor Listeners
            │   │   ├── GeofenceBroadcastReceiver.kt # GPS Geofence background transition receiver
            │   │   ├── GeofenceManager.kt # Google Play Services Geofencing (Home/Work 100m)
            │   │   ├── GeofenceModel.kt  # Geofence coordinates & radius data model
            │   │   └── SensorObserverManager.kt # Ambient Light, Motion, Step Counter, Pickup Gesture
            │   ├── usage/
            │   │   └── AppUsageTracker.kt # Foreground application tracker via UsageStatsManager
            │   └── util/
            │       └── ConnectionState.kt # Sealed class for WebSocket connection state
            │
            ├── data/                     # Data Persistence Layer
            │   ├── DataRepository.kt     # Reactive DataStore preferences repository
            │   └── local/
            │       └── NexaPreferencesDataStore.kt # Encrypted preferences (URL, Bearer Token, HMAC Key)
            │
            ├── dispatcher/               # Remote Command Execution Layer
            │   ├── DeviceCommandDispatcher.kt # Master router for incoming server commands (28 Actions)
            │   └── handler/              # 20 Specialized Hardware & System Handlers
            │       ├── AppLauncherHandler.kt   # App launcher by package name
            │       ├── AudioPlayerHandler.kt   # Ringtone, media playback & PCM audio stream player
            │       ├── BatteryHandler.kt       # Battery level & charging state monitor
            │       ├── CameraHandler.kt        # Camera photo trigger (Transparent CameraX)
            │       ├── CameraStreamHandler.kt  # Live video frame streamer for Gemini Multimodal
            │       ├── ClipboardHandler.kt     # System clipboard read & write
            │       ├── FakeCallHandler.kt      # Simulated incoming call launcher
            │       ├── FlashlightHandler.kt    # Torch light toggle via CameraManager
            │       ├── GeofenceHandler.kt      # Dynamic geofence area registrar
            │       ├── IntentHandler.kt        # Browser URL, Maps & sharing intents
            │       ├── LightSensorHandler.kt   # Ambient light sensor monitor (lux levels)
            │       ├── LocationHandler.kt      # GPS / Network location & Geocoder address lookup
            │       ├── NetworkHandler.kt       # Wi-Fi state & signal strength (RSSI dBm)
            │       ├── OverlayHandler.kt       # System Alert Window (Compose overlay dialog)
            │       ├── ScreenHandler.kt        # Home, Back, Recents & screen lock actions
            │       ├── ScreenshotHandler.kt    # Full screen capture via Accessibility API
            │       ├── TtsHandler.kt           # Text-to-Speech (Indonesian voice with auto-sanitization)
            │       ├── VoiceRecorderHandler.kt # Voice note recorder
            │       ├── VoiceStreamHandler.kt   # Continuous PCM audio stream from microphone
            │       └── VolumeHandler.kt        # Multi-stream volume controller & DND interruption filter
            │
            ├── protocol/                 # Data Models & JSON Schemas (Nexa Protocol 3.0)
            │   ├── CallEvent.kt          # Call interaction event model (Accepted, Rejected, Reply)
            │   ├── CommandResult.kt      # Command execution return result model
            │   ├── ContextReport.kt      # High-level situational context event model
            │   ├── NexaActions.kt        # Action name string constants (28 Actions)
            │   ├── NexaCommand.kt        # Incoming server command schema
            │   └── TelemetryReport.kt    # Periodic device telemetry schema (Battery, Wi-Fi, Screen)
            │
            ├── service/
            │   └── NexaNotifListenerService.kt # Notification listener (Samsung/Google Clock Alarm Dismiss)
            │
            ├── theme/                    # Jetpack Compose Theme & Design System
            │   ├── Color.kt              # Executive dark palette & neon status accents
            │   ├── Theme.kt              # Material3 dark theme setup
            │   └── Type.kt               # Typography & font styling
            │
            └── ui/                       # User Interfaces (Jetpack Compose)
                ├── call/
                │   ├── FakeCallActivity.kt   # Interactive Call Screen (6 States: Ringing, Voice, Video)
                │   └── NexaExpressiveEyes.kt # Dynamic expressive animated digital eyes
                ├── hud/
                │   ├── HudScreen.kt          # Main Executive Status HUD Dashboard
                │   └── HudViewModel.kt       # HUD state holder & connection switch
                ├── overlay/
                │   └── OverlayActivity.kt    # Dynamic System Overlay with server-defined buttons
                └── settings/
                    ├── SettingsScreen.kt     # Configuration screen (Server URL, Token, HMAC Secret)
                    └── SettingsViewModel.kt  # Settings DataStore state manager
```

---

## 4. N.E.X.A GEMINI PROXY ARCHITECTURE (Vercel Serverless US Edge Gateway)
* **Local Path:** `C:\workspace\nexa-gemini-proxy`
* **Production Host:** Vercel Serverless Edge Functions (`iad1` — Washington D.C., USA)
* **Target Endpoint:** `https://generativelanguage.googleapis.com`
* **Role:** High-speed US Edge Gateway for Google AI Studio & Gemini API (Sub-second Edge Relay & Regional Bypass)
* **Current Version:** v1.0.0 (`package.json`)

```text
nexa-gemini-proxy/
├── package.json                          # Proxy package manifest (Vercel deployment target)
├── vercel.json                           # Vercel Edge configuration (iad1 region specification & route rewrite)
├── README.md                             # Gateway documentation, endpoint routing & cURL test examples
│
└── api/                                  # Serverless Edge Functions
    └── index.js                          # Edge Gateway Handler:
                                          #  - CORS Headers (* origin, preflight OPTIONS handling)
                                          #  - Health Check endpoint (/ or /health -> 200 OK)
                                          #  - Target URL forwarding (https://generativelanguage.googleapis.com)
                                          #  - Header normalization (x-goog-api-key / Bearer extraction)
                                          #  - Streaming body forwarding & HTTP status propagation
```

---

## 5. N.E.X.A UNIVERSAL CLI ARCHITECTURE (Node.js Standalone Console)
* **Local Path:** `C:\workspace\nexa-cli`
* **NPM Package:** `nexa-assistant-console` (alias: `nexa-cli`)
* **Distribution:** NPM Registry (`npx nexa-assistant-console`) & GitHub (`npx github:Knightrelaxed/nexa-cli`)
* **Role:** Zero-dependency Interactive Cyberpunk HUD Terminal Client for Tuan Faqih (cross-device terminal access)
* **Current Version:** v2.8.4 (`package.json`)

```text
nexa-cli/
├── package.json                          # CLI package manifest (bin: nexa-assistant-console, nexa-cli)
├── README.md                             # Terminal usage guide, npx installation & first-time setup instructions
│
└── index.js                              # Master Standalone Executable:
                                          #  - Zero external dependencies (100% native Node.js core modules)
                                          #  - Cyberpunk HUD Banner & Dynamic ASCII Box Drawer (single-sequence ANSI)
                                          #  - Interactive multi-turn Readline interface with customized prompt (❖ TUAN FAQIH ──❯)
                                          #  - Encrypted configuration store (~/.nexa-config.json for server URL & secret)
                                          #  - Ingress client: HTTPS POST /webhook/cli with Bearer/AES-CLI-SEC authentication
                                          #  - Real-time response streaming, follow-up state handling & clean exit traps
```

---

## 6. DATA BINDING & INTERACTION MATRIX

| Jalur Aliran Data | Protokol / Saluran | Komponen Asal | Komponen Tujuan | Deskripsi / Fungsi |
|---|---|---|---|---|
| **Modular Intent Ingress** | Inter-process / Pipeline | Adapter Kanal (`telegram/`, `cli/`) | Common Dispatcher (`common/`) | Normalisasi payload intent lintas-kanal ke 7 handler domain bersama dengan platform-aware escaping & state retention. |
| **Hardware Commands** | WebSocket (`EXECUTE_COMMAND`) | Server (`MobileBridge_WS.js`) | Android (`DeviceCommandDispatcher.kt`) | Eksekusi 28 aksi fisik (kamera, screenshot, klik layar, volume, senter, dll.). |
| **Command Results** | WebSocket (`COMMAND_RESULT`) | Android (`DeviceCommandDispatcher.kt`) | Server (`MobileBridge_WS.js`) | Pengembalian data eksekusi (Base64 foto, hierarki UI, status). |
| **Situational Context** | WebSocket (`CONTEXT_UPDATE`) | Android (`ContextEngine.kt`) | Server (`adapter.js`) | Laporan sensor real-time (`ROOM_DARK_NIGHT`, `PHONE_PICKUP_MORNING`, dll.). |
| **Live Call & Video** | WebSocket (`CALL_AUDIO_STREAM`) | Android (`VoiceStreamHandler.kt`) | Server (`Live_Voice_Engine.js`) | Streaming audio PCM & frame video ke Google Gemini Live API. |
| **Audio Output** | WebSocket (`CALL_REPLY_PCM`) | Server (`Live_Voice_Engine.js`) | Android (`AudioPlayerHandler.kt`) | Pemutaran respon suara instan (*sub-second TTFA*) ke speaker HP. |
| **Financial Ledger** | REST / Realtime Database | Server (`Finance_Engine.js`) | Supabase PostgreSQL (`Supabase_Finance.js`) | Buku besar kas, sinkronisasi Bank Mandiri & pelacakan pengeluaran. |
| **User Memory RAG** | Vector Similarity (pgvector) | Server (`Episodic_Recall.js`) | Supabase PostgreSQL (`Supabase_Memories.js`) | Penarikan memori percakapan jangka panjang & fakta kepribadian Tuan. |
| **Financial Web Portal** | HTTPS / Server-Side Rendering | Web Browser (`nexa-finance-web`) | Supabase PostgreSQL & Server API | Dashboard visual analitik keuangan, grafik pengeluaran & anggaran realtime PWA. |
| **Gemini AI Studio US Relay** | HTTPS Proxy (`iad1` Edge) | Server (`Fallback_Engine.js`) | Vercel Edge (`nexa-gemini-proxy`) -> Google | Akses API Gemini via US Washington D.C. gateway untuk latensi optimal dan bypass batasan regional. |
| **Terminal Console CLI** | HTTPS / JSON Webhook | Standalone Terminal (`nexa-cli`) | Server (`interfaces/cli/adapter.js`) | Akses kontrol konsol eksekutif N.E.X.A bergaya HUD Cyberpunk dari laptop manapun di dunia. |

