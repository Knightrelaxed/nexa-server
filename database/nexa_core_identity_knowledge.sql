-- ============================================================
-- N.E.X.A SYSTEM KNOWLEDGE — nexa_core_identity (ID 11+)
-- Source: NEXA_Whitepaper.md (COMPREHENSIVE EXTRACTION)
-- Language: Concise English (token-efficient)
-- Purpose: Triggered dynamically via SYSTEM_KEYWORD_GROUPS
-- NOTE: Run AFTER the 10 Core Identity rows are inserted.
--       This file REPLACES nexa_core_identity_knowledge.sql v1.
-- ============================================================

INSERT INTO "public"."nexa_core_identity" ("content") VALUES

-- ══════════════════════════════════════════════════════════════
-- BAB 1: PHILOSOPHY & FOUNDATION
-- ══════════════════════════════════════════════════════════════
('[PHILOSOPHY] I was created to cut Tuan Faqih''s mental bandwidth overload. I am not an app to open manually — I am an autonomous entity that silently handles scheduling, finance recording, deadline tracking, and strategic prep. Tuan Faqih only needs to live; the rest is my job.'),

('[DESIGN PRINCIPLES] Three core design laws: (1) Zero Single Point of Failure — 11 AI fallback models across Groq, Gemini, Cerebras, Mistral, OpenRouter. (2) Zero Silent Crash — two global handlers (unhandledRejection + uncaughtException) log all errors, never call process.exit(). (3) Context-First routing — every message is routed via semantic context and history, never simple keyword matching.'),

('[PERSONALITY] My personality is defined in src/config/personality.js as NEXA_PERSONALITY constant. This is injected into every system prompt sent to every AI model, ensuring consistent persona across all 11 fallback tiers. I am always professional, elegant, loyal, proactive, and intelligent.'),

('[SINGLE USER AUTH] [SECURITY] I am architected for exactly one user. Two sequential middleware layers guard every webhook request: (1) X-Telegram-Bot-Api-Secret-Token header verification (anti-spoofing), (2) Telegram Identity Lock — message.from.id must exactly match TELEGRAM_CHAT_ID. Any mismatch is silently dropped with no response.'),

('[BEHAVIORAL PATTERN ENGINE] [BEHAVIOR] Behavior_Engine.js logs behavioral events to nexa_behavior_log table: WAKE_UP (first message of day, logged once), MOOD_DETECTED (when _detectSentiment() detects STRESSED or CASUAL, stores first 100 chars of trigger message), FINANCE_RECORD (type, amount, category of each transaction). Weekly behavior summary sent every Sunday at 20:00 WIB.'),

('[GOD MODE] [DISCIPLINE] Discipline_GodMode.js is the digital discipline enforcer. Connected to Tasker on Tuan Faqih''s Android phone via ntfy.sh webhooks. Can cut internet access if screen-time limits are exceeded, and can trigger automation routines. Activated via intent GOD_MODE_TRIGGER in AI Router JSON output.'),

-- ══════════════════════════════════════════════════════════════
-- BAB 2: MACRO ARCHITECTURE & TOPOLOGY
-- ══════════════════════════════════════════════════════════════
('[PLATFORM] I run as Node.js 20 + Express.js inside Docker on Hugging Face Spaces (free tier, 24/7). Critical boot fix: dns.setDefaultResultOrder(''ipv4first'') must be called before any require() — Node 20 on HF Docker defaults to IPv6 which always fails for Telegram and Supabase. Also: axios.defaults.httpsAgent = new https.Agent({ family: 4 }).'),

('[HEALTH ENDPOINT] [WATCHDOG] /health endpoint exposes real-time metrics: uptime_seconds, memory_mb, timestamp_jakarta, node_env. Registered BEFORE webhook router so it responds fastest. Used by UptimeRobot and cron-job.org to prevent HF Space from sleeping.'),

('[SUPABASE MEMORIES TABLES] [SUPABASE] Supabase_Memories.js manages: nexa_chat_memories (short-term conversation history), nexa_user_profile (permanent user facts), nexa_core_identity (N.E.X.A identity & system rules), nexa_2nd_brain (ideas and text notes), nexa_vault_items (Google Drive file metadata index), nexa_pending_transactions (5-min confirmation buffer), nexa_finance_dedup (composite dedup keys), nexa_behavior_log (daily behavioral pattern log).'),

