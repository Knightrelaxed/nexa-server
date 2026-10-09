# N.E.X.A Ecosystem — Complete Folder Architecture & File Tree

> **Document:** `docs/NEXA_FOLDER_ARCHITECTURE.md`  
> **Ecosystem:** N.E.X.A 3.0 (Server + Mobile Bridge)  
> **Last Updated:** 2026-10-09  
> **Format:** Structured Plain Text ASCII Tree with Functional Descriptions  

---

## 1. N.E.X.A Server Architecture (Node.js / Azure VPS)
**Root Path:** `C:\workspace\nexa-server` (Local) / `/home/nexa/nexa-server` (VPS)

```text
nexa-server/
├── package.json                          # Project manifest & production dependencies
├── ecosystem.config.js                   # PM2 process manager configuration (VPS deployment)
├── cloudflare-worker/                    # Cloudflare Edge Relay proxy worker
│   └── nexa-relay.js                     # Edge relay for Telegram API & media compression
├── docs/                                 # Technical whitepapers & security hardening docs
│   ├── CORE_IDENTITY_AUDIT_REPORT.md
│   ├── GOOGLE_MASTER_OAUTH2_ARCHITECTURE_PLAN.md
│   ├── JSON_PROTOCOL_SPECIFICATION.md
│   ├── MOBILE_BRIDGE_TESTING_REPORT.md
│   ├── NEXA_AZURE_VPS_PRODUCTION_ARCHITECTURE.md
│   ├── NEXA_FOLDER_ARCHITECTURE.md
│   ├── NEXA_MOBILE_BRIDGE_DOCUMENTATION.md
│   ├── NEXA_SECURITY_ARCHITECTURE_AND_HARDENING.md
│   ├── NEXA_VERSION_EVOLUTION_ROADMAP.md
│   └── NEXA_Whitepaper.md
│
└── src/                                  # Main Application Source Code
    ├── app.js                            # Express application setup, security headers & CORS
    │
    ├── config/                           # Environment & Personality Configurations
    │   ├── env.js                        # Environment variable loader & validator
    │   ├── personality.js                # Core prompt identity & executive persona rules
    │   └── model_backup_plan.json        # Dynamic fallback configurations
    │
    ├── core/                             # Core Cognitive & Inference Engines
    │   ├── AI_Router.js                  # Master Cognitive Brain, Intent Classifier & Prompt Fusion
    │   ├── Fallback_Engine.js            # SACR v2.4 (15-Tier Dual-Mode Dynamic Fallback Router)
    │   ├── Live_Tool_Registry.js         # Function calling & Agent Tool execution catalog
    │   ├── Live_Voice_Engine.js          # Bidirectional real-time Gemini Live WebSocket relay
    │   ├── Vision_Engine.js              # Multimodal visual inference engine
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

## 2. N.E.X.A Mobile Bridge Architecture (Android / Kotlin)
**Root Path:** `C:\workspace\nexa-mobile-bridge`  
**Target Hardware:** Samsung Galaxy A33 5G (Android 16 / One UI 8)  
**Package:** `com.nexa.mobilebridge`

```text
nexa-mobile-bridge/
├── build.gradle.kts                      # Root Gradle build configuration
├── settings.gradle.kts                   # Project module settings
├── docs/                                 # Protocol specifications & test reports
│   ├── JSON_PROTOCOL_SPECIFICATION.md    # Full bidirectional JSON payload spec
│   ├── MOBILE_BRIDGE_TESTING_REPORT.md   # Hardware sensor & latency test results
│   └── NEXA_MOBILE_BRIDGE_DOCUMENTATION.md# Complete technical documentation
│
└── app/src/main/
    ├── AndroidManifest.xml               # App privileges, foreground services & permissions
    │
    ├── res/                              # UI resources (drawables, layouts, mipmaps, themes)
    │
    └── java/com/nexa/mobilebridge/       # Android Kotlin Source Code
        │
        ├── NexaBridgeApp.kt              # Application entry point (@HiltAndroidApp)
        ├── MainActivity.kt               # Jetpack Compose Edge-to-Edge root container
        ├── Navigation.kt                 # Compose Navigation graph
        ├── NavigationKeys.kt             # Navigation route constants
        ├── NexaBridgeService.kt          # 24/7 Foreground Service (WakeLock + WifiLock)
        ├── NexaAccessibilityService.kt   # System Accessibility (Click, Scroll, Screenshot, UI Tree)
        ├── SafeBankingLauncherActivity.kt# Banking app launcher with screen shielding
        ├── TransparentCameraActivity.kt  # Background CameraX capture without UI distraction
        │
        ├── core/                         # Core Android Engines
        │   ├── context/
        │   │   └── ContextEngine.kt      # Multi-sensor synthesis & compound rule engine
        │   ├── di/                       # Dependency Injection (Dagger Hilt)
        │   │   ├── AppModule.kt          # Context & DataStore provider
        │   │   └── NetworkModule.kt      # OkHttpClient & JSON serialization provider
        │   ├── network/                  # WebSocket & Networking Subsystems
        │   │   ├── NexaHttpClient.kt     # HTTP helper client
        │   │   ├── NexaWebSocketClient.kt# OkHttp WebSocket client & keepalive ping (20s)
        │   │   └── ReconnectOrchestrator.kt # 4-Phase Tiered Retry Engine + Voice TTS alerts
        │   ├── receiver/
        │   │   └── BootCompletedReceiver.kt # Auto-start service on phone restart (Boot Completed)
        │   ├── security/
        │   │   ├── HmacVerifier.kt       # HMAC-SHA256 signature verifier (GodMode Privilege >= 3)
        │   │   └── MBankingShieldManager.kt # Privacy screen shield for banking apps
        │   ├── sensor/                   # Physical Hardware Sensor Listeners
        │   │   ├── GeofenceBroadcastReceiver.kt # GPS Geofence background transition receiver
        │   │   ├── GeofenceManager.kt    # Google Play Services Geofencing (Home/Work 100m)
        │   │   ├── GeofenceModel.kt      # Geofence location data model
        │   └── SensorObserverManager.kt  # Ambient Light, Motion, Step Counter, Pickup Gesture
        │   ├── usage/
        │   │   └── AppUsageTracker.kt    # Foreground app tracker via UsageStatsManager
        │   └── util/
        │       └── ConnectionState.kt    # Sealed class for WebSocket connection state
        │
        ├── data/                         # Data Persistence
        │   ├── DataRepository.kt         # Reactive DataStore preferences repository
        │   └── local/
        │       └── NexaPreferencesDataStore.kt # Encrypted preferences (URL, Bearer Token, HMAC Key)
        │
        ├── dispatcher/                   # Remote Command Execution Layer
        │   ├── DeviceCommandDispatcher.kt# Master router for incoming server commands (28 Actions)
        │   └── handler/                  # 18 Specialized Hardware Handlers
        │       ├── AppLauncherHandler.kt # App launcher by package name
        │       ├── AudioPlayerHandler.kt # Ringtone, media playback & PCM audio stream player
        │       ├── BatteryHandler.kt     # Battery level & charging state monitor
        │       ├── CameraHandler.kt      # Camera photo trigger (Transparent CameraX)
        │       ├── CameraStreamHandler.kt# Live video frame streamer for Gemini Multimodal
        │       ├── ClipboardHandler.kt   # System clipboard read & write
        │       ├── FakeCallHandler.kt    # Simulated incoming call launcher
        │       ├── FlashlightHandler.kt  # Torch light toggle via CameraManager
        │       ├── GeofenceHandler.kt    # Dynamic geofence area register
        │       ├── IntentHandler.kt      # Browser URL, Maps & sharing intents
        │       ├── LocationHandler.kt    # GPS / Network location & Geocoder address lookup
        │       ├── NetworkHandler.kt     # Wi-Fi state & signal strength (RSSI dBm)
        │       ├── OverlayHandler.kt     # System Alert Window (Compose overlay dialog)
        │       ├── ScreenHandler.kt      # Home, Back, Recents & screen lock actions
        │       ├── ScreenshotHandler.kt  # Full screen capture via Accessibility API
        │       ├── TtsHandler.kt         # Text-to-Speech (Indonesian voice with auto-sanitization)
        │       ├── VoiceRecorderHandler.kt # Voice note recorder
        │       ├── VoiceStreamHandler.kt # Continuous PCM audio stream from microphone
        │       └── VolumeHandler.kt      # Multi-stream volume controller & DND interruption filter
        │
        ├── protocol/                     # Data Models & JSON Schemas
        │   ├── CallEvent.kt              # Call interaction event model (Accepted, Rejected, Reply)
        │   ├── CommandResult.kt          # Command execution return result model
        │   ├── ContextReport.kt          # High-level situational context event model
        │   ├── NexaActions.kt            # Action name string constants (28 Actions)
        │   ├── NexaCommand.kt            # Incoming server command schema
        │   └── TelemetryReport.kt        # Periodic device telemetry schema (Battery, Wi-Fi, Screen)
        │
        ├── service/
        │   └── NexaNotifListenerService.kt # Notification listener (Samsung/Google Clock Alarm Dismiss)
        │
        ├── theme/                        # Jetpack Compose Theme & Styling
        │   ├── Color.kt
        │   ├── Theme.kt
        │   └── Type.kt
        │
        └── ui/                           # User Interfaces (Jetpack Compose)
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
