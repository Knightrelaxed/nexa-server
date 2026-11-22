# N.E.X.A Ecosystem - Complete Architecture & File Tree

> **Document:** `docs/NEXA_FOLDER_ARCHITECTURE.md`  
> **Ecosystem:** N.E.X.A 4.0.0 (Sovereign Cloud Core, Go Sidecar `nexa-io`, Pulse Monitor, Mobile AI Control Center, Native Windows Bridge, Standalone Finance Web Portal, US Gemini Proxy & Universal CLI)  
> **Last Updated:** 2026-11-22  
> **Format:** Comprehensive Plain-Text ASCII Tree with Deep Functional Annotations  

---

## 1. N.E.X.A SERVER ARCHITECTURE (Node.js Sovereign Core + Go Sidecar)
* **Local Path:** `C:\workspace\nexa-server`
* **Production Host:** Azure Central Indonesia VPS (`/home/nexa/nexa-server`)
* **Process Manager:** Native `systemd` (`nexa-server.service`, `nexa-log.socket/service`, `nexa-term.socket/service`)
* **Role:** Sovereign Cognitive Core, Multi-Model Router, Financial & Living Memory Engines, Dual-WS & Auth Gateways, Native Pulse Monitor (`/monitor`), Go Sidecars (`/io/logs`, `/io/term`) & Background Services
* **Current Version:** v4.0.0 (`src/config/version.js` & `package.json`)

