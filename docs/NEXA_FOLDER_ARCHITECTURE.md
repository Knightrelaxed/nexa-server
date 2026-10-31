# N.E.X.A Ecosystem - Complete Architecture & File Tree

> **Document:** `docs/NEXA_FOLDER_ARCHITECTURE.md`  
> **Ecosystem:** N.E.X.A 3.4.4 (Sovereign Cloud Core, Finance Web Portal, Mobile Hardware Bridge, Native Windows Bridge, US Gemini Proxy & Universal CLI)  
> **Last Updated:** 2026-10-31  
> **Format:** Comprehensive Plain-Text ASCII Tree with Deep Functional Annotations  

---

## 1. N.E.X.A SERVER ARCHITECTURE (Node.js Sovereign Core)
* **Local Path:** `C:\workspace\nexa-server`
* **Production Host:** Azure Central Indonesia VPS (`/home/nexa/nexa-server`)
* **Role:** Sovereign Cognitive Core, Multi-Model Router, Database Ledger, Realtime Relays & Background Services
* **Current Version:** v3.4.4 (`src/config/version.js` & `package.json`)

```text
nexa-server/
├── Dockerfile                            # Production container build specification
├── .dockerignore                         # Docker build artifact exclusion rules
├── .gitignore                            # Git repository ignore rules
├── deploy.sh                             # Zero-downtime deployment script for Azure VPS (git pull, pretest, PM2 reload)
├── ecosystem.config.js                   # PM2 process manager configuration (VPS deployment)
├── package.json                          # Main project manifest & production dependencies (v3.4.4)
├── package-lock.json                     # Deterministic dependency lockfile
├── README.md                             # Repository overview & quick start guide
├── .env.example                          # Blueprint environment variable template
│
├── cloudflare-worker/                    # Cloudflare Edge Relay Subsystem
│   ├── nexa-relay.js                     # Edge proxy worker for Telegram Bot API & media processing
│   └── wrangler.toml                     # Cloudflare Worker deployment configuration
│
├── data/                                 # Local Storage & Snapshot Datastore
│   ├── capabilities_manifest.txt         # Tier 0 compact manifest (~265 tokens) for router prompts & Anti-False-Denial Rule
│   ├── capabilities_cards.json           # Tier 1 structured capability cards (17 certified modules)
│   ├── capabilities_vectors.json         # In-memory vector snapshot for Tier 1 capability cards
│   ├── facts_vectors.json                # In-memory snapshot of pgvector memory embeddings
│   └── transcripts_dump/                 # Raw conversation transcripts & session archives
│
├── database/                             # Database Migrations & Supabase PostgreSQL Schemas
│   ├── 001_memory_tiers_migration.sql    # 5-tier memory migration (CORE, PHASE, PREFERENCE, RULE, EPHEMERAL) + lifecycle columns
│   ├── app_limits_migration.sql          # Screen time & application usage discipline rules
│   ├── budget_schema.sql                 # Expense categories, balances & budget tracking tables
│   ├── migration_daily_narratives.sql    # Daily cognitive narrative & identity evolution logs
│   ├── migration_directives_counters_v3_3_2.sql # Behavioral directives & runtime execution counters
│   ├── migration_direct_debit_payment_method.sql # Direct debit & multi-bank payment method migration
│   ├── migration_enable_all_nexa_rls.sql # Comprehensive Row Level Security (RLS) hardening
│   ├── migration_enable_rls.sql          # Base RLS security policies
│   ├── migration_learning_loop_v3_3.sql  # Micro-reviewer cognitive reflection & feedback schema
│   ├── migration_learning_loop_v3_3_1.sql# Learning loop schema refinement
│   ├── migration_notifier_recurring.sql  # Scheduled notifications & recurring task triggers
│   ├── migration_settings.sql            # Dynamic user & system runtime settings schema
│   ├── migration_split_transaction.sql   # Split-bill & shared expense transaction schema
│   ├── phase6_migration.sql              # Cognitive Identity, Mood Time-Series & Dual Memory tables
│   ├── phase7_migration.sql              # Causal Knowledge Graph & dynamic self-inference schema
│   ├── phase8_discipline_state_migration.sql # Screen lock, god-mode & discipline enforcement states
│   ├── schema.sql                        # Base consolidated PostgreSQL schema
│   ├── seed_phase9_core_identity.sql     # Seed initial core identity directives & traits
│   ├── seed_phase10_cron_architecture.sql# Seed proactive cron schedules & intervals
│   └── whatsapp_and_platform_migration.sql# Multi-platform messaging channel schema
│
├── docs/                                 # Architecture Whitepapers & Documentation
│   ├── CORE_IDENTITY_AUDIT_REPORT.md     # Persona integrity & identity verification report
│   ├── GOOGLE_MASTER_OAUTH2_ARCHITECTURE_PLAN.md # Centralized OAuth2 token infrastructure
│   ├── JSON_PROTOCOL_SPECIFICATION.md    # Bidirectional WebSocket schema (Nexa Protocol 3.0)
│   ├── MOBILE_BRIDGE_TESTING_REPORT.md   # Sensor latency & hardware test logs
│   ├── NEXA_AZURE_VPS_PRODUCTION_ARCHITECTURE.md # Sovereign VPS Jakarta deployment whitepaper
│   ├── NEXA_COGNITIVE_ROUTER_PROMPT_ARCHITECTURE.md # Full verbatim prompt specification & two-payload simulation
│   ├── nexa_core_identity_dump_231.json  # Comprehensive persona trait snapshot & embeddings dump
│   ├── NEXA_FOLDER_ARCHITECTURE.md       # This complete ecosystem folder directory tree
│   ├── NEXA_MOBILE_BRIDGE_DOCUMENTATION.md # Complete Android bridge technical documentation
│   ├── NEXA_ORACLE_CLOUD_MIGRATION_PLAN.md # Secondary cloud disaster recovery plan
│   ├── NEXA_SECURITY_ARCHITECTURE_AND_HARDENING.md # Comprehensive security hardening guide
│   ├── NEXA_VERSION_EVOLUTION_ROADMAP.md # Version evolution & release milestone roadmap (v1.0 - v3.4.4)
│   ├── NEXA_Whitepaper.md                # General N.E.X.A architecture whitepaper (v3.4.4 with BAB 24 & BAB 25)
│   └── USER_EXPERIENCE_GUIDE_NEXA_FINANCE.md # End-to-end UX guide: Web, PWA, chat, & multi-bank automation
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
│   ├── build_capabilities.js             # Compiler: capability registry compiler to Tier 0 manifest & Tier 1 cards
│   ├── clean_bad_memories.js             # Supabase memory hygiene & corrupted fact cleaner
│   ├── deploy.sh                         # Canonical bash deployment script template
│   ├── generate_google_master_token.js   # OAuth2 refresh token generator for Google APIs
│   ├── generate_vector_snapshot.js       # Disk-to-Supabase vector embedding synchronizer
│   ├── reclassify_core.js                # Cognitive taxonomy audit & reclassifier (nexa_user_profile & nexa_core_identity)
│   ├── trigger_weekly.js                 # Manual runner for weekly cognitive synthesis
│   ├── verify_google_master_client.js    # Diagnostic: Google OAuth2 master client validator
│   └── refactor/                         # AST Automated Refactoring & Validation Tooling
│       ├── README.md                     # Refactoring runbook & safety architecture
│       ├── capture_memories_golden.js    # Golden fixture capture utility for Supabase Memories
│       ├── capture_router_golden.js      # Golden fixture capture utility for AI Router
│       ├── split_ai_router.js            # AST-based non-destructive module splitter for AI Router
│       ├── split_finance_engine.js       # AST-based non-destructive module splitter for Finance Engine
│       ├── split_supabase_memories.js    # AST-based non-destructive module splitter for Supabase Memories
│       └── verify_finance_split.js       # Static scope & cyclic dependency validator
│
├── tests/                                # Automated Unit Test Suites & Hermetic Fixtures (437 Tests Passing 100%)
│   ├── audit_bugs.test.js                # Regression tests: Income category fallback, godmode candidate domains, callAI JSON
│   ├── capabilities_integrity.test.js    # 7 unit tests: Tier 0 manifest constraints, Tier 1 cards & anti-drift router representations
│   ├── cli_adapter.test.js               # Unit tests: CLI ingress adapter & multi-turn prompts
│   ├── common_handlers.test.js           # Unit tests: Shared domain intent handlers (15 bank cases, escaping)
│   ├── context_regressions.test.js       # Historical regression suites across context pipelines
│   ├── day_simulation.test.js            # Unit tests: Full 24-hour simulation (Briefing to Midnight)
│   ├── directive_utils.test.js           # Unit tests: Behavioral directive parsing & counter increments
│   ├── finance_characterization.test.js  # Golden master: Invariance test suite for modular Finance Engine (75 cases)
│   ├── identity_directive_flow.test.js   # Unit tests: Dynamic persona directives & alignment flow
│   ├── memories_characterization.test.js # Golden master: Invariance test suite for modular Supabase Memories (69 cases)
│   ├── memory_classifier_hygiene.test.js # 9 unit tests: 5-tier taxonomy, contingency demotions, completed past, dynamic Ebbinghaus decay
│   ├── micro_reviewer.test.js            # Unit tests: Micro-reviewer cognitive reflection & feedback loops
│   ├── multi_bank_email_finance_sync.test.js # Multi-bank auto-sync: Mandiri & Jago email parser
│   ├── multi_device_bridge.test.js       # Multi-device bridge: Mobile ADB, screen trigger & relay
│   ├── playbook_counters.test.js         # Unit tests: Behavioral playbook counters & limits
│   ├── playbook_engine.test.js           # Unit tests: Playbook engine rules & conditional SOPs
│   ├── reviewer_resilience.test.js       # Unit tests: Reviewer engine fallback & fault tolerance
│   ├── router_characterization.test.js   # Golden master: Invariance test suite for modular AI Router (48 cases)
│   ├── signal_detector.test.js           # Unit tests: Real-time behavioral signal detector
│   ├── situational_synthesizer.test.js   # Dynamic context synthesis & cognitive tone modulation
│   ├── supabase_finance_characterization.test.js # Characterization: Invariance test suite for modular Finance DB (25 APIs)
│   ├── task_context_resolution.test.js   # Contextual ambiguity resolution & state tracking
│   ├── telegram_adapter.test.js          # Unit tests: Telegram adapter, action builders & callbacks
│   ├── test_isolation_regression.test.js # Test isolation defense-in-depth & synthetic guard
│   ├── topic_classifier.test.js          # Classification: Topic classification & fast prompt router
│   ├── upgrade.test.js                   # Migration: Schema upgrade & database integrity validator
│   ├── version.test.js                   # Verification: Centralized version resolver & git SHA tests
│   ├── helpers/                          # Test Harness Helpers
│   │   ├── memories_harness.js           # Mock Supabase recording harness for characterization
│   │   └── router_harness.js             # Mock LLM recording harness for characterization
│   └── fixtures/                         # Golden Master Serialized Fixtures
│       ├── finance_golden.json           # Deterministic baseline outputs & stub call signatures (Finance)
│       ├── memories_golden.json          # Deterministic baseline query & mutation fixtures (Memories, 1,153 queries)
│       └── router_golden.json            # Deterministic baseline prompt & routing fixtures (AI Router, 28 scenarios)
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
    ├── config/                           # Environment, Persona, Registry & Version Configuration
    │   ├── capabilities_registry.js      # Single source of truth for 17 certified capabilities, keywords & code paths
    │   ├── env.js                        # Validated environment variable loader
    │   ├── model_backup_plan.json        # Dynamic fallback parameters & retry quotas
    │   ├── personality.js                # Master executive identity prompt & behavior boundaries
    │   └── version.js                    # Centralized version definition (v3.4.4) & Git SHA resolver
    │
    ├── core/                             # Core Cognitive & Inference Engines (9 Subsystems)
    │   ├── AI_Router.js                  # Public Facade (37 lines, re-exporting 18 cognitive routing APIs)
    │   ├── router/                       # Modular Cognitive Router Subsystem (8 Modules)
    │   │   ├── Memory_Classifier.js      # 5-tier cognitive memory classifier with contingency reasoning & 4 guardrails
    │   │   ├── Router_Cache.js           # RAM cache & TTL invalidator for personal facts, identity & self-model
    │   │   ├── Router_Classifier.js      # Fast reflex detection, candidate domain gating & topic classifier
    │   │   ├── Router_Dispatcher.js      # Master routeUserMessage orchestration loop & JSON repair
    │   │   ├── Router_Output.js          # Routing output normalization, em-dash cleanup & domain fixers
    │   │   ├── Router_Prompts.js         # Token Budget Guard, system prompt builder, Tier 0 Manifest & Anti-False-Denial Rule
    │   │   ├── Router_Selectors.js       # Semantic token extraction, word stemmer & fact relevance scorers
    │   │   └── Router_Utilities.js       # LLM utilities (callAI, classifyYesNo, classifyPending, dedupFact & memory classification)
    │   ├── Fallback_Engine.js            # SACR v2.4 (15-Tier Dual-Mode Dynamic Fallback Router with forceHeavy support)
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
    │   ├── Finance_Engine.js             # Public Facade (56 baris) delegating to modular finance subsystems
    │   ├── Finance_Intel.js              # Financial intelligence, spending pattern heuristics & anomaly detection
    │   ├── finance/                      # Decomposed Modular Finance Subsystems
    │   │   ├── Finance_Analytics.js      # Financial reports, spending velocity, saving rate & balance trends
    │   │   ├── Finance_Confirmations.js  # Multi-turn confirmation lifecycle, auto-save timeout & restart recovery
    │   │   ├── Finance_Corrections.js    # Safe transaction deletions, edit & undo manager
    │   │   ├── Finance_Email_Sync.js     # Livin' by Mandiri & Bank Jago Gmail polling, parsing & transaction dedup
    │   │   ├── Finance_Helpers.js        # Currency normalizer, date parsers & lightweight AI merchant categorizer
    │   │   ├── Finance_Ledger.js         # Core double-entry ledger, transaction writes & search queries
    │   │   └── Finance_State.js          # Shared in-memory state & lock sets (single source of truth)
    │   ├── Inference_Engine.js           # Psychological trait & user pattern inferrer
    │   ├── Intelligence_Brief.js         # Morning Briefing, Midnight & Evening brief synthesizer
    │   ├── Intention_Engine.js           # Short & long-term commitments tracker
    │   ├── Location_Orchestrator.js      # Presence context, spatial reasoning & location queries
    │   ├── Memory_Hygiene_Engine.js      # Step 1 hard expiry for EPHEMERAL, Step 2 Dynamic Ebbinghaus Decay for PHASE, CORE time-immunity
    │   ├── Micro_Reviewer.js             # Micro-reviewer cognitive reflection, output quality critic & guardrails
    │   ├── Playbook_Engine.js            # Behavioral playbooks, conditional execution & contextual SOPs
    │   ├── Presence_Model.js             # User physical presence, device state & focus mode estimator
    │   ├── Signal_Detector.js            # Real-time behavioral signal detector & emotional state cue parser
    │   ├── Split_Engine.js               # Shared expense calculation & debt settlement ledger
    │   └── Task_Manager.js               # Google Tasks integration, task prioritization & overdue detector
    │
    ├── infrastructure/                   # External Services & Database Adaptations
    │   ├── Gmail_Client.js               # Gmail auto-sync (Mandiri & Bank Jago transaction detection)
    │   ├── Google_Master_Client.js       # Centralized Google API OAuth2 client
    │   ├── Google_Tasks.js               # Google Tasks REST API client
    │   ├── Google_Workspace.js           # Google Calendar & Workspace integration
    │   ├── Location_Engine.js            # Reverse geocoding & coordinates resolver
    │   ├── Notion_Client.js              # Notion workspace sync (notes & database)
    │   ├── Supabase_Finance.js           # Public Facade (30 lines, re-exporting 25 finance DB APIs)
    │   ├── finance_db/                   # Modular Financial Database Subsystem (6 Modules)
    │   │   ├── client.js                 # Supabase client init & connection configuration
    │   │   ├── reference_data.js         # In-memory accounts/categories cache (30m TTL) & fuzzy resolvers
    │   │   ├── transactions.js           # Dual-write CRUD transactions & split group tracking
    │   │   ├── analytics.js              # Financial metrics, savings rate, periods, trends & full pagination
    │   │   ├── budgets.js                # Budget groups, active limits & category expense summation
    │   │   ├── recurring.js              # Recurring expenses, subscription detection rules & status updates
    │   │   └── index.js                  # Public API aggregator & facade export
    │   ├── Supabase_Memories.js          # Public Facade (90 lines, re-exporting 69 memory APIs)
    │   ├── memories/                     # Modular Memory & Living Persistence Subsystem (10 Modules)
    │   │   ├── Memory_Client.js          # Supabase client init, table allowlist & ID matching helpers
    │   │   ├── Memory_Living.js          # Living memory metadata, bi-temporal superseding (superseded_by), chapter closing & active fetch
    │   │   ├── Memory_Chat.js            # Chat memory persistence, temporal buffers (today/yesterday) & FTS
    │   │   ├── Memory_Finance_Dedup.js   # Transaction deduplication keys, 7-day hygiene & pending transactions
    │   │   ├── Memory_Vault.js           # 2nd Brain Vault (ideas, thoughts, notes & multi-keyword fuzzy match)
    │   │   ├── Memory_Identity.js        # User profile, core identity facts, proposals & trait commitments
    │   │   ├── Memory_Self_Model.js      # N.E.X.A self-learning model (capabilities, limitations, rules, corrections)
    │   │   ├── Memory_Learning.js        # Closed learning loop events, micro-reviewer runs & playbook counters
    │   │   ├── Memory_Chrono.js          # 90-day rolling daily narrative consolidation & raw chat buffer search
    │   │   └── Memory_Db_Browser.js      # Generic database schema overview, table inspection & CRUD operations
    │   └── Web_Search.js                 # Real-time web search crawler
    │
    ├── interfaces/                       # Ingress & Egress Channels (Modular Ingress Architecture v3.4.4)
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
    │   │   ├── command_handler.js        # Telegram slash commands handler (/start, /status, /help, /capabilities)
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
        ├── gemini_vector_cache.js        # In-memory vector embedding cache with Tier 1 capability on-demand matching (~0.05ms)
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

## 4. N.E.X.A WINDOWS BRIDGE ARCHITECTURE (Rust / Slint / Win32 / WASAPI / Direct3D 11)
* **Local Path:** `C:\workspace\nexa-windows-bridge`
* **Target Hardware:** Lenovo ThinkPad X380 Yoga (Intel Core i5-8350U, UHD Graphics 620, Realtek HD Audio, Touchscreen / Stylus)
* **Tech Stack:** Rust 2021 Edition, Slint GUI Framework 1.9, Tokio Multi-threaded Async Runtime, Windows-Capture Direct3D 11, CPAL WASAPI, Sonora DSP WebRTC AEC3, Windows-Sys Win32 API
* **Binary Outputs:** `target/release/Nexa Bridge.exe`, `dist/Nexa Bridge.exe` (alias: `nexa-bridge.exe`)
* **Role:** Sovereign Native Desktop Companion, Hardware Audio Duplex (WASAPI + AEC3 DAC Tap), Direct3D 11 GPU Screen Capture, Native Desktop Automation (SendInput, UIA Magnetic Snap), Transparent AR Overlays & Multi-Tier OS Security Isolation (Armed Guard, 15-Min Lease, Terminal Shield)
* **Current Version:** v0.2.0 (`Cargo.toml`)

```text
nexa-windows-bridge/
├── Cargo.toml                            # Package manifest, dependencies & release profile optimizations
├── Cargo.lock                            # Deterministic dependency version lockfile
├── build.rs                              # Slint markup compiler & Windows resource embedder (winres icon.ico)
├── README.md                             # Repository overview, quick start guide & test commands (90 tests)
├── .gitignore                            # Git repository ignore rules (target/, dist/, etc.)
│
├── .github/workflows/                    # CI/CD Automation
│   └── rust.yml                          # GitHub Actions continuous integration & cargo test workflow
│
├── assets/                               # Application Branding & Visual Assets
│   ├── icon.ico                          # Multi-resolution native Windows application icon (16x16 - 256x256)
│   └── icon.png                          # High-resolution PNG logo & marketing asset
│
├── dist/                                 # Production Binary Releases & Portable Standalones
│   ├── Nexa Bridge.exe                   # Audited production release executable with icon metadata
│   └── nexa-bridge.exe                   # Canonical release binary (synchronized SHA256)
│
├── docs/                                 # Deep Technical Subsystem Specifications
│   ├── ARCHITECTURE.md                   # System architecture, multi-thread concurrency & data channels
│   ├── AUDIO_SUBSYSTEM.md                # WASAPI duplex audio, Sonora AEC3 DSP & lock-free ring buffer
│   ├── AUTOMATION_SUBSYSTEM.md           # SendInput automation, UIA magnetic snap & stealth overlays
│   ├── CAPTURE_SUBSYSTEM.md              # Direct3D 11 GPU screen capture & JPEG frame streaming
│   ├── COMPONENTS_AND_FILES.md           # Complete module catalog & file responsibility reference
│   ├── CONFIGURATION.md                  # JSON config schema, atomic saving & strict TLS validation
│   ├── POWER_MANAGEMENT.md               # Win32 WM_POWERBROADCAST sleep/resume lifecycle handling
│   ├── PROTOCOL.md                       # WebSocket message schemas, action catalog & dedicated audio channel
│   ├── SECURITY.md                       # Comprehensive security policy, armed guard lease & terminal shield
│   ├── SYSTEM_TRAY_AND_HOTKEYS.md        # Notification area tray icon, emergency hotkeys & zero-alloc telemetry
│   └── UI_COMPONENTS_AND_SPECIFICATION.md # Slint UI specifications, dual-mode views & design system
│
├── src/                                  # Rust Native Source Code
│   ├── main.rs                           # Application entry point, single-instance mutex, Tokio lifecycle & tray/hotkey wiring
│   ├── config.rs                         # BridgeConfig model, atomic save (.tmp -> rename), .bak recovery & TLS validation
│   │
│   ├── audio/                            # Real-Time Duplex Audio Subsystem (WASAPI + WebRTC AEC3)
│   │   ├── mod.rs                        # AudioEngine facade, duplex orchestrator & barge-in notifier
│   │   ├── audio_buffer.rs               # Lock-free SPSC circular ring buffer for zero-alloc sample passing
│   │   ├── echo_canceller.rs             # Sonora WebRTC AEC3 acoustic echo cancellation & noise suppression
│   │   ├── microphone.rs                 # WASAPI microphone capture worker (16 kHz mono clean stream)
│   │   ├── resampler.rs                  # Low-latency multi-rate audio resampler (16k / 24k / 48k)
│   │   └── speaker.rs                    # WASAPI speaker playback engine with real-time RMS metering & DAC tap
│   │
│   ├── automation/                       # Desktop Automation, Input Emulation & Security Enforcement
│   │   ├── mod.rs                        # Central command dispatcher, safe app whitelist & parameter redaction
│   │   ├── element_finder.rs             # Windows UI Automation (COM) magnetic smart-snap with 150ms timeout guard
│   │   ├── highlighter.rs                # DirectComposition transparent overlay manager, ripple effect & auto-dissolve
│   │   ├── input.rs                      # SendInput mouse/keyboard, Win+D desktop, and active terminal console shield
│   │   └── policy.rs                     # Canonical action normalizer, armed guard requirements & fast-path abort detector
│   │
│   ├── capture/                          # Direct3D 11 GPU Screen Capture & Vision Subsystem
│   │   ├── mod.rs                        # ScreenCaptureController facade & frame pipeline coordinator
│   │   ├── encoder.rs                    # Multi-threaded RGBA-to-JPEG encoder & 1 FPS frame rate limiter
│   │   └── screen_capture.rs             # Windows.Graphics.Capture API wrapper via direct GPU texture mapping
│   │
│   ├── network/                          # High-Resilience WebSocket Client Subsystem
│   │   ├── mod.rs                        # Network module entry, public types re-export
│   │   ├── client.rs                     # NetworkClient with exponential backoff, keepalive watchdog & dedicated audio stream
│   │   └── protocol.rs                   # Strong-typed JSON serialization/deserialization for ClientMessage & ServerMessage
│   │
│   └── platform/                         # Win32 OS Integration & Hardware Peripherals
│       ├── mod.rs                        # Platform module exports
│       ├── autostart.rs                  # Windows Startup Registry management (HKCU Run)
│       ├── hotkeys.rs                    # Win32 RegisterHotKey listener (Emergency Stop Win+Alt+X, Boss Key Win+Alt+N)
│       ├── memory.rs                     # Low RAM mode working set trimming (EmptyWorkingSet)
│       ├── power.rs                      # WM_POWERBROADCAST listener for ThinkPad lid close/open transitions
│       ├── single_instance.rs            # Named Win32 Mutex single-instance arbiter with focus signal
│       ├── system_tray.rs                # Shell_NotifyIconW tray icon with 15-minute armed toggle & context menu
│       └── telemetry.rs                  # Zero-allocation CPU (GetSystemTimes) & RAM (GlobalMemoryStatusEx) sampler
│
└── ui/                                   # Native Slint User Interface Markup & Styling
    ├── main_window.slint                 # Root dual-mode window (Dynamic Capsule Pill & Fullscreen Command Center)
    ├── overlay_window.slint              # Topmost click-through transparent canvas for AR visual guidance
    ├── settings_dialog.slint             # Server endpoint, token, HUD card toggles & live connection testing dialog
    │
    └── components/                       # Atomic Slint UI Components & HUD Cards
        ├── arc_reactor.slint             # Cybernetic spinning reactor core animation
        ├── audio_meter.slint             # Real-time multi-band audio spectrum frequency visualizer
        ├── automation_card.slint         # Win32 native desktop automation activity terminal log
        ├── avatar.slint                  # Dual-ocular cybernetic avatar supporting 10 cognitive states
        ├── floating_pill.slint           # Ultra-sleek executive dynamic companion pill (440x48px stadium capsule)
        ├── hotkeys_card.slint            # Global hotkey reference HUD card
        ├── pill_icons.slint              # Vector SVG icon buttons with hover & active animations
        ├── quantum_core.slint            # Compact pulsating glowing core avatar for pill mode
        ├── splitter.slint                # Interactive column & row draggable splitters for HUD layout
        ├── telemetry_card.slint          # Real-time hardware telemetry gauges (CPU %, RAM %, connection latency)
        ├── transcript_card.slint         # Dual-speaker real-time dialogue transcript feed
        └── vision_card.slint             # Live screen share preview card with resolution & streaming controls