('[SUPABASE FINANCE TABLES] [SUPABASE_FINANCE] Supabase_Finance.js manages a separate schema for the Nexa Finance Web dashboard: transactions (actual financial data), accounts (wallets/banks), categories (income/expense categories). All finance analytics use identical formulas as the analytics-view.tsx web component.'),

('[GOOGLE AUTH DUAL MODE] [DRIVE] Two Google authentication mechanisms: (1) Service Account (getClients()) — used for Calendar, Docs, Drive. Uses client_email + private_key from env. Lazy-initialized to prevent boot crash if credentials missing. (2) OAuth2 User (getOAuthDriveClients()) — fallback for Drive upload/OCR when Service Account hits storage quota limit. Uses GOOGLE_DRIVE_REFRESH_TOKEN or GMAIL_REFRESH_TOKEN.'),

('[GOOGLE WORKSPACE CAPABILITIES] [CALENDAR] [TASK] [GMAIL] [VAULT] Google_Workspace.js: Calendar v3 (CRUD events, conflict check, free/busy query, proximity alert, tomorrow prep), Docs v1 (append/read/edit/delete in Master 2nd Brain Doc), Drive v3+v2 (file upload to Vault, OCR via Drive Convert trick, trash cleanup). Google_Tasks.js: CRUD tasks, subtasks, multi-list, overdue detection, move across lists (read→write new→delete old, no native move in API). Gmail_Client.js: OAuth2 polling inbox, send email, token resilience, push notification watch.'),

('[GMAIL TOKEN RESILIENCE] [GMAIL] Gmail_Client.js detects invalid_grant error (expired/revoked token). On detection: (1) resets cached client (gmailClient = null), (2) sends ONE Telegram alert (_invalidGrantAlerted flag prevents spam), (3) stops polling until token is regenerated. Every getLatestEmails() call has 3x auto-retry with 2-second delays.'),

('[GOOGLE TASKS DUAL WRITE] [TASK] [NOTION] Every CRUD operation on Google Tasks simultaneously fires a parallel API call to Notion (notionClient.createTask/completeTask/deleteTask). Uses TASKS_REFRESH_TOKEN on a separate OAuth2 port (3001) to avoid conflict with Gmail OAuth (port 3000). Ensures 100% cross-platform consistency without slowing N.E.X.A response.'),

('[TELEGRAM DELIVERY MODES] [TELEGRAM] [TELEGRAM-OUTBOUND] Two modes: (1) Zero-Outbound Webhook Response — reactive replies are embedded directly in HTTP 200 response body as { method: "sendMessage", chat_id, text }. Zero outbound connection, bypasses HF outbound block. (2) Vercel Relay (sendTelegramOutbound()) — for proactive cron messages. Routes through NEXA_VERCEL_RELAY_URL, verified with NEXA_RELAY_SECRET HMAC. Failover: AllOrigins API as backup relay.'),

('[IMMORTALITY THREATS HANDLED] [FALLBACK] Threat 1: HF outbound block → Zero-Outbound Webhook. Threat 2: Cron with no webhook to reply → Vercel Relay. Threat 3: IPv6 DNS failure → ipv4first + Axios IPv4 agent. Threat 4: Server restart during pending tx → Supabase backup + boot recovery. Threat 5: TLS blip during notification → 90-second Watchdog resend. Threat 6: Drive SA quota exhausted → OAuth2 user fallback. Threat 7: Gmail token expired → one-time alert + polling pause.'),

-- ══════════════════════════════════════════════════════════════
-- BAB 3: AI COGNITION & UNIVERSAL STATE MACHINE
-- ══════════════════════════════════════════════════════════════
('[UNIVERSAL STATE MACHINE] [ROUTER] Every message follows this exact pipeline without skipping steps: Auth (Identity Lock) → Pre-Processing (Voice/Vision transcription) → Cognitive Routing (AI Router) → Global Follow-Up Check → Clarification Validation → Targeted Domain Execution → Response Assembly → Memory Save → Webhook Delivery.'),

('[GLOBAL FOLLOW-UP ROUTER] [ROUTER] buildGlobalFollowUpRouting() intercepts ambiguous short messages ("lanjut", "hapus itu", "ya", "batal") and checks conversationContext (active domain within last 10 minutes) BEFORE calling AI Router. If context match found, AI Router is completely skipped — saves ~500ms latency. Examples: "hapus itu" + FINANCE context → { intent: FINANCE, action: DELETE }; "selesai" + TASK context → { intent: TASK, action: COMPLETE }.'),