```text
nexa-server/
├── Dockerfile                            # Production container build specification
├── .dockerignore                       # Docker build artifact exclusion rules
├── .gitignore                            # Git repository ignore rules
├── .github/workflows/ci.yml              # GitHub Actions CI workflow
├── .agents/skills/                       # Local AI engineering skills (code-review, diagnosing-bugs, tdd, etc.)
├── deploy.sh                             # Zero-downtime deployment script (git pull, npm test, Go sidecar rebuild, systemd restart)
├── ecosystem.config.js                   # Legacy PM2 fallback configuration (replaced in prod by deploy/systemd/nexa-server.service)
├── package.json                          # Main project manifest & production dependencies (v4.0.0)
├── package-lock.json                     # Deterministic dependency lockfile (v4.0.0)
├── README.md                             # Repository overview & quick start guide
├── .env.example                          # Blueprint environment variable template
│
├── cloudflare-worker/                    # Cloudflare Edge Relay Subsystem
│   ├── nexa-relay.js                     # Edge proxy worker for Telegram Bot API & media processing
│   └── wrangler.toml                     # Cloudflare Worker deployment configuration
│
├── data/                                 # Local Storage & Snapshot Datastore
│   ├── backups/                          # Identity snapshot backups
│   ├── capabilities_manifest.txt         # Tier 0 compact manifest (~265 tokens) compiled for v4.0.0
│   ├── capabilities_cards.json           # Tier 1 structured capability cards (17 certified modules, v4.0.0)
│   ├── capabilities_vectors.json         # In-memory vector snapshot for Tier 1 capability cards (v4.0.0)
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
│   ├── migration_vault_exclude_from_stats.sql # Vault exclusion toggle from aggregate expense stats
│   ├── phase6_migration.sql              # Cognitive Identity, Mood Time-Series & Dual Memory tables
│   ├── phase7_migration.sql              # Causal Knowledge Graph & dynamic self-inference schema
│   ├── phase8_discipline_state_migration.sql # Screen lock, god-mode & discipline enforcement states
│   ├── schema.sql                        # Base consolidated PostgreSQL schema
│   ├── seed_phase9_core_identity.sql     # Seed initial core identity directives & traits
│   ├── seed_phase10_cron_architecture.sql# Seed proactive cron schedules & intervals
│   └── whatsapp_and_platform_migration.sql# Multi-platform messaging channel schema
│
├── deploy/                               # Production Infrastructure Templates (Systemd, Polkit, Caddy)
│   ├── caddy/
│   │   └── Caddyfile.pulse-monitor       # TLS reverse proxy routing /ws, /io/logs, /io/term & /monitor/*
│   └── systemd/
│       ├── 51-nexa-monitor.rules         # Polkit rule permitting user 'nexa' passwordless nexa-server restart
│       └── nexa-server.service           # Main Node.js systemd unit (--max-old-space-size=320, MemoryMax=420M)
│
├── docs/                                 # Architecture Whitepapers & Technical Documentation
│   ├── CORE_IDENTITY_AUDIT_REPORT.md     # Persona integrity & identity verification report
│   ├── GOOGLE_MASTER_OAUTH2_ARCHITECTURE_PLAN.md # Centralized OAuth2 token infrastructure
│   ├── JSON_PROTOCOL_SPECIFICATION.md    # Bidirectional WebSocket schema (Nexa Protocol 3.0)
│   ├── MOBILE_BRIDGE_TESTING_REPORT.md   # Sensor latency & hardware test logs
│   ├── NEXA_AZURE_VPS_PRODUCTION_ARCHITECTURE.md # Sovereign VPS Jakarta deployment whitepaper
│   ├── NEXA_COGNITIVE_ROUTER_PROMPT_ARCHITECTURE.md # Full verbatim prompt specification & two-payload simulation
│   ├── nexa_core_identity_dump_231.json  # Comprehensive persona trait snapshot & embeddings dump
│   ├── NEXA_FOLDER_ARCHITECTURE.md       # This complete ecosystem folder directory tree
│   ├── NEXA_MOBILE_BRIDGE_DOCUMENTATION.md # Complete Android bridge & control center documentation
│   ├── NEXA_ORACLE_CLOUD_MIGRATION_PLAN.md # Secondary cloud disaster recovery plan
│   ├── NEXA_SECURITY_ARCHITECTURE_AND_HARDENING.md # Comprehensive security hardening guide
│   ├── NEXA_VERSION_EVOLUTION_ROADMAP.md # Version evolution & release milestone roadmap (v1.0 - v4.0.0)
│   ├── NEXA_Whitepaper.md                # General N.E.X.A architecture whitepaper (v4.0.0)
│   ├── NEXA_WINDOWS_BRIDGE_INTEGRATION.md # Windows bridge integration, 32 Live Tools & safety directives
│   ├── ORACLE_SUPPORT_CHAT_TRANSCRIPT_2026-11-06.md # External infra provisioning transcript archive
│   └── USER_EXPERIENCE_GUIDE_NEXA_FINANCE.md # End-to-end UX guide: Web, PWA, chat, & multi-bank automation
│
├── logs/                                 # Runtime application logs
│
├── nexa-io/                              # Go 1.22 Sidecar Binary (Sandboxed Logs & Terminal PTY)
│   ├── go.mod                            # Go module definition (module nexa-io, go 1.22)
│   ├── cmd/nexa-io/main.go               # CLI entrypoint (--mode=logs | --mode=terminal | --mode=verify-ticket)
│   ├── internal/
│   │   ├── logstream/                    # journalctl & /var/log/nexa live streamer + cloexec helpers
│   │   ├── proto/frame.go                # 13-byte big-endian Connection B binary framing + flow credits
│   │   ├── ptyutil/                      # Linux PTY allocator & non-Linux stub
│   │   ├── termstream/                   # Sandboxed VT100 PTY session server + 64 KB replay ring buffer
│   │   ├── ticket/verifier.go            # Offline Ed25519 ticket signature, expiry & scope verifier
│   │   └── ws/conn.go                    # Lightweight WebSocket binary upgrade helper
│   └── systemd/
│       ├── 50-nexa-term.rules            # Polkit restriction for terminal worker sandbox
│       ├── nexa-log.service              # Sandboxed log streamer (MemoryMax 48M, PrivateNetwork=yes)
│       ├── nexa-log.socket               # Unix socket activation (/run/nexa-log.sock)
│       ├── nexa-term.service             # Sandboxed terminal worker (MemoryMax 160M, IPAddressDeny loopback)
│       └── nexa-term.socket              # Unix socket activation (/run/nexa-term.sock)
│
├── Plan/                                 # Architectural Blueprints & Implementation PRDs
│   ├── LIGHTPANDA_HEADLESS_BROWSER_INTEGRATION_PLAN.md # Headless web automation exploration plan
│   ├── MODEL_BACKUP_GUIDE.md             # Multi-tier AI model failover guidelines
│   ├── NEXA_GEMINI_LIVE_UI_REDESIGN_PLAN.md # Live Call UI redesign blueprint
│   ├── NEXA_MOBILE_BRIDGE_CONTROL_CENTER_PLAN.md # Control Center migration plan
│   ├── NEXA_MOBILE_BRIDGE_CONTROL_CENTER_PRD.md # Full Control Center v3.1 & Dual-WS PRD
│   ├── NEXA_SCREEN_SHARING_ARCHITECTURE_PLAN.md # Multimodal screen sharing pipeline plan
│   ├── NEXA_WEB_MONITOR_PLAN.md          # N.E.X.A Pulse Monitor (/monitor) & systemd cutover plan
│   ├── NEXA_WINDOWS_BRIDGE_ARCHITECTURE_PLAN.md # Desktop companion bridge plan
│   ├── PLAN_TRANSFER_WITH_ADMIN_FEE.md   # Inter-account transfer with admin fee ledger plan
│   └── VPS_DEPLOYMENT_CHALLENGES.md      # Documented solutions for VPS networking & proxy quirks
│
├── scripts/                              # Maintenance, Migrations & Diagnostic Utilities
│   ├── audit_codebase.js                 # AST codebase scanner & dependency auditor
│   ├── audit_prompt_memory_efficiency.js # Memory token consumption & prompt bloat profiler
│   ├── backfill_directives.js            # Behavioral directives backfill utility
│   ├── build_capabilities.js             # Compiler: capability registry to Tier 0 manifest & Tier 1 cards
│   ├── clean_bad_memories.js             # Supabase memory hygiene & corrupted fact cleaner
│   ├── generate_google_master_token.js   # OAuth2 refresh token generator for Google APIs
│   ├── generate_vector_snapshot.js       # Disk-to-Supabase vector embedding synchronizer
│   ├── nexa-enroll.js                    # Interactive mobile hardware device enrollment & Ed25519 key pairing CLI
│   ├── nexa_monitor_set_password.js      # Pulse Monitor scrypt password hash generator
│   ├── reclassify_core.js                # Cognitive taxonomy audit & reclassifier
│   ├── temp_check.js                     # Ad-hoc diagnostic script
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
├── tests/                                # Automated Unit Test Suites & Hermetic Fixtures (41 Test Files)
│   ├── audit_bugs.test.js                # Regression tests: Income category fallback, godmode domains, callAI JSON
│   ├── audit_wave_a_node.test.js         # Security audit regression checks (Auth, Chat, Card, Redaction)
│   ├── capabilities_integrity.test.js    # Tier 0 manifest constraints, Tier 1 cards & anti-drift router checks
│   ├── cli_adapter.test.js               # Unit tests: CLI ingress adapter & multi-turn prompts
│   ├── common_handlers.test.js           # Unit tests: Shared domain intent handlers & escaping
│   ├── context_regressions.test.js       # Historical regression suites across context pipelines
│   ├── day_simulation.test.js            # Unit tests: Full 24-hour simulation (Briefing to Midnight)
│   ├── device_identity_spine.test.js     # Hardware ECDSA P-256 enrollment & Ed25519 session ticket tests
│   ├── directive_utils.test.js           # Unit tests: Behavioral directive parsing & counter increments
│   ├── finance_characterization.test.js  # Golden master: Invariance test suite for Finance Engine (75 cases)
│   ├── finance_stepup_service.test.js    # Hardware biometric Finance Step-Up whitelist, limit & nonce tests
│   ├── hyperlocal_spatial_engine.test.js # Hyperlocal spatial & place query engine tests
│   ├── identity_directive_flow.test.js   # Unit tests: Dynamic persona directives & alignment flow
│   ├── live_calendar_query.test.js       # Natural Indonesian weekday/relative date calendar query tests
│   ├── live_call_farewell.test.js        # Multimodal live voice call termination & summary tests
│   ├── manual_transfer_and_split_resilience.test.js # Transfer, admin fee & split disambiguation tests
│   ├── memories_characterization.test.js # Golden master: Invariance test suite for Supabase Memories (69 cases)
│   ├── memory_classifier_hygiene.test.js # 5-tier taxonomy, contingency demotions & dynamic Ebbinghaus decay tests
│   ├── micro_reviewer.test.js            # Unit tests: Micro-reviewer cognitive reflection & feedback loops
│   ├── mobile_chat_handler.test.js       # Mobile chat streaming, idempotency, replay & voice note validation tests
│   ├── mobile_interactive_cards.test.js  # 12 interactive card builders & CARD_ACTION dispatcher tests
│   ├── monitor_auth_api.test.js          # Pulse Monitor scrypt auth, lockout, CSRF, session & Polkit API tests
│   ├── monitor_issue_tracker.test.js     # Deduplicated & secret-redacted issue tracker store tests
│   ├── monitor_metrics_store.test.js     # 7-day fixed binary history ring & systemd inspector tests
│   ├── multi_bank_email_finance_sync.test.js # Multi-bank auto-sync: Mandiri & Jago email parser
│   ├── multi_device_bridge.test.js       # Multi-device bridge: Mobile/Windows routing, screen trigger & relay
│   ├── playbook_counters.test.js         # Unit tests: Behavioral playbook counters & limits
│   ├── playbook_engine.test.js           # Unit tests: Playbook engine rules & conditional SOPs
│   ├── reviewer_resilience.test.js       # Unit tests: Reviewer engine fallback & fault tolerance
│   ├── router_characterization.test.js   # Golden master: Invariance test suite for modular AI Router
│   ├── server_deep_audit_fixes.test.js   # Deep audit hardening regression tests
│   ├── server_hygiene.test.js            # Logger secret redaction, syslog category tagging & CORS hygiene tests
│   ├── sidecar_log_protocol.test.js      # Sidecar binary framing & log redaction contract tests
│   ├── sidecar_terminal_sandbox.test.js  # Sidecar PTY sandbox & command isolation contract tests
│   ├── signal_detector.test.js           # Unit tests: Real-time behavioral signal detector
│   ├── situational_synthesizer.test.js   # Dynamic context synthesis & cognitive tone modulation
│   ├── supabase_finance_characterization.test.js # Invariance test suite for modular Finance DB (25 APIs)
│   ├── task_context_resolution.test.js   # Contextual ambiguity resolution & state tracking
│   ├── telegram_adapter.test.js          # Unit tests: Telegram adapter, action builders & callbacks
│   ├── test_isolation_regression.test.js # Test isolation defense-in-depth & synthetic guard
│   ├── topic_classifier.test.js          # Classification: Topic classification & fast prompt router
│   ├── upgrade.test.js                   # Migration: Schema upgrade & database integrity validator
│   ├── version.test.js                   # Verification: Centralized version resolver & SemVer breakdown tests
│   ├── helpers/                          # Test Harness Helpers (memories_harness.js, router_harness.js)
│   └── fixtures/                         # Golden Master Fixtures (finance_golden, memories_golden, router_golden)
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
    ├── app.js                            # Express app setup, Dual-WS gateway, Monitor mount, security & cron init
    │
    ├── config/                           # Environment, Persona, Registry & Version Configuration
    │   ├── capabilities_registry.js      # Single source of truth for 17 certified capabilities, keywords & code paths
    │   ├── env.js                        # Validated environment variable loader
    │   ├── model_backup_plan.json        # Dynamic fallback parameters & retry quotas
    │   ├── personality.js                # Master executive identity prompt & behavior boundaries
    │   └── version.js                    # Centralized version definition (v4.0.0) from package.json
    │
    ├── core/                             # Core Cognitive, Auth, Multimodal & Inference Engines
    │   ├── AI_Router.js                  # Public Facade (re-exporting 18 cognitive routing APIs)
    │   ├── auth/                         # Zero-Trust Device Spine & Finance Step-Up Auth
    │   │   ├── enrolled_devices_store.js # ECDSA P-256 hardware public key registry & revocation store
    │   │   ├── finance_stepup_service.js # Deterministic whitelist, daily limit, 30s TTL nonce & ECDSA verifier
    │   │   ├── ticket_service.js         # Ed25519 challenge-response & short-lived session ticket issuer
    │   │   └── ws_auth_handler.js        # Connection A /ws auth router (ENROLL_SUBMIT, TICKET_REQ, CHALLENGE_RESP)
    │   ├── router/                       # Modular Cognitive Router Subsystem (8 Modules)
    │   │   ├── Memory_Classifier.js      # 5-tier cognitive memory classifier with contingency reasoning & 4 guardrails
    │   │   ├── Router_Cache.js           # RAM cache & TTL invalidator for personal facts, identity & self-model
    │   │   ├── Router_Classifier.js      # Fast reflex detection, candidate domain gating & topic classifier
    │   │   ├── Router_Dispatcher.js      # Master routeUserMessage orchestration loop & JSON repair
    │   │   ├── Router_Output.js          # Routing output normalization, em-dash cleanup & domain fixers
    │   │   ├── Router_Prompts.js         # Token Budget Guard, system prompt builder, Tier 0 Manifest & Anti-False-Denial Rule
    │   │   ├── Router_Selectors.js       # Semantic token extraction, word stemmer & fact relevance scorers
    │   │   └── Router_Utilities.js       # LLM utilities (callAI, classifyYesNo, classifyPending, dedupFact & memory classification)
    │   ├── Fallback_Engine.js            # SACR Dual-Mode Dynamic Fallback Router across LLM providers
    │   ├── Live_Tool_Registry.js         # 32 certified Live Tools (Desktop automation, window management, hardware control)
    │   ├── Live_Voice_Engine.js          # Bidirectional real-time Gemini Live WebSocket relay
    │   ├── Notifier.js                   # Cross-channel proactive notification dispatcher (Telegram, Mobile Chat, Push)
    │   ├── Provider_Health.js            # Dynamic API health check, circuit breaker & failover tracker
    │   ├── Topic_Classifier.js           # Fast intent/topic classification & prompt template selector
    │   ├── Vision_Engine.js              # Multimodal visual analysis & OCR engine
    │   └── Voice_Engine.js               # Groq Whisper audio transcription engine
    │
    ├── domain/                           # Business Domain & Behavioral Engines (26 Modules + 7 Finance Subsystems)
    │   ├── Agenda_Manager.js             # Google Calendar schedule synchronizer & conflict detection
    │   ├── Anticipatory_Engine.js        # Proactive agency & anticipatory nudging engine
    │   ├── App_Discipline_Engine.js      # App usage evaluator, screen time limiter & app locks
    │   ├── Behavior_Engine.js            # Mood time-series & habit tracking engine
    │   ├── Budget_Engine.js              # Expense limit & financial balance tracker
    │   ├── Chrono_Consolidator.js        # Chronological context synthesizer & temporal timeline builder
    │   ├── Device_Control_Engine.js      # Remote hardware orchestration & bridge command emitter
    │   ├── Dialectic_Engine.js           # Dialectic reasoning, cognitive debate & counter-argument synthesis
    │   ├── Discipline_GodMode.js         # Strict focus & god-mode disciplinary rules enforcement
    │   ├── Episodic_Recall.js            # Long-term episodic memory RAG & semantic retrieval
    │   ├── Finance_Engine.js             # Public Facade (56 lines) delegating to modular finance subsystems
    │   ├── Finance_Intel.js              # Financial intelligence, recurring detection, safe-to-spend & anomaly heuristics
    │   ├── finance/                      # Decomposed Modular Finance Subsystems
    │   │   ├── Finance_Analytics.js      # Financial reports, spending velocity, saving rate & balance trends
    │   │   ├── Finance_Confirmations.js  # Multi-turn confirmation lifecycle, auto-save timeout & restart recovery
    │   │   ├── Finance_Corrections.js    # Safe transaction deletions, edit & undo manager
    │   │   ├── Finance_Email_Sync.js     # Livin' by Mandiri & Bank Jago Gmail polling, parsing & transaction dedup
    │   │   ├── Finance_Helpers.js        # Currency normalizer, composite date/time parser & AI merchant categorizer
    │   │   ├── Finance_Ledger.js         # Core double-entry ledger, dual-leg transfer pairs & search queries
    │   │   └── Finance_State.js          # Shared in-memory state & lock sets (single source of truth)
    │   ├── Inference_Engine.js           # Psychological trait & user pattern inferrer
    │   ├── Intelligence_Brief.js         # Morning Briefing, Midnight & Evening brief synthesizer
    │   ├── Intention_Engine.js           # Short & long-term commitments tracker
    │   ├── Location_Orchestrator.js      # Presence context, hyperlocal spatial reasoning & location queries
    │   ├── Memory_Hygiene_Engine.js      # Step 1 hard expiry (EPHEMERAL), Step 2 Dynamic Ebbinghaus Decay (PHASE)
    │   ├── Micro_Reviewer.js             # Micro-reviewer cognitive reflection, output quality critic & guardrails
    │   ├── Playbook_Engine.js            # Behavioral playbooks, conditional execution & contextual SOPs
    │   ├── Presence_Model.js             # User physical presence, device state & focus mode estimator
    │   ├── Signal_Detector.js            # Real-time behavioral signal detector & emotional state cue parser
    │   ├── Situational_Synthesizer.js    # Emotional inertia & cross-turn situational state synthesizer
    │   ├── Split_Engine.js               # Shared expense calculation & debt settlement ledger
    │   └── Task_Manager.js               # Google Tasks integration, task prioritization & overdue detector
    │
    ├── infrastructure/                   # External Services & Database Adaptations
    │   ├── Gmail_Client.js               # Gmail auto-sync (Mandiri & Bank Jago transaction detection)
    │   ├── Google_Master_Client.js       # Centralized Google API OAuth2 client
    │   ├── Google_Tasks.js               # Google Tasks REST API client
    │   ├── Google_Workspace.js           # Google Calendar & Workspace integration
    │   ├── Location_Engine.js            # Reverse geocoding, Overpass OSM & coordinates resolver
    │   ├── Notion_Client.js              # Notion workspace sync (notes & database)
    │   ├── Supabase_Finance.js           # Public Facade (30 lines, re-exporting 25 finance DB APIs)
    │   ├── finance_db/                   # Modular Financial Database Subsystem (7 Modules)
    │   │   ├── client.js                 # Supabase client init & connection configuration
    │   │   ├── reference_data.js         # In-memory accounts/categories cache (30m TTL) & fuzzy resolvers
    │   │   ├── transactions.js           # Dual-write CRUD transactions, dual-leg transfer & split group tracking
    │   │   ├── analytics.js              # Financial metrics, savings rate, periods, trends & full pagination
    │   │   ├── budgets.js                # Budget groups, active limits & category expense summation
    │   │   ├── recurring.js              # Recurring expenses, subscription detection rules & status updates
    │   │   └── index.js                  # Public API aggregator & facade export
    │   ├── Supabase_Memories.js          # Public Facade (90 lines, re-exporting 69 memory APIs)
    │   ├── memories/                     # Modular Memory & Living Persistence Subsystem (10 Modules)
    │   │   ├── Memory_Client.js          # Supabase client init, table allowlist & ID matching helpers
    │   │   ├── Memory_Living.js          # Living memory metadata, bi-temporal superseding & chapter closing
    │   │   ├── Memory_Chat.js            # Chat memory persistence, temporal buffers & platform tagging ('mobile', 'telegram')
    │   │   ├── Memory_Finance_Dedup.js   # Transaction deduplication keys, 7-day hygiene & pending transactions
    │   │   ├── Memory_Vault.js           # 2nd Brain Vault (ideas, thoughts, notes & multi-keyword fuzzy match)
    │   │   ├── Memory_Identity.js        # User profile, core identity facts, proposals & trait commitments
    │   │   ├── Memory_Self_Model.js      # N.E.X.A self-learning model (capabilities, limitations, rules, corrections)
    │   │   ├── Memory_Learning.js        # Closed learning loop events, micro-reviewer runs & playbook counters
    │   │   ├── Memory_Chrono.js          # 90-day rolling daily narrative consolidation & raw chat buffer search
    │   │   └── Memory_Db_Browser.js      # Generic database schema overview, table inspection & CRUD operations
    │   └── Web_Search.js                 # Real-time web search crawler
    │
    ├── interfaces/                       # Ingress & Egress Channels
    │   ├── cron.js                       # Autonomous cron scheduler (Briefings, Night check-ins, Habits, Sync)
    │   ├── webhook.js                    # Inbound webhook router & Telegram dispatcher
    │   │
    │   ├── bridge/                       # Multi-Device Peripheral & Control Center Gateway
    │   │   ├── index.js                  # Bridge module barrel exports
    │   │   ├── gateway.js                # Unified WebSocket gateway (/ws, /ws/windows), IP resolver & ticket hooks
    │   │   ├── mobile_bridge/            # Android Control Center Gateway (v4.0.0)
    │   │   │   ├── adapter.js            # Neural-Peripheral event router, notifications & voice call relay
    │   │   │   ├── card_handler.js       # 12 native interactive card builders & CARD_ACTION -> CARD_UPDATE engine
    │   │   │   ├── chat_handler.js       # Native Mobile Chat engine (delta streaming, 10m CHAT_RESUME, OGG/Opus voice notes, slash commands)
    │   │   │   └── client.js             # Mobile command dispatcher & result router
    │   │   └── windows_bridge/           # Windows Desktop Companion Client & Adapter
    │   │       ├── adapter.js            # Desktop telemetry, screen capture frames & power event router
    │   │       └── client.js             # Serialized command dispatcher & request-response tracker
    │   │
    │   ├── cli/                          # Command Line Interface (Debug & Terminal Channel)
    │   │   ├── adapter.js                # CLI WebSocket/terminal communication adapter
    │   │   ├── intent_dispatcher.js      # CLI-specific intent routing & context binding
    │   │   └── interceptors.js           # CLI interceptors (Database confirmation & multi-turn flows)
    │   │
    │   ├── common/                       # Shared Cross-Channel Ingress Subsystem
    │   │   ├── domain_dispatcher.js      # Unified intent dispatcher orchestrating domain handlers
    │   │   ├── follow_up_resolver.js     # Unified multi-turn follow-up resolver & clarification validator
    │   │   ├── helpers.js                # Multi-format currency parser, HTML escaping & formatters
    │   │   └── handlers/                 # Extracted Common Domain Intent Handlers (7 Modules)
    │   │       ├── calendar_handler.js   # Agenda/Calendar intent orchestration & state retention
    │   │       ├── database_handler.js   # Dynamic database query, write & safe delete handlers
    │   │       ├── email_handler.js      # Gmail search, send, trash & platform-safe HTML escaping
    │   │       ├── finance_handler.js    # Financial tracking, dual-leg transfer, splitting & account balances
    │   │       ├── memory_handler.js     # Episodic memory, 2nd brain vault & semantic recall
    │   │       ├── system_handler.js     # Core system diagnostics, presence, discipline & location
    │   │       └── task_handler.js       # Google Tasks CRUD & status synchronization
    │   │
    │   ├── gmail/                        # Email Webhook & Polling Channel
    │   │   └── adapter.js                # Automated Gmail synchronization & transaction trigger
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
    ├── monitor/                          # N.E.X.A Pulse Monitor Subsystem (/monitor, Phases 5A-5E)
    │   ├── alert_engine.js               # Sustained threshold detector dispatching alerts to Mobile Bridge
    │   ├── auth_service.js               # scrypt auth, HttpOnly SameSite=Strict cookie sessions, CSRF & lockout
    │   ├── history_store.js              # Fixed 7-day binary ring (10,080 samples ~709 KB, 72B records) & heatmap
    │   ├── index.js                      # Pulse Monitor facade & wiring
    │   ├── issue_tracker.js              # Deduplicated error collector with FR-SEC-04 secret redaction
    │   ├── metrics_collector.js          # perf_hooks event loop lag, V8/OS RAM, HTTP RPM & Git/version probe
    │   ├── router.js                     # Express API router (/monitor/api/*) + Polkit restart endpoint
    │   ├── systemd_inspector.js          # Read-only allowlisted unit inspector (nexa-server, nexa-log, nexa-term, caddy)
    │   └── ws_metrics.js                 # Live WebSocket metric stream (/monitor/ws/metrics)
    │
    └── utils/                            # Shared Utilities & Network Security
        ├── cors_config.js                # Strict origin allowlist normalization & validation
        ├── directive_utils.js            # Directive parsing, counter increment & dynamic prompt injector
        ├── gemini_vector_cache.js        # In-memory vector embedding cache with Tier 1 capability matching (~0.05ms)
        ├── logger.js                     # Structured logger, [cat=...] auto-tagging & secret/PII redaction
        ├── security.js                   # Identity lock, webhook secret & token guards
        ├── telegram_network.js           # Resilient HTTP client with retry logic
        └── telegram_proxy.js             # Relay fallback & proxy route resolver
```