```

---

## 5. N.E.X.A GEMINI PROXY ARCHITECTURE (Vercel Serverless US Edge Gateway)
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

## 6. N.E.X.A UNIVERSAL CLI ARCHITECTURE (Node.js Standalone Console)
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

## 7. DATA BINDING & INTERACTION MATRIX

| Jalur Aliran Data | Protokol / Saluran | Komponen Asal | Komponen Tujuan | Deskripsi / Fungsi |
|---|---|---|---|---|
| **Modular Intent Ingress** | Inter-process / Pipeline | Adapter Kanal (`telegram/`, `cli/`) | Common Dispatcher (`common/`) | Normalisasi payload intent lintas-kanal ke 7 handler domain bersama dengan platform-aware escaping & state retention. |
| **Cognitive AI Routing** | Pipeline / Fallback Engine | Server (`AI_Router.js` Facade & `router/`) | Fallback Engine & LLM Providers | Klasifikasi 13 domain intent, gating dinamis skema tool, injeksi persona, RAM cache TTL, dan eksekusi multi-provider dengan Token Budget Guard. |
| **Mobile Hardware Commands** | WebSocket (`EXECUTE_COMMAND`) | Server (`MobileBridge_WS.js`) | Android (`DeviceCommandDispatcher.kt`) | Eksekusi 28 aksi fisik HP (kamera, screenshot, klik layar, volume, senter, dll.). |
| **Mobile Command Results** | WebSocket (`COMMAND_RESULT`) | Android (`DeviceCommandDispatcher.kt`) | Server (`MobileBridge_WS.js`) | Pengembalian data eksekusi HP (Base64 foto, hierarki UI, status). |
| **Mobile Situational Context** | WebSocket (`CONTEXT_UPDATE`) | Android (`ContextEngine.kt`) | Server (`adapter.js`) | Laporan sensor real-time (`ROOM_DARK_NIGHT`, `PHONE_PICKUP_MORNING`, dll.). |
| **Mobile Live Call & Video** | WebSocket (`CALL_AUDIO_STREAM`) | Android (`VoiceStreamHandler.kt`) | Server (`Live_Voice_Engine.js`) | Streaming audio PCM & frame video kamera HP ke Google Gemini Live API. |
| **Mobile Audio Output** | WebSocket (`CALL_REPLY_PCM`) | Server (`Live_Voice_Engine.js`) | Android (`AudioPlayerHandler.kt`) | Pemutaran respon suara instan (*sub-second TTFA*) ke speaker HP. |
| **Windows Desktop Automation** | WebSocket (`EXECUTE_COMMAND`) | Server (`Live_Tool_Registry.js` / `MobileBridge_WS.js`) | Windows (`automation/mod.rs`) | Eksekusi 16 aksi native Windows (klik mouse, ketik Unicode, scroll, peluncuran aplikasi whitelist, lock screen, volume, dsb.) dengan perlindungan Armed Guard 15-menit dan perisai terminal aktif. |
| **Windows Command Results** | WebSocket (`COMMAND_RESULT`) | Windows (`automation/mod.rs`) | Server (`MobileBridge_WS.js`) | Pengembalian status eksekusi perintah desktop ber-epoch generasi sesi. |
| **Windows Desktop Vision** | WebSocket (`CALL_VIDEO_FRAME`) | Windows (`capture/screen_capture.rs`) | Server (`Live_Voice_Engine.js`) | Streaming cuplikan layar desktop Direct3D 11 GPU (1 FPS JPEG) untuk kapabilitas AI Multimodal Vision Gemini. |
| **Windows Duplex Voice Stream** | WebSocket (`CALL_AUDIO_STREAM`) | Windows (`audio/microphone.rs`) | Server (`Live_Voice_Engine.js`) | Streaming audio mikrofon 16 kHz mono terfilter WebRTC AEC3 (DSP Sonora) tanpa gema speaker. |
| **Windows Voice Output** | WebSocket (`CALL_AUDIO_PLAY` / Binary) | Server (`Live_Voice_Engine.js`) | Windows (`audio/speaker.rs`) | Pemutaran suara respons AI instan via WASAPI output stream terisolasi dari antrean kendali. |
| **Windows Desktop Telemetry** | WebSocket (`DESKTOP_TELEMETRY`) | Windows (`platform/telemetry.rs`) | Server (`Device_Control_Engine.js`) | Pelaporan beban CPU, utilisasi RAM fisik, dan nama aplikasi aktif ke peladen. |
| **Windows Power & Lifecycle** | WebSocket (`POWER_EVENT`) | Windows (`platform/power.rs`) | Server (`adapter.js`) | Notifikasi penutupan engsel laptop (`PBT_APMSUSPEND`) dan pembukaan kembali (`PBT_APMRESUME`). |
| **Financial Ledger** | REST / Realtime Database | Server (`Finance_Engine.js`) | Supabase PostgreSQL (`Supabase_Finance.js`) | Buku besar kas, sinkronisasi Bank Mandiri & pelacakan pengeluaran. |
| **User Memory RAG** | Vector Similarity (pgvector) | Server (`Episodic_Recall.js`) | Supabase PostgreSQL (`Supabase_Memories.js`) | Penarikan memori percakapan jangka panjang & fakta kepribadian Tuan. |
| **Financial Web Portal** | HTTPS / Server-Side Rendering | Web Browser (`nexa-finance-web`) | Supabase PostgreSQL & Server API | Dashboard visual analitik keuangan, grafik pengeluaran & anggaran realtime PWA. |
| **Self-Knowledge Progressive Disclosure** | In-Memory / Router Prompts | Master Registry (`capabilities_registry.js`) | Router (`Router_Prompts.js` & `gemini_vector_cache.js`) | Injeksi Tier 0 Manifes (~265 token) ke prompt dengan Anti-False-Denial Rule dan penarikan Tier 1 Kartu detail secara on-demand di RAM (~0.05ms) saat ada pertanyaan arsitektur/kapabilitas. |
| **5-Tier Cognitive Memory Routing** | Database / Contingency Classifier | Classifier (`Memory_Classifier.js`) | Living Memory (`Memory_Living.js`) & Supabase | Klasifikasi 5 tingkat (CORE, PHASE, PREFERENCE, RULE, EPHEMERAL) dengan penalaran kontingensi, bi-temporal superseding, dan peluruhan dinamis Ebbinghaus di Hygiene Engine. |
| **Gemini AI Studio US Relay** | HTTPS Proxy (`iad1` Edge) | Server (`Fallback_Engine.js`) | Vercel Edge (`nexa-gemini-proxy`) -> Google | Akses API Gemini via US Washington D.C. gateway untuk latensi optimal dan bypass batasan regional. |
| **Terminal Console CLI** | HTTPS / JSON Webhook | Standalone Terminal (`nexa-cli`) | Server (`interfaces/cli/adapter.js`) | Akses kontrol konsol eksekutif N.E.X.A bergaya HUD Cyberpunk dari laptop manapun di dunia. |