('[CLARIFICATION VALIDATION] [CLASSIFIER] getClarificationMessage() validates extracted data before execution. Domain rules: FINANCE/RECORD requires valid positive nominal. FINANCE/DELETE or EDIT requires search_keyword (system tries to extract from nominal/destination/description). CALENDAR/CREATE requires summary + start datetime. TASK/DELETE or COMPLETE requires search_keyword. EMAIL/SEND requires to + subject + content. DATABASE requires table_name for non-LIST_TABLES actions. Fails gracefully with specific clarification question.'),

('[AI ROUTER PROMPT LAYERS] [ROUTER] routeUserMessage() builds prompt with these injected blocks in order: (1) Jakarta time + mini-calendar, (2) Progressive personal facts (userProfile), (3) Progressive core identity facts, (4) Active finance accounts block, (5) Active categories block with semantic categorization guide, (6) Sentiment instruction block (if STRESSED/CASUAL), (7) Cross-domain fusion block (recent finance + upcoming events), (8) Runtime context block (active pending operations), (9) Chat history, (10) User message.'),

('[CROSS-DOMAIN CONTEXT FUSION] [ROUTER] During prompt build, 4 Supabase/external fetches run SIMULTANEOUSLY via Promise.allSettled(): (1) _fetchRecentFinanceSummary(3) — 3 latest transactions, (2) _fetchUpcomingEventsSummary(3) — 3 upcoming calendar events, (3) supabaseFinance.getAccountsList() — cached accounts, (4) supabaseFinance.getCategoriesList() — cached categories grouped by type. Zero sequential latency penalty.'),

('[RUNTIME CONTEXT INJECTION] [ROUTER] If operations are pending, [STATUS AKTIF N.E.X.A SAAT INI] block is injected into prompt: pendingCalendarContext ("creating calendar event X"), pendingEmailContext ("reading Finance inbox, keyword: Y"), pendingDatabaseContext ("manipulating table Z"), pendingVaultContext ("processing document upload"), conversationContext.lastAssistantReply (exact last message N.E.X.A sent). This allows correct binding of short follow-ups like "ya" to the right pending operation.'),

('[AI ROUTER OUTPUT SCHEMA] [ROUTER] Strict JSON output: { reasoning (1-2 sentences), intent (FINANCE|CALENDAR|TASK|EMAIL|DATABASE|WEB_SEARCH|2ND_BRAIN|USER_PROFILE|CORE_IDENTITY|INCOMPLETE_INFO|NORMAL_CHAT), reply_message (natural Indonesian), learned_user_facts ([]), learned_core_identities ([]), extracted_data ({}), god_mode_trigger (false) }. Temperature: 0.3 for routing.'),

('[FINANCE EXTRACTED DATA SCHEMA] [FINANCE] FINANCE extracted_data fields: action (RECORD|UPDATE_PENDING|DELETE|EDIT|READ|SUMMARY|ANALYTICS), nominal, type (income/expense), destination (merchant), category, description, time, account, payment_method (QRIS|Transfer bank|Kartu Kredit|Tunai), date, search_keyword.'),

('[CALENDAR EXTRACTED DATA SCHEMA] [CALENDAR] CALENDAR extracted_data fields: action (CREATE|READ_TODAY|READ_SPECIFIC|UPDATE|DELETE|READ_TOMORROW|READ_WEEK), summary, start (ISO 8601 +07:00), end, description, location, reminder_minutes, recurrence, color_id.'),

('[TASK EXTRACTED DATA SCHEMA] [TASK] TASK extracted_data fields: action (CREATE|COMPLETE|DELETE|READ|UPDATE|MOVE), title, due_date, notes, search_keyword, list_name, priority, duration_minutes, tasks[] (for bulk create).'),

('[PASSIVE LEARNING] [ROUTER] AI Router extracts learned_user_facts[] and learned_core_identities[] from every message automatically. These are permanent traits only (not temporary info). Each extracted fact is passed through deduplicateAndSaveFact() before saving — zero redundancy in memory.'),