---

## 2. N.E.X.A FINANCE WEB ARCHITECTURE (Standalone Repository: `Knightrelaxed/nexa-finance`)
* **Repository:** [`Knightrelaxed/nexa-finance`](https://github.com/Knightrelaxed/nexa-finance) *(diektraksi keluar dari monorepo `nexa-server` agar rilis web berjalan independen)*
* **Target Runtime:** Node.js >= 18.0.0 (Next.js App Router)
* **Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Lucide React, Radix UI / shadcn Primitives, Recharts, Supabase JS v2
* **Role:** Sovereign Financial Web Portal, Realtime Cashflow Dashboard, PWA Mobile Ledger & Analytics

```text
nexa-finance/ (Standalone Repo -> https://github.com/Knightrelaxed/nexa-finance)
├── app/
│   ├── dashboard/page.tsx                # Executive Net Worth KPI, deep-link akun (/accounts?id=...) & cashflow summary
│   ├── records/page.tsx                  # Full paginated transaction stream, filter & Supabase-style In-Card Refresh
│   ├── accounts/page.tsx                 # Bank Mandiri, Bank Jago, e-wallets & cash account detail views
│   ├── budget/page.tsx                   # Monthly/weekly budget envelopes & limit progress gauges
│   ├── analytics/page.tsx                # Spending velocity, category breakdown & monthly trends
│   ├── settings/page.tsx                 # Account profiles, category hierarchies & wallet preferences
│   └── login/page.tsx                    # Supabase Auth portal & middleware session guards
├── components/wallet/                    # Financial domain views, modals, filters & responsive shell
├── hooks/use-finance-data.ts             # Core reactive Supabase hook & real-time mutation sync
├── lib/supabase/                         # Typed queries, mutations, client & schema definitions
└── public/                               # PWA manifest & Service Worker offline asset caching
```

---

## 3. N.E.X.A MOBILE BRIDGE ARCHITECTURE (Android 16 / One UI 8 / Kotlin)
* **Local Path:** `C:\workspace\nexa-mobile-bridge`
* **Target Hardware:** Samsung Galaxy A33 5G (`arm64-v8a` / API 36)
* **Package:** `com.nexa.mobilebridge` (`versionName: 1.0`, Control Center v3.1)
* **Role:** Native Mobile AI Control Center (Chat-First Compose + Room + Paging 3, 12 Interactive Cards, Voice Notes, Slash Commands), Dual-WS Terminal & Journald Logs Client (`/io/term`, `/io/logs`), Hardware Keystore & Biometric Finance Gate, Sensor Synthesis & Multimodal Live Call Host

```text
nexa-mobile-bridge/
├── build.gradle.kts                      # Root Gradle build script & plugin definitions
├── settings.gradle.kts                   # Project module inclusion & repository settings
├── gradle.properties                     # Gradle daemon & JVM memory allocations
├── local.properties                      # Android SDK path & local developer configurations
├── gradlew                               # Unix Gradle wrapper executable
├── gradlew.bat                           # Windows Gradle wrapper executable
│
├── docs/                                 # Protocol Specifications, RAM Audit & Documentation
│   ├── JSON_PROTOCOL_SPECIFICATION.md    # Full bidirectional JSON payload spec
│   ├── MOBILE_BRIDGE_TESTING_REPORT.md   # Hardware sensor & latency test results
│   ├── NEXA_MOBILE_BRIDGE_DOCUMENTATION.md # Complete Control Center v3.1 technical documentation
│   └── RAM_USAGE_AUDIT_REPORT.md         # dumpsys meminfo audit (Home Standby ~50.0 MB physical RAM)
│
└── app/                                  # Main Android Application Module (minSdk 36, targetSdk 36)
    ├── build.gradle.kts                  # Compose, Room, Paging 3, Hilt, Biometric, CameraX, OkHttp
    │
    └── src/main/
        ├── AndroidManifest.xml           # Banking-safe permissions (Zero AccessibilityService), services & receivers
        │
        ├── res/                          # Android UI Resources & Configurations
        │   ├── drawable/                 # Vector drawables & notification icons (ic_notif_nexa)
        │   ├── mipmap-*/                 # Application adaptive launcher icons (N.E.X.A Logo)
        │   ├── values/                   # Color palettes, string resources & theme definitions
        │   └── xml/                      # backup_rules.xml & data_extraction_rules.xml
        │
        └── java/com/nexa/mobilebridge/   # Kotlin Source Code
            │
            ├── NexaBridgeApp.kt          # Application entry point (@HiltAndroidApp)
            ├── MainActivity.kt           # Jetpack Compose container with Standby UI Hibernation
            ├── Navigation.kt             # Top-level Navigation Graph (Chat, Logs, Terminal, HUD, Settings)
            ├── NavigationKeys.kt         # Navigation route destination constants
            ├── NexaBridgeService.kt      # 24/7 Foreground Service with On-Demand Power Locks
            ├── TransparentCameraActivity.kt # Background CameraX photo capture without UI distraction
            │
            ├── core/                     # Core Engine, Auth, Networking & Power Subsystems
            │   ├── auth/
            │   │   └── TicketAuthRepository.kt # Enrollment, challenge-response & Ed25519 ticket cache
            │   ├── context/
            │   │   └── ContextEngine.kt  # Multi-sensor synthesis & situational compound rule engine
            │   ├── di/                   # Dependency Injection (Dagger Hilt)
            │   │   ├── AppModule.kt      # Context, Room DB & DataStore dependency provider
            │   │   └── NetworkModule.kt  # OkHttpClient & WebSocket client provider
            │   ├── network/              # WebSocket & Networking Subsystems
            │   │   ├── NexaWebSocketClient.kt # Connection A (/ws) OkHttp WebSocket client & keepalive
            │   │   └── ReconnectOrchestrator.kt # Tiered Retry Engine + Voice TTS alerts
            │   ├── power/
            │   │   └── BridgePowerLockManager.kt # On-demand Partial WakeLock & WifiLock acquisition
            │   ├── receiver/
            │   │   └── BootCompletedReceiver.kt # Auto-start service on device reboot
            │   ├── security/
            │   │   ├── BiometricAuthHelper.kt # BiometricPrompt CryptoObject authenticator
            │   │   ├── DeviceKeystoreManager.kt # Android Keystore ECDSA P-256 hardware key pair & signer
            │   │   ├── HmacVerifier.kt   # HMAC-SHA256 signature verifier (GodMode commands)
            │   │   ├── SecretKeyStoreCipher.kt # AES-GCM Keystore encryption for DataStore secrets
            │   │   └── WindowSecureEffect.kt # FLAG_SECURE privacy protection on sensitive UI screens
            │   ├── sensor/               # Physical Hardware Sensor Listeners
            │   │   ├── GeofenceBroadcastReceiver.kt # GPS Geofence background transition receiver
            │   │   ├── GeofenceManager.kt # Google Play Services Geofencing (Home/Work)
            │   │   ├── GeofenceModel.kt  # Geofence coordinates & radius data model
            │   │   └── SensorObserverManager.kt # Ambient Light, Motion, Step Counter, Pickup Gesture
            │   ├── usage/
            │   │   └── AppUsageTracker.kt # Banking-safe foreground tracker via UsageStatsManager
            │   └── util/
            │       └── ConnectionState.kt # Connection A & B reactive state flows
            │
            ├── data/                     # Persistence, Chat Streaming, Logs & Terminal Clients
            │   ├── chat/
            │   │   ├── ChatCopyText.kt   # Markdown-clean clipboard text formatter
            │   │   ├── ChatRepository.kt # Single source of truth (Room + WebSocket CHAT_SEND/RESUME + Card Actions)
            │   │   ├── ChatStreamConsumer.kt # Delta-streaming accumulator & card patch updater
            │   │   ├── ChatVisibilityTracker.kt # Tracks foreground chat focus vs OS notifications
            │   │   ├── InteractiveCardModels.kt # Strongly typed models for all 12 Interactive Cards
            │   │   ├── VoiceNoteMetadata.kt # Voice note duration, peaks & codec metadata
            │   │   ├── VoiceNotePlayer.kt # In-bubble audio waveform player
            │   │   └── VoiceNoteRecorder.kt # OGG/Opus MediaRecorder with ceiling & live metering
            │   ├── local/
            │   │   ├── chat/             # Room Database (nexa_chat.db) Entities, DAOs & Paging 3 sources
            │   │   └── NexaPreferencesDataStore.kt # Keystore-encrypted DataStore (URL, device token, Ed25519 keys)
            │   ├── logs/
            │   │   ├── CircularLogBuffer.kt # Bounded ring buffer for monospace live logs
            │   │   ├── LogBinaryProtocol.kt # Connection B 13-byte binary frame parser (0x03 channel)
            │   │   └── SidecarLogsClient.kt # Dedicated WebSocket client for /io/logs
            │   └── terminal/
            │       ├── ModifierState.kt  # Ctrl, Alt & special key sticky modifier state
            │       ├── SidecarTerminalClient.kt # Dedicated WebSocket client for /io/term
            │       ├── TerminalBinaryProtocol.kt # Connection B binary framing & PTY resize/resume encoder
            │       └── Vt100TerminalEmulator.kt # ANSI/VT100 terminal screen buffer & escape parser
            │
            ├── dispatcher/               # Remote Command Execution Layer
            │   ├── DeviceCommandDispatcher.kt # Master router for incoming server commands
            │   └── handler/              # Hardware & System Action Handlers (20 Modules)
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
            │       ├── ScreenHandler.kt        # Home, Back & screen lock actions
            │       ├── ScreenshotHandler.kt    # MediaProjection screen capture trigger
            │       ├── TtsHandler.kt           # Text-to-Speech (Indonesian voice with auto-sanitization)
            │       ├── VoiceRecorderHandler.kt # Voice note recorder
            │       ├── VoiceStreamHandler.kt   # Continuous PCM audio stream from microphone
            │       └── VolumeHandler.kt        # Multi-stream volume controller & DND interruption filter
            │
            ├── notification/             # Native Chat Notifications & OS Direct Reply
            │   ├── ChatNotificationActionReceiver.kt # Handles Inline Direct Reply without launching Activity
            │   └── ChatNotificationManager.kt # Bundled chat notifications & sound/vibration alerts
            │
            ├── protocol/                 # Data Models & JSON Schemas
            │   ├── CallEvent.kt          # Call interaction event model
            │   ├── CommandResult.kt      # Command execution return result model
            │   ├── ContextReport.kt      # High-level situational context event model
            │   ├── NexaActions.kt        # Action name string constants
            │   ├── NexaCommand.kt        # Incoming server command schema
            │   └── TelemetryReport.kt    # Periodic device telemetry schema (Battery, Wi-Fi, Screen)
            │
            ├── service/                  # Android System Services & Overlay Hosts
            │   ├── FloatingLifecycleOwner.kt # Lifecycle & SavedState owner for WindowManager overlay
            │   ├── FloatingOverlayManager.kt # Compact non-intrusive system alert overlay window manager
            │   ├── NexaNotifListenerService.kt # Notification listener (Alarm Dismiss & trigger sync)
            │   └── ScreenCaptureService.kt # MediaProjection foreground service
            │
            ├── theme/                    # Jetpack Compose Theme & Design System
            │   ├── Color.kt              # OLED executive dark palette & LocalNexaColors composition
            │   ├── Theme.kt              # Material3 dark theme setup
            │   └── Type.kt               # Typography & font styling
            │
            └── ui/                       # User Interfaces (Jetpack Compose)
                ├── call/
                │   ├── FakeCallActivity.kt   # Interactive Call Screen
                │   └── NexaExpressiveEyes.kt # Animated digital OLED eyes companion
                ├── chat/
                │   ├── ChatMessageActions.kt # Long-press copy, retry & bubble contextual menu
                │   ├── ChatScreen.kt         # Paging 3 chat timeline, voice input bar & streaming bubbles
                │   ├── ChatViewModel.kt      # Chat UI state, voice recording & step-up coordination
                │   ├── FinanceStepUpBottomSheet.kt # Biometric CryptoObject bottom sheet for whitelisted finance ops
                │   ├── InteractiveCardView.kt # Native Compose renderer for 12 server-driven Interactive Cards
                │   └── SlashCommandPalette.kt # Inline `/` command picker (/briefing, /budget, /vault, etc.)
                ├── components/
                │   └── NexaChrome.kt         # Shared executive header chrome & navigation shell
                ├── hud/
                │   ├── HudScreen.kt          # Bridge connection & Dual-WS diagnostic HUD
                │   └── HudViewModel.kt       # HUD telemetry & connection toggle state
                ├── logs/
                │   ├── LogViewerScreen.kt    # Real-time Connection B monospace VPS journald viewer
                │   └── LogViewerViewModel.kt # Ticket acquisition, unit filters & circular buffer state
                ├── overlay/
                │   └── OverlayActivity.kt    # Dynamic transparent activity dialog host
                ├── settings/
                │   ├── SettingsComponents.kt # LazyColumn settings UI building blocks
                │   ├── SettingsScreen.kt     # Server URL, enrollment, biometrics & bridge controls
                │   ├── SettingsSheetsAndDialogs.kt # Enrollment, clear cache & diagnostic modal sheets
                │   └── SettingsViewModel.kt  # Encrypted DataStore & enrollment state manager
                └── terminal/
                    ├── TerminalAccessoryBar.kt # Touch Esc, Tab, Ctrl, Alt & arrow keys strip
                    ├── TerminalInputSink.kt  # Keyboard & IME raw PTY byte bridge
                    ├── TerminalScreen.kt     # Interactive VT100 sandboxed shell Canvas view
                    └── TerminalViewModel.kt  # PTY attach, resume ring & resize dispatcher
```

---

## 4. N.E.X.A WINDOWS BRIDGE ARCHITECTURE (Rust / Slint / Win32 / WASAPI / Direct3D 11)
* **Local Path:** `C:\workspace\nexa-windows-bridge`
* **Target Hardware:** Lenovo ThinkPad X380 Yoga (Intel Core i5-8350U, UHD Graphics 620, Realtek HD Audio, Touchscreen / Stylus)
* **Tech Stack:** Rust 2021 Edition, Slint GUI Framework 1.18, Tokio Multi-threaded Async Runtime, Windows-Capture Direct3D 11, CPAL WASAPI, Sonora DSP WebRTC AEC3, Windows-Sys Win32 API
* **Binary Outputs:** `target/release/Nexa Bridge.exe`, `dist/Nexa Bridge.exe` (alias: `nexa-bridge.exe`)
* **Role:** Sovereign Native Desktop Companion, Hardware Audio Duplex (WASAPI + AEC3 DAC Tap), Direct3D 11 GPU Screen Capture, Native Desktop Automation (SendInput, UIA Magnetic Snap), Transparent AR Overlays & Multi-Tier OS Security Isolation (Armed Guard, 15-Min Lease, Terminal Shield)
* **Current Version:** v0.1.0 (`Cargo.toml`)

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
| **Modular Intent Ingress** | Inter-process / Pipeline | Adapter Kanal (`telegram/`, `cli/`, `mobile_bridge/`) | Common Dispatcher (`common/`) | Normalisasi payload intent lintas-kanal ke 7 handler domain bersama dengan platform-aware escaping & state retention. |
| **Cognitive AI Routing** | Pipeline / Fallback Engine | Server (`AI_Router.js` Facade & `router/`) | Fallback Engine & LLM Providers | Klasifikasi domain intent, gating dinamis skema tool, injeksi persona, RAM cache TTL, dan eksekusi multi-provider dengan Token Budget Guard. |
| **Mobile Native Chat & Voice Notes** | Connection A WebSocket (`CHAT_SEND`, `CHAT_DELTA`, `CHAT_RESUME`, `CHAT_VOICE_NOTE`) | Android (`ChatRepository.kt`, `VoiceNoteRecorder.kt`) | Server (`chat_handler.js`) | Streaming teks real-time per delta token, buffer replay 10 menit anti-putus, slash commands & voice note OGG/Opus. |
| **Mobile 12 Interactive Cards & Step-Up** | Connection A WebSocket (`CARD_RENDER`, `CARD_ACTION`, `CARD_UPDATE`) | Server (`card_handler.js`, `finance_stepup_service.js`) | Android (`InteractiveCardView.kt`, `FinanceStepUpBottomSheet.kt`) | Kartu interaktif native (`FINANCE_TX`, `BRIEFING_SUMMARY`, `BUDGET_RECAP`, dll.) & tanda tangan biometrik Keystore ECDSA P-256 untuk aksi finansial sensitif. |
| **Device Auth & Ed25519 Tickets** | Connection A (`ENROLL_SUBMIT`, `TICKET_REQ`, `CHALLENGE_RESP`) | Android (`DeviceKeystoreManager.kt`, `TicketAuthRepository.kt`) | Server (`ws_auth_handler.js`, `ticket_service.js`) | Enrollment perangkat keras ECDSA P-256 dan penerbitan tiket Ed25519 berjangka pendek bagi Connection B sidecars. |
| **Go Sidecar Logs & Terminal PTY** | Connection B Binary 13-Byte (`wss://.../io/logs`, `wss://.../io/term`) | Android (`SidecarLogsClient.kt`, `SidecarTerminalClient.kt`) | Go Sidecar (`nexa-io`, `nexa-log.socket`, `nexa-term.socket`) | Streaming journald real-time berredaksi rahasia (`redactSecrets`) dan sesi shell VT100 sandboxed dengan 64 KB replay ring. |
| **Mobile Hardware Commands & Context** | Connection A (`EXECUTE_COMMAND`, `COMMAND_RESULT`, `CONTEXT_UPDATE`) | Server (`mobile_bridge/client.js` & `adapter.js`) | Android (`DeviceCommandDispatcher.kt`, `ContextEngine.kt`) | Eksekusi aksi fisik HP, laporan sensor & App Discipline (`UsageStatsManager`, zero AccessibilityService). |
| **Mobile & Windows Live Call / Vision** | WebSocket (`CALL_AUDIO_STREAM`, `CALL_VIDEO_FRAME`, `CALL_REPLY_PCM`) | Android & Windows Companion | Server (`Live_Voice_Engine.js`) | Audio PCM dupleks 16kHz + frame layar/kamera ke Gemini Live API beserta respon suara instan. |
| **Windows Desktop Automation** | WebSocket (`EXECUTE_COMMAND` / `/ws/windows`) | Server (`Live_Tool_Registry.js`, `windows_bridge/client.js`) | Windows (`automation/mod.rs`) | Eksekusi aksi native Windows (klik mouse, Ketik Unicode, scroll, kelola window, lock screen) dengan Armed Guard 15-menit. |
| **Pulse Monitor Observability** | HTTPS + WSS (`/monitor/api/*`, `/monitor/ws/metrics`) | VPS Systemd / Node `metrics_collector.js` | Browser Admin (`Caddy` -> `src/monitor/router.js`) | Metrik VPS real-time, histori biner 7-hari (~709 KB), issue tracker terdeduplikasi, dan restart `nexa-server.service` via Polkit. |
| **Financial Ledger & Portal** | REST / Supabase PostgreSQL | Server (`Finance_Engine.js`) & `Knightrelaxed/nexa-finance` | Supabase PostgreSQL (`finance_db/`) | Buku besar kas, transfer dual-leg, auto-sync Bank Mandiri & Bank Jago, serta dashboard web Next.js terpisah. |
| **User Memory & 5-Tier Living RAG** | Vector Similarity & Contingency Classifier | Classifier (`Memory_Classifier.js`) | Living Memory (`Memory_Living.js`) & `facts_vectors.json` | Klasifikasi 5 tingkat (`CORE`, `PHASE`, `PREFERENCE`, `RULE`, `EPHEMERAL`), bi-temporal superseding & peluruhan Ebbinghaus. |
| **Self-Knowledge Progressive Disclosure** | In-Memory / Router Prompts | Registry (`capabilities_registry.js`) | `Router_Prompts.js` & `gemini_vector_cache.js` | Injeksi Tier 0 Manifes v4.0.0 (~265 token) dengan Anti-False-Denial Rule dan penarikan Tier 1 Kartu (~0.05ms) di RAM. |
| **Gemini AI Studio US Relay** | HTTPS Proxy (`iad1` Edge) | Server (`Fallback_Engine.js`) | Vercel Edge (`nexa-gemini-proxy`) -> Google | Akses API Gemini via US Washington D.C. gateway untuk latensi optimal dan bypass batasan regional. |
| **Terminal Console CLI** | HTTPS / JSON Webhook & SSE | Standalone Terminal (`nexa-cli`) | Server (`interfaces/cli/adapter.js`) | Akses kontrol konsol eksekutif N.E.X.A bergaya HUD Cyberpunk dari terminal remote. |

