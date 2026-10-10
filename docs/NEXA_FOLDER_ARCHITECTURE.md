# N.E.X.A Ecosystem — Complete Architecture & File Tree

> **Document:** `docs/NEXA_FOLDER_ARCHITECTURE.md`  
> **Ecosystem:** N.E.X.A 3.0 (Sovereign Cloud Core + Mobile Hardware Bridge)  
> **Last Updated:** 2026-10-10  
> **Format:** Comprehensive Plain-Text ASCII Tree with Deep Functional Annotations  

---

## 1. N.E.X.A SERVER ARCHITECTURE (Node.js & Next.js Ecosystem)
* **Local Path:** `C:\workspace\nexa-server`
* **Production Host:** Azure Central Indonesia VPS (`/home/nexa/nexa-server`)
* **Role:** Sovereign Cognitive Core, Multi-Model Router, Database Ledger, Realtime Relays & Web Portal

```text
nexa-server/
├── Dockerfile                            # Production container build specification
├── .dockerignore                         # Docker build artifact exclusion rules
├── ecosystem.config.js                   # PM2 process manager configuration (VPS deployment)
├── package.json                          # Main project manifest & production dependencies
├── package-lock.json                     # Deterministic dependency lockfile
├── README.md                             # Repository overview & quick start guide
├── .env.example                          # Blueprint environment variable template
│
├── cloudflare-worker/                    # Cloudflare Edge Relay Subsystem
│   └── nexa-relay.js                     # Edge proxy worker for Telegram Bot API & media processing
│
├── data/                                 # Local Storage & Snapshot Datastore
│   ├── facts_vectors.json                # In-memory snapshot of pgvector memory embeddings
│   └── transcripts_dump/                 # Raw conversation transcripts & session archives
│
├── database/                             # Database Migrations & Supabase PostgreSQL Schemas
│   ├── app_limits_migration.sql          # Screen time & application usage discipline rules
│   ├── budget_schema.sql                 # Expense categories, balances & budget tracking tables
│   ├── migration_daily_narratives.sql    # Daily cognitive narrative & identity evolution logs
│   ├── migration_enable_all_nexa_rls.sql # Comprehensive Row Level Security (RLS) hardening
│   ├── migration_enable_rls.sql          # Base RLS security policies
│   ├── migration_notifier_recurring.sql  # Scheduled notifications & recurring task triggers
│   ├── migration_settings.sql            # Core assistant settings & user configuration store
│   ├── migration_split_transaction.sql   # Shared expense & transaction splitting ledger
│   ├── phase6_migration.sql              # Cognitive Identity, Mood Time-Series & Dual Memory tables
│   └── phase7_migration.sql              # Causal Knowledge Graph & dynamic self-inference schema
│
├── docs/                                 # Architecture Whitepapers & Documentation
│   ├── CORE_IDENTITY_AUDIT_REPORT.md     # Persona integrity & identity verification report
│   ├── GOOGLE_MASTER_OAUTH2_ARCHITECTURE_PLAN.md # Centralized OAuth2 token infrastructure
│   ├── JSON_PROTOCOL_SPECIFICATION.md    # Bidirectional WebSocket schema (Nexa Protocol 3.0)
│   ├── MOBILE_BRIDGE_TESTING_REPORT.md   # Sensor latency & hardware test logs
│   ├── NEXA_AZURE_VPS_PRODUCTION_ARCHITECTURE.md # Sovereign VPS Jakarta deployment whitepaper
│   ├── NEXA_FOLDER_ARCHITECTURE.md       # This complete ecosystem folder directory tree
│   ├── NEXA_MOBILE_BRIDGE_DOCUMENTATION.md # Complete Android bridge technical documentation
│   ├── NEXA_ORACLE_CLOUD_MIGRATION_PLAN.md # Secondary cloud disaster recovery plan
│   ├── NEXA_SECURITY_ARCHITECTURE_AND_HARDENING.md # Comprehensive security hardening guide
│   ├── NEXA_VERSION_EVOLUTION_ROADMAP.md # Version evolution & release milestone roadmap
│   ├── NEXA_Whitepaper.md                # General N.E.X.A architecture whitepaper
│   ├── PHASE6_DUAL_MEMORY_SYSTEM.md      # Dual-memory (Episodic + Semantic) architectural design
│   ├── PHASE_4_ADVANCED_WORKFLOW.md      # Autonomous background workflows & task chains
│   ├── PHASE_5_NEXA_V3_WEB_UI.md         # Web portal frontend specifications
│   └── PHASE_6_COGNITIVE_IDENTITY_ENGINE.md # Cognitive user modeling & identity inference engine
│
├── logs/                                 # Runtime application logs (PM2 / Express)
│
├── nexa-finance-web/                     # Next.js 14 Sovereign Financial Web Portal
│   ├── package.json                      # Next.js frontend dependencies (Tailwind, Lucide, Supabase)
│   ├── app/                              # Next.js App Router (Dashboard, Ledger, Analytics, Login)
│   ├── components/                       # Reusable UI widgets, charts & dark-mode navigation
│   ├── hooks/                            # Custom React hooks (real-time Supabase subscriptions)
│   ├── lib/                              # Supabase browser/server client & auth helpers
│   ├── public/                           # Static assets, branding logos & PWA icons
│   └── styles/                           # Global Tailwind CSS configurations & themes
│
├── Plan/                                 # Architectural Blueprint & Engineering Challenges
│   ├── MODEL_BACKUP_GUIDE.md             # Multi-tier AI model failover guidelines
│   └── VPS_DEPLOYMENT_CHALLENGES.md      # Documented solutions for VPS networking & proxy quirks
│
├── scripts/                              # Maintenance, Migrations & Diagnostic Utilities
│   ├── audit_prompt_memory_efficiency.js # Memory token consumption & prompt bloat profiler
│   ├── clean_bad_memories.js             # Supabase memory hygiene & corrupted fact cleaner
│   ├── generate_google_master_token.js   # OAuth2 refresh token generator for Google APIs
│   ├── generate_vector_snapshot.js       # Disk-to-Supabase vector embedding synchronizer
│   └── trigger_weekly.js                 # Manual runner for weekly cognitive synthesis
│
├── tests/                                # Automated Test Suites & Benchmark Runners
│   ├── day_simulation.test.js            # Full 24-hour simulation test (Briefing to Midnight)
│   ├── dismiss_call.js                   # Simulated incoming call dismissal test
│   ├── duel_gemma_31b_vs_26b.js          # Latency & reasoning benchmark across model versions
│   ├── system_test.js                    # End-to-end integration test runner
│   ├── test_both_tiers.js                # Dual-mode (Light vs Heavy) tier validation
│   ├── test_cf_relay_live.js             # Cloudflare Edge relay connectivity tester
│   ├── test_chrono_consolidation.js      # Chronological memory consolidation test
│   ├── test_generalized_recall.js        # Semantic memory retrieval accuracy test
│   ├── test_google_master_client.js      # Google OAuth2 client diagnostic test
│   └── test_intention_engine.js          # Intention tracking & commitment evaluator test
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
│
└── src/                                  # Main Backend Application Source Code
    ├── app.js                            # Express app setup, strict security headers, CORS & loopback
    │
    ├── config/                           # Environment & Persona Configuration
    │   ├── env.js                        # Validated environment variable loader
    │   ├── personality.js                # Master executive identity prompt & behavior boundaries
    │   └── model_backup_plan.json        # Dynamic fallback parameters & retry quotas
    │
    ├── core/                             # Core Cognitive & Inference Engines
    │   ├── AI_Router.js                  # Master Cognitive Brain, Intent Classifier & Prompt Fusion
    │   ├── Fallback_Engine.js            # SACR v2.4 (15-Tier Dual-Mode Dynamic Fallback Router)
    │   ├── Live_Tool_Registry.js         # Function calling & Agent Tool execution catalog
    │   ├── Live_Voice_Engine.js          # Bidirectional real-time Gemini Live WebSocket relay
    │   ├── Vision_Engine.js              # Multimodal visual analysis engine
    │   └── Voice_Engine.js               # Groq Whisper audio transcription engine
    │
    ├── domain/                           # Business Domain & Behavioral Engines
    │   ├── Agenda_Manager.js             # Google Calendar schedule synchronizer
    │   ├── Anticipatory_Engine.js        # Proactive agency & anticipatory nudging engine
    │   ├── App_Discipline_Engine.js      # App usage evaluator & screen time limiter
    │   ├── Behavior_Engine.js            # Mood time-series & habit tracking engine
    │   ├── Budget_Engine.js              # Expense limit & financial balance tracker
    │   ├── Chrono_Consolidator.js        # Chronological context synthesizer
    │   ├── Device_Control_Engine.js      # Remote hardware orchestration logic
    │   ├── Discipline_GodMode.js         # Strict focus & god-mode disciplinary rules
    │   ├── Episodic_Recall.js            # Long-term episodic memory RAG & semantic retrieval
    │   ├── Finance_Engine.js             # Financial transaction processor & double-entry logic
    │   ├── Inference_Engine.js           # Psychological trait & user pattern inferrer
    │   ├── Intelligence_Brief.js         # Morning Briefing, Midnight & Evening brief synthesizer
    │   ├── Intention_Engine.js           # Short & long-term commitments tracker
    │   ├── Location_Orchestrator.js      # Presence context & spatial reasoning
    │   ├── Memory_Hygiene_Engine.js      # Memory deduplication & decay manager
    │   ├── Split_Engine.js               # Shared expense calculation engine
    │   └── Task_Manager.js               # Google Tasks integration & overdue detector
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
    ├── interfaces/                       # Communication Ingress & Egress Channels
    │   ├── cron.js                       # Cron background jobs (Morning Briefing, Night Checkin)
    │   ├── webhook.js                    # Inbound webhook router & Telegram dispatcher
    │   ├── cli/
    │   │   └── adapter.js                # Command Line Interface debug adapter
    │   ├── gmail/
    │   │   └── adapter.js                # Email webhook / polling adapter
    │   ├── mobile_bridge/                # Android Smartphone Interface Gateway
    │   │   ├── adapter.js                # Master Neural-Peripheral Adapter
    │   │   └── MobileBridge_WS.js        # WebSocket server (/ws), auth & keepalive watchdog
    │   ├── telegram/                     # Telegram Bot User Interface
    │   │   ├── actions.js                # Telegram interactive keyboard actions
    │   │   ├── adapter.js                # Inbound message receiver & formatting engine
    │   │   └── callback_handler.js       # Inline keyboard button click router
    │   └── whatsapp/                     # WhatsApp Baileys integration (backup channel)
    │       ├── adapter.js
    │       ├── auth_storage.js
    │       └── formatter.js
    │
    └── utils/                            # Shared Utilities & Network Security
        ├── gemini_vector_cache.js        # In-memory vector embedding cache
        ├── logger.js                     # Structured colored asynchronous logger
        ├── security.js                   # Identity lock (Single Chat ID: 6798861902) & rate-limiting
        ├── telegram_network.js           # Resilient HTTP client with retry logic
        └── telegram_proxy.js             # Relay fallback & proxy route resolver
```