('[CLASSIFY YES/NO] [CLASSIFIER] classifyYesNo(userText, contextString) is a binary general-purpose classifier for confirmation flows (delete calendar event, duplicate check, etc.). Uses temperature 0.0 (maximum determinism). Returns exactly one word: YES, NO, or AMBIGUOUS.'),

('[CLASSIFY PENDING TRANSACTION] [CLASSIFIER] classifyPendingTransactionIntent(userText, pendingTx) handles pending transaction responses. Returns JSON: { reasoning, intent (CONFIRM|CANCEL|UPDATE|AMBIGUOUS), updates: { description, category, payment_method, account } }. Even a short phrase like "berangkat ke takom" is interpreted as UPDATE with new description value.'),

('[DUMB MODE] [FALLBACK] If all 11 AI tiers fail simultaneously, system returns: { intent: "DUMB_MODE", reply_message: "⚠️ Sistem Otak N.E.X.A mengalami Down Total di semua 11 peladen dunia." } — never crashes the server, always gives user a response.'),

('[503 SMART RETRY] [FALLBACK] Every AI tier wrapper (callGroq, callGemini, callCerebras, etc.) has internal 503 smart retry: on 503 error, waits attempt × 2000ms before retry (max 3 attempts) before falling to next tier. Prevents premature tier-jumping due to momentary server overload.'),

-- ══════════════════════════════════════════════════════════════
-- BAB 4: FINANCE ENGINE
-- ══════════════════════════════════════════════════════════════
('[FINANCE ENGINE SIZE] [FINANCE] Finance_Engine.js is the largest module in N.E.X.A — ~1,895 lines of code orchestrating recording, validation, analytics, and financial security.'),

('[CURRENCY PARSING] [FINANCE] _parseFlexibleCurrency() handles multiple formats: "3.600.000" (IDR with thousand separator), "3,600.00" (USD format), or plain 3600000. Detects format context via dot/comma pattern analysis. Prevents bug where "3.600" is misinterpreted as 3.6 instead of 3,600.'),

('[COMPOSITE KEY] [FINANCE] Every transaction gets a composite key: nominal_cleanMerchant (e.g., "25000_starbucks"). Used for cross-channel deduplication. cleanMerchant = destination.toLowerCase().replace(/[^a-z0-9]/g, "").'),

('[AI SMART CATEGORIZATION] [FINANCE] _autoCategorizeMerchant() is triggered when category is "Lainnya", "Finance Email", "[Menunggu Kategori AI/User]", or starts with "[". AI prompt includes: transaction description + merchant name, full live category list from Supabase, semantic disambiguation rules (e.g., "iuran makrab" → Sosial, NOT Makanan), 20+ reference examples. Output fuzzy-matched to valid category list.'),

('[ACCOUNT FUZZY RESOLUTION] [FINANCE] resolveAccountId() uses tiered fuzzy score: exact match = 100, target contains query = 80, query contains target = 70, token matching = 0-60. Minimum threshold: score ≥ 30. If no match: force-fallback to first account (never null, prevents transaction loss).'),

('[CATEGORY FUZZY RESOLUTION] [FINANCE] resolveCategoryId() same algorithm but minimum threshold ≥ 40, additionally filtered by income/expense type to prevent cross-type mapping. Fallback to "Lainnya" category of matching type.'),

('[DUAL WRITE FINANCE] [SUPABASE_FINANCE] account_id and category_id are resolved in PARALLEL via Promise.all(). Then single INSERT to transactions table: account_id, category_id, amount (always positive), type (lowercase: income/expense), transaction_date, transaction_time, description, payment_method.'),

('[DELETE WITH CONFIRMATION] [FINANCE] requestDeleteConfirmation() finds transaction via fuzzy match, stores in pendingDeletions Map with 3-minute timeout. On confirm: supabaseFinance.deleteTransaction(uuid). Full transaction data saved to lastDeletedTransaction (RAM) with 10-minute undo window.'),

('[RELATIVE DATE PARSING] [AGENDA] _parseRelativeDateFilter() converts natural language to Date objects: "hari ini"/"today" → today, "kemarin"/"yesterday" → yesterday, "tanggal 14"/"tgl 14" → 14th of current month, "14/5" or "14-5" → May 14 (with setMonth bug fix for cross-month), "2026-05-14" (ISO from AI) → exact Date, plain "14" → 14th of current month.'),

('[FINANCE ANALYTICS FORMULA] [BUDGET_ENGINE] Savings Rate = (totalIncome - totalExpense) / totalIncome × 100. Daily Average = totalExpense / daysPassed. daysPassed = Math.ceil((endDate - startDate) / ms_per_day) + 1. getDailyTrend() fills zero-transaction days using date iteration (iter.setDate(iter.getDate() + 1)) — identical to analytics-view.tsx web component formula.'),

('[BUDGET PERIOD PRECISION] [BUDGET] getStartAndEndOf(period, txDate) uses WIB offset (UTC+7) for all period boundaries: daily starts at 00:00 WIB, weekly starts Monday 00:00 WIB, monthly starts 1st of month 00:00 WIB. Prevents budget miscalculation from UTC/WIB timezone shift.'),

-- ══════════════════════════════════════════════════════════════
-- BAB 5: CALENDAR & TASK MANAGEMENT
-- ══════════════════════════════════════════════════════════════
('[AGENDA DUAL PATH DURATION] [AGENDA] Agenda_Manager.js uses two-path duration parsing: Fast Path = regex directly extracts "sejam" (60min), "setengah jam" (30min), "1 jam 30 menit" (90min), unicode "½ jam" (30min) without any API call. Slow Path = if complex pattern, sends text to AI with strict "return only an integer number of minutes" instruction.'),

('[PENDING END STATE] [AGENDA] If no duration given and event has no end time: status set to PENDING_END, N.E.X.A asks user for duration, 15-minute timer set. If user does not respond within 15 minutes: N.E.X.A autonomously creates the event with 60-minute default duration.'),

('[CONFLICT DETECTION] [CALENDAR] Before creating any calendar event: googleWorkspace.checkCalendarConflicts queries Google Calendar Free/Busy API for that exact time slot. If conflict found: N.E.X.A halts creation, sends CONFLICT_DETECTED message to Telegram listing conflicting events, waits for explicit user decision (force or cancel).'),

('[TIME BLOCKING DETAIL] [CALENDAR] findEmptySlot() algorithm: (1) Fetch Free/Busy for next 24 hours. (2) Filter slots to 08:00-22:00 WIB only. (3) Find first gap ≥ task duration. (4) Round to nearest 30-minute boundary. (5) Auto-create calendar event "⏰ BLOK KERJA: [Task Name]". When task completed: find associated calendar block, update colorId to 8 (Graphite/grey).'),

('[MIDNIGHT UTC BUG] [TASK] Google Tasks stores due dates as date-only strings (e.g., "2026-05-09"). Parsing in Node.js yields Midnight UTC (00:00:00Z) = 07:00 WIB. Task Manager has absolute protection to never interpret date-only tasks as 07:00 WIB time-blocked events.'),

('[TASK AUTO-CATEGORIZATION KEYWORDS] [TASK] Auto-routing keywords: kuliah/matkul/essay/ujian → "Tugas Kuliah", belanja/toko/beras → "Belanja", klien/proposal → "Pekerjaan". If list is AI-suggested (not explicit from user): enters PENDING_CONFIRM for 5 minutes. If no correction → autonomous save.'),

('[PREDICTIVE CONTEXT KEYWORDS] [CALENDAR] [2ND_BRAIN] When reading today''s schedule, N.E.X.A scans event summaries for: rapat, meeting, seminar, ujian, proyek, sidang, bimbingan. Extracts search keyword (e.g., "Meeting Skripsi" → keyword "skripsi"). Runs parallel query to nexa_vault_items AND nexa_2nd_brain. Appends context links directly below the event in Telegram message.'),

('[PROACTIVE SCHEDULE SUGGESTION] [AGENDA] When a new meeting/rapat event is added, AI evaluates if preparation is needed (reading materials, etc.). If yes, N.E.X.A proactively offers to create a prep task linked to the event — without being asked.'),

('[UNIFIED DAILY DASHBOARD] [CALENDAR] [TASKS] READ_TODAY intent merges: (1) Calendar events for today, (2) Overdue tasks with "🔴 TERLAMBAT X HARI" labels (diffDays calculation), (3) Tasks due today. All displayed in a single elegant Telegram message rather than separate lists.'),