---

## 2. N.E.X.A MOBILE BRIDGE ARCHITECTURE (Android 16 / One UI 8 / Kotlin)
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
            │   └── handler/              # 18 Specialized Hardware & System Handlers
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

## 3. DATA BINDING & INTERACTION MATRIX

| Jalur Aliran Data | Protokol / Saluran | Komponen Asal | Komponen Tujuan | Deskripsi / Fungsi |
|---|---|---|---|---|
| **Hardware Commands** | WebSocket (`EXECUTE_COMMAND`) | Server (`MobileBridge_WS.js`) | Android (`DeviceCommandDispatcher.kt`) | Eksekusi 28 aksi fisik (kamera, screenshot, klik layar, volume, senter, dll.). |
| **Command Results** | WebSocket (`COMMAND_RESULT`) | Android (`DeviceCommandDispatcher.kt`) | Server (`MobileBridge_WS.js`) | Pengembalian data eksekusi (Base64 foto, hierarki UI, status). |
| **Situational Context** | WebSocket (`CONTEXT_UPDATE`) | Android (`ContextEngine.kt`) | Server (`adapter.js`) | Laporan sensor real-time (`ROOM_DARK_NIGHT`, `PHONE_PICKUP_MORNING`, dll.). |
| **Live Call & Video** | WebSocket (`CALL_AUDIO_STREAM`) | Android (`VoiceStreamHandler.kt`) | Server (`Live_Voice_Engine.js`) | Streaming audio PCM & frame video ke Google Gemini Live API. |
| **Audio Output** | WebSocket (`CALL_REPLY_PCM`) | Server (`Live_Voice_Engine.js`) | Android (`AudioPlayerHandler.kt`) | Pemutaran respon suara instan (*sub-second TTFA*) ke speaker HP. |
| **Financial Ledger** | REST / Realtime Database | Server (`Finance_Engine.js`) | Supabase PostgreSQL (`Supabase_Finance.js`) | Buku besar kas, sinkronisasi Bank Mandiri & pelacakan pengeluaran. |
| **User Memory RAG** | Vector Similarity (pgvector) | Server (`Episodic_Recall.js`) | Supabase PostgreSQL (`Supabase_Memories.js`) | Penarikan memori percakapan jangka panjang & fakta kepribadian Tuan. |
| **Financial Portal** | HTTPS / Server-Side Rendering | Web Browser (`nexa-finance-web`) | Server API & Supabase | Dashboard visual analitik keuangan, grafik pengeluaran & anggaran. |