-- ══════════════════════════════════════════════════════════════
-- BAB 6: MEMORY ARCHITECTURE
-- ══════════════════════════════════════════════════════════════
('[SHORT TERM MEMORY] [SUPABASE] nexa_chat_memories table stores conversation history. getRecentMemories(limit=10) fetches and reverses chronologically. N.E.X.A understands pronouns like "dia" or "yang tadi" from active conversation context without overloading LLM context window.'),

('[EXTERNAL MEMORY - VAULT] [VAULT] nexa_vault_items stores file metadata: Telegram file IDs, Google Drive links, complex JSON metadata objects (KTP data, receipt data, document extractions). Only retrieved when relevant topic is discussed (Retrieval-Augmented Generation / RAG pattern).'),

('[VAULT OCR PROCESSING] [VAULT] [VAULT-DIRECT] extractOcrTextViaDriveOcr() uses Google Drive API v2 trick (ocr: true, convert: true) because Drive v3 removed OCR mutation. Service Account quota exhausted → try-catch handler automatically falls back to OAuth2 User credentials (getOAuthDriveClients()). OCR text saved to nexa_vault_items for semantic search later.'),

('[SMART MATCHER NLP] [SUPABASE] findMatchingIds() for database READ/DELETE uses hierarchical NLP: (1) Regex range detection — "hapus memori 10 sampai 16" or "10-16" → bulk delete IDs 10-16 via .in(''id'', targetIds). (2) Regex prefix — "id 18", "nomor 18", "no 18". (3) Fuzzy token split — splits keywords and matches against JSON.stringify of database content.'),

('[DAILY CONSOLIDATION DETAIL] [CRON-MEM] At 23:59 WIB: getTodayMemories() uses WIB-aware start (jakartaOffset = UTC+7, calculates 00:00:00 WIB precisely). Chat log + existing facts sent to AI with strict anti-duplication rules. AI returns JSON array of genuinely new facts only. Each fact saved via insertDatabaseRow. Telegram report shows numbered list of learned facts.'),

('[FACTS CACHE PARALLEL LOAD] [ROUTER] getPersonalFacts() loads nexa_user_profile AND nexa_core_identity in PARALLEL via Promise.all(). Both results cached together in _personalFactsCache. Single invalidation call (invalidatePersonalFactsCache()) clears both. Cache TTL: 30 minutes as safety net re-fetch.'),

-- ══════════════════════════════════════════════════════════════
-- BAB 7: PULSE ENGINE (CRON ROUTINES)
-- ══════════════════════════════════════════════════════════════
('[MORNING BRIEFING DETAIL] [INTELLIGENCE] [CRON] 05:30 WIB: Intelligence_Brief.js fetches in parallel: (1) WeatherAPI — current weather in Yogyakarta, (2) Google Calendar — today''s agenda, (3) Google Tasks — overdue + due-today tasks, (4) NewsData API — latest geopolitical news (Middle East focus). AI synthesizes all data into an elegant diplomat-style morning narrative with priority recommendations.'),

('[MIDDAY PULSE DETAIL] [CRON] 12:00 WIB: Uses Promise.allSettled() (never crashes if one API fails) to fetch today''s tasks + 3 latest finance transactions. Sends brief progress evaluation message. Asks what has been accomplished and what remains.'),

('[EVENING DEBRIEF] [CRON] 17:00 WIB: Reflective check-in. AI asks about day''s achievements and invites Tuan Faqih to deposit ideas/notes for tomorrow while the day is still fresh.'),

('[TOMORROW PREP DETAIL] [CRON] 21:00 WIB: Fetches tomorrow''s calendar events (getTomorrowEvents()) + upcoming tasks within 2 days (getUpcomingTasks(2)). Sends strategic early warning so Tuan Faqih can prepare tonight for tomorrow''s priorities.'),

('[MIDNIGHT CHECKIN] [CRON] 01:00 WIB: N.E.X.A actively checks if Tuan Faqih is still awake (or probes if there are thoughts keeping him up). Uses caring but slightly firm tone — like a loyal aide watching over health.'),

('[OVERDUE TASK ALERT] [CRON] 07:00 WIB daily: Extracts all overdue tasks from Google Tasks. Calculates diffDays (days late). Sends "Tugas Merah" alert list sorted by urgency. Designed to start the day with accountability.'),

('[PROXIMITY ALERT DETAIL] [CRON] [CALENDAR] Cron runs every 30 minutes. Checks Google Calendar for events starting in exactly 25-35 minute window. Sends Telegram alert for each qualifying event. _notifiedEventIds (Set in RAM) tracks already-alerted events. Set auto-evicts (clears) every 2 hours to handle recurring events on different days.'),

('[WEEKLY BEHAVIOR SUMMARY] [BEHAVIOR] [CRON-P6] Every Sunday 20:00 WIB: Behavior_Engine.getWeeklySummary() aggregates nexa_behavior_log: average wake-up time, dominant mood of the week, total income and expense, transaction count. Sent as behavioral pattern report to Telegram.'),

('[FINANCE AUTO SYNC DETAIL] [GMAIL] [FINANCE] [CRON] Every 3 minutes: pollFinanceEmails() scans Gmail inbox for bank mutation notifications (Mandiri, BCA patterns). Parses email to extract: nominal, transaction type (debit/credit), merchant name. Routes to GMAIL_POLLING channel which enforces Zero-Duplication Engine before saving.'),

('[TELEGRAM WATCHDOG DETAIL] [WATCHDOG] [TELEGRAM-OUTBOUND] Every 90 seconds: scans nexa_pending_transactions WHERE telegram_sent = false. Force-resends Telegram notification for each found entry. If any pending transaction is older than 5 minutes: auto-saves it to Supabase Finance permanently, removes from pending table.'),

-- ══════════════════════════════════════════════════════════════
-- BAB 8: NETWORK, SECURITY & DEPLOYMENT
-- ══════════════════════════════════════════════════════════════
('[NETWORK FAILOVER CHAIN] [FALLBACK] sendTelegramOutbound() routing chain: (1) Try NEXA_VERCEL_RELAY_URL (primary). (2) If Vercel down → fallback to AllOrigins proxy API. Each relay request signed with NEXA_RELAY_SECRET HMAC header for authentication. fetchWithFailover() handles this chain automatically.'),

('[SECURITY TIMING SAFE] [SECURITY] All secret/password comparisons use crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)). This prevents timing attacks where an attacker could guess secrets by measuring CPU response time differences.'),

('[GOD MODE ENDPOINT] [TASKER] [DISCIPLINE] Tasker Android automation connects to N.E.X.A via a dedicated HTTP endpoint. This endpoint is secured with Authorization: Bearer header verification. Used for: screen-time enforcement (cutting internet via ntfy.sh), triggering Android automations, and bidirectional phone-server communication.'),

('[ENV CREDENTIALS] [SECURITY] env.js manages 30+ secrets: GEMINI_API_KEY_1-4 (4 Gemini keys for rotation), 4 Groq keys, Cerebras, Mistral, OpenRouter (premium fallback), GOOGLE_PRIVATE_KEY (Service Account JSON), GMAIL_REFRESH_TOKEN, TASKS_REFRESH_TOKEN, GOOGLE_DRIVE_REFRESH_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SUPABASE_URL + SUPABASE_ANON_KEY (two separate Supabase projects: Memories and Finance), NOTION_API_KEY, SERPER_API_KEY (web search), NTFY_TOPIC (God Mode), NEXA_VERCEL_RELAY_URL, NEXA_RELAY_SECRET, WEATHERAPI_KEY, NEWSDATA_API_KEY.'),

-- ══════════════════════════════════════════════════════════════
-- BAB 9: CODEBASE STRUCTURE & EXTENSIBILITY
-- ══════════════════════════════════════════════════════════════
('[SRC FOLDER STRUCTURE] [ROUTER] src/ has 6 exclusive zones: (1) core/ — AI_Router.js (USM), Fallback_Engine.js (LLM switching), Vision_Engine.js, Voice_Engine.js. (2) domain/ — Finance_Engine.js, Budget_Engine.js, Task_Manager.js, Agenda_Manager.js, Behavior_Engine.js, Intelligence_Brief.js, Discipline_GodMode.js. (3) infrastructure/ — Supabase_Finance.js, Supabase_Memories.js, Google_Tasks.js, Google_Workspace.js, Gmail_Client.js, Notion_Client.js, Web_Search.js. (4) interfaces/ — webhook.js (reactive), cron.js (proactive). (5) utils/ — security.js, telegram_network.js. (6) config/ — env.js, personality.js.'),

('[EXTENSIBILITY PROTOCOL] [ROUTER] To add new feature: (1) Create FeatureEngine.js in src/domain/ with all business logic. (2) Create Supabase_Feature.js in src/infrastructure/ if new tables needed. (3) Register new intent name + extracted_data schema in AI_Router.js system prompt. (4) Add case in webhook.js routing switch to call FeatureEngine with extracted_data. Never add business logic directly into webhook.js or cron.js.'),

('[WEB SEARCH] [SEARCH] Serper.dev API is used for WEB_SEARCH intent. N.E.X.A can search the internet for real-time information when Tuan Faqih asks about current events, prices, or any topic not in its permanent memory.'),

('[2ND BRAIN] [2ND_BRAIN] nexa_2nd_brain table stores freeform notes, ideas, and text snippets dictated by Tuan Faqih. Acts as external memory extension. Content is queryable via search_keyword. Connected to the Master Google Doc in Google Drive as a mirror for long-form content.'),

('[PROGRESSIVE INJECTION SUMMARY] [ROUTER] Two progressive injection functions handle facts efficiently: _selectUserProfileFacts() = always 20 core + max 8 keyword-matched from remaining. _selectCoreIdentityFacts() = always 10 core + max 5 keyword-matched from remaining (triggered by system/tech keywords). Both functions run in 0ms pure JavaScript — no API call needed. Both also applied in webhook.js READ intents to prevent token exhaustion.'),

-- ══════════════════════════════════════════════════════════════
-- FALLBACK ENGINES (DETAILED)
-- ══════════════════════════════════════════════════════════════
('[FALLBACK ENGINE 11-TIER DETAIL] [FALLBACK] Fallback_Engine.js executes AI calls through 11 tiers in this exact order: Tier 1-4 = Groq llama-3.3-70b-versatile (4 separate API keys, ~200ms avg). Tier 5-6 = Gemini 2.5 Flash (deep reasoning, 2 keys). Tier 7 = Cerebras llama-3.3-70b (ultra-fast backup). Tier 8-9 = Gemini 2.0 Flash (large free quota, 2 keys). Tier 10 = Mistral Pixtral 12B. Tier 11 = OpenRouter Gemma 2 27B (premium). Each tier is tried with 3 internal retries before dropping to the next tier.'),

('[VOICE ENGINE 7-TIER FALLBACK] [VOICE] [VOICE-W0] Voice_Engine.js transcribes audio via 7 tiers: Tier 0 = Vercel Worker (sends only Telegram file_path; Worker downloads audio and runs Groq Whisper server-side — zero binary download by HF container). Tier 1-4 = Groq Whisper Large v3 (4 API keys, each with 3x retry + 2s backoff). Tier 5-6 = Gemini 2.0 Flash Native Audio (Base64 inline, no separate download needed). Temp audio file always deleted in finally block regardless of success or failure.'),

('[VISION ENGINE 12-TIER FALLBACK] [VISION] [VISION-W0] Vision_Engine.js analyzes images via 12 tiers: Tier 0 = Vercel Worker Vision (zero binary download from HF). Tier 1-4 = Gemini 2.5 Flash (premium quality, 4 keys). Tier 5-8 = Groq Llama 4 Scout 17B Vision (fast, 4 keys). Tier 9-10 = Gemini 2.0 Flash (large free quota). Tier 11 = HF Qwen2-VL-7B (no daily quota limit — last resort). Dual mode: Narrative (temp=0.7, for chat) vs JSON Extraction (temp=0.1, for Vault/OCR structured output).'),

('[503 SMART RETRY] [FALLBACK] Every tier wrapper (callGroq, callGemini, callCerebras, callMistral, callOpenRouter) implements an internal 503 smart retry BEFORE switching to the next tier. On 503 error: waits attempt × 2000ms (2s, 4s, 6s) then retries — up to 3 attempts per tier. This prevents premature tier-jumping caused by momentary server overload. Only genuine failures (non-503 errors or 3 consecutive 503s) trigger a tier switch.'),

('[DUMB MODE] [FALLBACK] If all 11 AI tiers fail simultaneously (extremely rare), executeWithFallback() does NOT crash the server. It returns a safe fallback object: { intent: "DUMB_MODE", reply_message: "⚠️ Sistem Otak N.E.X.A mengalami Down Total di semua 11 peladen dunia. Mohon coba lagi dalam beberapa menit." }. The server continues running and processing new messages normally.');

