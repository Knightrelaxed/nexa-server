Evaluasi yang bagus dari sisi klarifikasi — mengetahui Behavior Engine dan Memory Engine sudah aktif membuka ruang desain yang jauh lebih kaya. Mari kita bedah keempat poin secara mendalam.

---

## 1. Escalation State Machine

### Keputusan Arsitektur: Supabase, bukan In-Memory

HF Spaces bisa restart kapan saja. In-memory Map akan hancur saat restart, merusak sesi disiplin aktif. Redis menambah dependency baru. **Supabase sudah ada, cukup kita tambah satu tabel dedicated.**

Mengapa *tidak* pakai `nexa_behavior_log` yang ada? Karena log itu append-only (events), sedangkan discipline state butuh upsert. Pola query-nya berbeda: analytics vs. real-time state lookup. Pisahkan keduanya.

### Schema Tabel Baru

```sql
-- Migration: create nexa_discipline_state
CREATE TABLE nexa_discipline_state (
  session_key         TEXT PRIMARY KEY,        -- "{app_name}:{YYYY-MM-DD}"
  app_name            TEXT NOT NULL,
  current_level       INTEGER DEFAULT 0,
  violation_count     INTEGER DEFAULT 0,
  
  -- Feedback loop state (untuk Point 3)
  pending_callback    BOOLEAN DEFAULT FALSE,
  callback_expires_at TIMESTAMPTZ,
  callback_message_id TEXT,                    -- Telegram message_id untuk diedit
  ten_min_used_count  INTEGER DEFAULT 0,
  
  -- Dynamic profile (dari Behavior Engine, Point 2)
  mood_baseline       INTEGER DEFAULT 1,
  max_level_cap       INTEGER DEFAULT 4,
  message_tone        TEXT DEFAULT 'firm',     -- 'gentle' | 'firm' | 'urgent'
  
  first_triggered_at  TIMESTAMPTZ DEFAULT NOW(),
  last_triggered_at   TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ NOT NULL,    -- TTL: akhir hari (23:59)
  
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk cron query (Point 3: expired callbacks)
CREATE INDEX idx_discipline_pending 
  ON nexa_discipline_state(pending_callback, callback_expires_at) 
  WHERE pending_callback = TRUE;
```

### `adapter.js` — Refactoring dengan State Machine

```javascript
// src/interfaces/tasker/adapter.js
'use strict';

const supabase = require('../../infrastructure/supabase_client');
const godMode  = require('../../domain/Discipline_GodMode');
const behaviorEngine = require('../../domain/Behavior_Engine');
const { sendTelegramOutbound } = require('../telegram/actions');

// ─────────────────────────────────────────────
// STATE MACHINE HELPERS
// ─────────────────────────────────────────────

/**
 * Ambil atau buat sesi disiplin hari ini untuk satu app.
 * Session key format: "TikTok:2025-01-15" → reset otomatis tiap hari.
 */
async function getOrInitSession(appName) {
  const today = new Date().toISOString().split('T')[0];
  const sessionKey = `${appName}:${today}`;

  const { data } = await supabase
    .from('nexa_discipline_state')
    .select('*')
    .eq('session_key', sessionKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (data) return data;

  // Sesi baru — konsultasi Behavior Engine untuk mood profile
  const moodProfile = await behaviorEngine.getCurrentMoodProfile();
  const { baselineLevel, maxLevelCap, messageTone } =
    computeDynamicProfile(moodProfile);

  const newSession = {
    session_key:     sessionKey,
    app_name:        appName,
    current_level:   0,
    violation_count: 0,
    mood_baseline:   baselineLevel,
    max_level_cap:   maxLevelCap,
    message_tone:    messageTone,
    expires_at:      `${today}T23:59:59+07:00`
  };

  await supabase.from('nexa_discipline_state').insert(newSession);
  return newSession;
}

/**
 * Naikkan level satu langkah dan simpan ke Supabase.
 * Menghormati max_level_cap dari mood profile.
 */
async function advanceLevel(session) {
  const rawNext = (session.current_level || 0) + 1;
  const nextLevel = Math.min(rawNext, session.max_level_cap, 4);

  await supabase
    .from('nexa_discipline_state')
    .update({
      current_level:    nextLevel,
      violation_count:  (session.violation_count || 0) + 1,
      last_triggered_at: new Date().toISOString()
    })
    .eq('session_key', session.session_key);

  return nextLevel;
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────

async function handleTaskerWebhook(req, res) {
  const { type, data } = req.body;
  if (!type) return res.status(400).json({ error: 'Missing event type' });
  if (!data || typeof data !== 'object')
    return res.status(400).json({ error: 'Missing or invalid data payload' });

  if (type === 'SCREEN_TIME_VIOLATION') {
    const appName = data.app_name || 'Unknown App';

    try {
      const session  = await getOrInitSession(appName);
      const nextLevel = await advanceLevel(session);

      console.log(`[TASKER] ${appName} → Escalation Level ${nextLevel} (cap: ${session.max_level_cap})`);

      // Level 2 butuh feedback loop — delegasi ke handler khusus
      if (nextLevel === 2) {
        await fireLevel2WithFeedback(session, { violation_app: appName });
      } else {
        await godMode.triggerGodMode(nextLevel, {
          violation_app: appName,
          message_tone:  session.message_tone,
          session_key:   session.session_key
        });
      }

      // Log ke behavior engine untuk analytics mingguan
      await behaviorEngine.logEvent('DISCIPLINE_ESCALATION', {
        app_name:  appName,
        level:     nextLevel,
        tone:      session.message_tone
      }).catch(() => {}); // fire-and-forget

      res.status(200).json({ status: 'ok', level: nextLevel });
    } catch (e) {
      console.error('[TASKER] State machine error:', e.message);
      res.status(500).json({ error: 'Escalation failed' });
    }

  } else if (type === 'ALARM_DISMISSED') {
    // ... logika briefing pagi tidak berubah
  } else {
    res.status(400).json({ error: `Unknown event type: ${type}` });
  }
}

module.exports = { handleTaskerWebhook };
```

---

## 2. Dynamic Baseline Level dari Behavior Engine

### Formula: Mood Mengatur Ceiling, Recidivism Mengatur Floor

Prinsip kunci: **jangan matikan enforcement saat stres — ubah nadanya.** Enforcement yang ada justru bisa jadi anchor psikologis ketika pengguna kehilangan kontrol diri. Yang berubah adalah *seberapa keras* dan *seberapa jauh* ia bisa naik.

```javascript
// src/domain/Discipline_GodMode.js — tambahkan fungsi ini

/**
 * Menghitung profil dinamis berdasarkan data Behavior Engine.
 * @param {object} moodData - Output dari behaviorEngine.getCurrentMoodProfile()
 * @param {object} historyData - { violationsToday: number }
 * @returns {{ baselineLevel, maxLevelCap, messageTone, includeWellnessNote }}
 */
function computeDynamicProfile(moodData = {}, historyData = {}) {
  const {
    mood_24h_state  = 'NEUTRAL',   // 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'
    mood_7d_trend   = 'STABLE',    // 'IMPROVING' | 'STABLE' | 'DECLINING'
    mood_7d_variance = 'LOW'       // 'HIGH' | 'MEDIUM' | 'LOW'
  } = moodData;

  const violationsToday = historyData.violationsToday || 0;
  const currentHour = new Date().getHours();

  let baselineLevel     = 1;
  let maxLevelCap       = 4;
  let messageTone       = 'firm';
  let includeWellnessNote = false;

  // ── MOOD: Atur Ceiling ──────────────────────────────────────────
  if (mood_24h_state === 'NEGATIVE') {
    maxLevelCap = 3;         // Proteksi dari isolasi total saat burnout
    messageTone = 'gentle';
    includeWellnessNote = true;
  } else if (mood_24h_state === 'POSITIVE' && mood_7d_trend === 'IMPROVING') {
    maxLevelCap = 4;
    messageTone = 'firm';    // Mood bagus = toleransi lebih rendah terhadap penundaan
  } else if (mood_24h_state === 'NEUTRAL') {
    maxLevelCap = 4;
    messageTone = 'firm';
  }

  // ── TREN MINGGUAN: Fine-tuning ──────────────────────────────────
  if (mood_7d_trend === 'DECLINING' && mood_7d_variance === 'HIGH') {
    // Mood tidak stabil dan memburuk — hati-hati
    maxLevelCap = Math.min(maxLevelCap, 3);
    includeWellnessNote = true;
    messageTone = 'gentle';
  }

  if (mood_7d_trend === 'IMPROVING') {
    // Tren positif = bisa lebih tegas karena resiliensi tinggi
    messageTone = mood_24h_state === 'NEGATIVE' ? 'gentle' : 'urgent';
  }

  // ── RECIDIVISM: Atur Floor ──────────────────────────────────────
  // Semakin sering melanggar hari ini, baseline naik
  if (violationsToday >= 3) {
    baselineLevel = Math.min(2, maxLevelCap - 1);
  }
  if (violationsToday >= 5) {
    baselineLevel = Math.min(3, maxLevelCap - 1);
    messageTone = 'urgent'; // Override gentle jika sudah 5x hari ini
  }

  // ── TIME OF DAY: Safety Cap ─────────────────────────────────────
  // Setelah jam 22.00 atau sebelum jam 07.00 — hindari Level 4
  if (currentHour >= 22 || currentHour < 7) {
    maxLevelCap = Math.min(maxLevelCap, 2);
  }

  return { baselineLevel, maxLevelCap, messageTone, includeWellnessNote };
}
```

### Integrasi ke `getEscalationPlan`

Tambahkan parameter `tone` dan `wellnessNote` ke dalam fungsi yang sudah ada:

```javascript
function getEscalationPlan(level = 1, metadata = {}) {
  const tone = metadata.message_tone || 'firm';
  const wellnessNote = metadata.include_wellness_note
    ? '\n\n💙 <i>N.E.X.A mendeteksi Anda sedang dalam tekanan berat hari ini. Istirahat 5 menit setelah ini adalah produktif, bukan kalah.</i>'
    : '';

  const messageVariants = {
    gentle: {
      level1: `Tuan Faqih, N.E.X.A mendeteksi Anda sudah ${duration} menit di ${violationApp}. Mungkin saatnya ambil napas dan kembali ke prioritas — tanpa terburu-buru.`,
      level2: `Tuan Faqih, sesi ${violationApp} sudah melebihi batas. Layar diarahkan ke Home. Tidak apa-apa jika perlu konfirmasi dulu di Telegram.`
    },
    firm: {
      level1: `Tuan Faqih, ${duration} menit di ${violationApp}. Kembalilah ke tugas sekarang.`,
      level2: `Batas waktu terlampaui. Layar dikembalikan ke Home. Konfirmasikan alasan atau Level 3 aktif.`
    },
    urgent: {
      level1: `⚠️ Tuan Faqih — ${violationApp} sudah ${duration} menit. Target hari ini belum tercapai. Kembali SEKARANG.`,
      level2: `BATAS FINAL. ${violationApp} ditutup. Tidak ada lagi toleransi untuk hari ini.`
    }
  };
  // Gunakan variant sesuai tone dan sisipkan wellnessNote...
}
```

---

## 3. Telegram Inline Keyboard & Auto-Timeout

### Arsitektur: Supabase Pending State + Cron (Paling Resilient)

```
Level 2 trigger
      │
      ▼
Kirim Telegram Inline Keyboard
Simpan pending_callback = TRUE + callback_expires_at (now + 3 menit)
      │
      ├── Jika user klik callback → handleDisciplineCallback()
      │         ├── [Riset]    → Reset level, tutup pending
      │         ├── [Menunda]  → Langsung eskalasi Level 3
      │         └── [+10 min]  → Perpanjang callback_expires_at
      │
      └── Jika timeout → cron.js mendeteksi dan eskalasi Level 3
```

### `fireLevel2WithFeedback` — Kirim & Simpan Pending

```javascript
// Tambahkan ke src/interfaces/tasker/adapter.js

const { sendTelegramWithKeyboard } = require('../telegram/actions');

async function fireLevel2WithFeedback(session, metadata) {
  const plan = godMode.getEscalationPlan(2, {
    ...metadata,
    message_tone: session.message_tone
  });

  // Keyboard dengan callback_data yang mengandung session_key
  // Format singkat agar < 64 bytes: "d:{action}:{session_key}"
  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Ini Riset Penting',  callback_data: `d:ok:${session.session_key}` },
      { text: '❌ Saya Menunda',       callback_data: `d:no:${session.session_key}` },
      { text: '⏰ +10 Menit',          callback_data: `d:ext:${session.session_key}` }
    ]]
  };

  // Kirim notifikasi ntfy (aksi fisik Tasker langsung)
  await taskerClient.pushNtfy(plan.ntfyMessage, {
    title: plan.title,
    priority: plan.priority,
    tags: plan.tags
  });

  // Kirim Telegram dengan keyboard
  const msgResult = await sendTelegramWithKeyboard(plan.telegramMessage, keyboard);

  // Simpan pending state
  const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
  await supabase
    .from('nexa_discipline_state')
    .update({
      pending_callback:    true,
      callback_expires_at: expiresAt,
      callback_message_id: String(msgResult?.message_id || '')
    })
    .eq('session_key', session.session_key);
}
```

### Callback Handler di `webhook.js`

```javascript
// src/interfaces/telegram/callback_handler.js

async function handleDisciplineCallback(callbackQuery) {
  const data    = callbackQuery?.data || '';
  const msgId   = callbackQuery?.message?.message_id;
  const cbId    = callbackQuery?.id;

  const parts = data.split(':');
  if (parts[0] !== 'd' || parts.length < 3) return;

  const action     = parts[1]; // 'ok' | 'no' | 'ext'
  // session_key bisa mengandung ':', rebuild dari sisa parts
  const sessionKey = parts.slice(2).join(':');

  const { data: session } = await supabase
    .from('nexa_discipline_state')
    .select('*')
    .eq('session_key', sessionKey)
    .maybeSingle();

  if (!session || !session.pending_callback) {
    await answerCallbackQuery(cbId, '⚠️ Sesi sudah tidak aktif.', true);
    return;
  }

  if (action === 'ok') {
    // User konfirmasi riset — reset level, tutup pending
    await supabase.from('nexa_discipline_state').update({
      pending_callback: false,
      current_level:    0           // Grace granted — mulai fresh
    }).eq('session_key', sessionKey);

    await answerCallbackQuery(cbId, '✅ Diterima. Semangat risetnya, Tuan Faqih!');
    await editTelegramMessage(msgId,
      '✅ <b>N.E.X.A mencatat ini sebagai sesi riset yang valid.</b>\nLanjutkan — dan pastikan hasilnya dicatat.'
    );

  } else if (action === 'no') {
    // User mengakui penundaan — eskalasi segera
    await supabase.from('nexa_discipline_state').update({
      pending_callback: false,
      current_level:    3
    }).eq('session_key', sessionKey);

    await godMode.triggerGodMode(3, { violation_app: session.app_name });
    await answerCallbackQuery(cbId, '💪 Level 3 diaktifkan. Kembali fokus!');
    await editTelegramMessage(msgId,
      '🚫 <b>Surgical Force diaktifkan.</b>\nTuan Faqih memilih akuntabilitas. Respect.'
    );

  } else if (action === 'ext') {
    const usedCount = session.ten_min_used_count || 0;

    if (usedCount >= 2) {
      // Opsi +10 menit dikunci setelah 2x penggunaan per hari
      await answerCallbackQuery(cbId, '⛔ Opsi ini sudah habis untuk hari ini.', true);
      // Langsung eskalasi karena sudah mencoba memanfaatkan sistem
      await supabase.from('nexa_discipline_state').update({
        pending_callback: false,
        current_level:    3
      }).eq('session_key', sessionKey);
      await godMode.triggerGodMode(3, { violation_app: session.app_name });
      await editTelegramMessage(msgId,
        '🚫 <b>+10 Menit sudah digunakan 2x hari ini.</b>\nLevel 3 diaktifkan otomatis.'
      );
    } else {
      // Berikan perpanjangan 10 menit + reset timer callback (13 menit total)
      const newExpiry = new Date(Date.now() + 13 * 60 * 1000).toISOString();
      await supabase.from('nexa_discipline_state').update({
        callback_expires_at:  newExpiry,
        ten_min_used_count:   usedCount + 1
      }).eq('session_key', sessionKey);

      await answerCallbackQuery(cbId,
        `⏰ +10 menit diberikan (${usedCount + 1}/2 penggunaan hari ini).`
      );
      await editTelegramMessage(msgId,
        `⏰ <b>+10 menit dikabulkan (${usedCount + 1}/2).</b>\nN.E.X.A menunggu. Buktikan ini perlu.`
      );
    }
  }
}
```

### Cron Checker — Auto-Escalate Expired Callbacks

Tambahkan ke `cron.js` yang sudah ada, jalankan setiap menit:

```javascript
// Di src/infrastructure/cron.js — tambahkan job ini

cron.schedule('* * * * *', async () => {
  // Cek pending callbacks yang sudah expired
  const { data: expiredSessions } = await supabase
    .from('nexa_discipline_state')
    .select('*')
    .eq('pending_callback', true)
    .lt('callback_expires_at', new Date().toISOString());

  if (!expiredSessions?.length) return;

  for (const session of expiredSessions) {
    console.log(`[CRON] Auto-escalating expired callback: ${session.session_key}`);

    // Update state terlebih dulu (hindari double-trigger jika cron overlap)
    const { count } = await supabase
      .from('nexa_discipline_state')
      .update({ pending_callback: false, current_level: 3 })
      .eq('session_key', session.session_key)
      .eq('pending_callback', true); // Optimistic lock — hanya update jika masih true

    if (count === 0) continue; // Sudah di-handle oleh cron run sebelumnya

    // Edit pesan Telegram untuk memberi tahu timeout
    if (session.callback_message_id) {
      await editTelegramMessage(
        session.callback_message_id,
        '⏱️ <b>Tidak ada respons (3 menit).</b>\nLevel 3 diaktifkan otomatis oleh N.E.X.A.'
      ).catch(() => {});
    }

    // Trigger Level 3
    await godMode.triggerGodMode(3, { violation_app: session.app_name }).catch(() => {});
  }
});
```

---

## 4. Emergency Bypass & Panic Button Architecture

### Prinsip Desain: Three-Factor Anti-Abuse

Tantangannya bukan membuat bypass yang *bisa* digunakan, tapi yang *tidak enak* digunakan kecuali benar-benar darurat — sementara tetap cepat saat darurat nyata.

```
┌─────────────────────────────────────────┐
│         TIGA LAPIS ANTI-ABUSE           │
│                                         │
│  Layer 1 — FISIK: Vol sequence (Tasker) │
│  Layer 2 — TEMPORAL: 10-detik cooldown  │
│  Layer 3 — PSIKOLOGIS: Audit log visible│
│             di Weekly Review            │
└─────────────────────────────────────────┘
```

### Revisi Level 4 — "God Mode Bedah" vs. "God Mode Mutlak"

Masalah terbesar Level 4 saat ini: memutus semua koneksi termasuk potensi darurat. Solusi yang lebih surgical tanpa root:

```javascript
// Revisi Level 4 actions di getEscalationPlan:
case 4:
  return {
    actions: [
      // Matikan Wi-Fi (sumber utama distraksi di rumah)
      // Mobile data tetap HIDUP untuk panggilan & pesan darurat
      { action: 'DISABLE_WIFI', params: { duration_minutes: 45 } },
      
      // DND dengan whitelist Favorit (keluarga, nomor darurat)
      { action: 'ENABLE_DND_PRIORITY_ONLY', params: {
          allow_calls_from: 'FAVORITES',
          allow_repeat_callers: true,  // Jika seseorang menelepon 2x dalam 15 menit
          duration_minutes: 45
        }
      },
      
      // Focus Mode Samsung — blokir app hiburan spesifik
      // (lebih surgical dari mematikan semua internet)
      { action: 'ENABLE_FOCUS_MODE', params: {
          mode_name: 'GOD MODE',
          blocked_apps: ['com.zhiliaoapp.musically', 'com.instagram.android',
                         'com.google.android.youtube', 'com.twitter.android'],
          duration_minutes: 45
        }
      },
      
      { action: 'LOCK_SCREEN', params: {
          message: '🔴 GOD MODE: Fokus atau sesali. Darurat? Vol↓ × 3'
        }
      }
    ]
  };
```

Dengan desain ini: Wi-Fi mati (distraksi hilang), mobile data hidup (darurat tetap bisa), app hiburan terkunci via Focus Mode, telepon dari Favorit tetap masuk.

### Panic Button — Tasker Configuration (Pseudocode Resmi)

```
╔══════════════════════════════════════════════════════╗
║  PROFILE: "NEXA Emergency Bypass Monitor"            ║
║  Trigger: Variable Set — %NEXA_GOD_LEVEL eq 4        ║
╠══════════════════════════════════════════════════════╣
║  TASK: "Monitor Emergency Exit"                      ║
║                                                      ║
║  A1: Variable Set %VOL_COUNT = 0                     ║
║                                                      ║
║  A2: [LOOP — maks 10 menit]                          ║
║      Wait for Event: Volume Down Key Press           ║
║        → If detected within 3s:                      ║
║            %VOL_COUNT + 1                            ║
║        → Else:                                       ║
║            %VOL_COUNT = 0  (reset jika terlalu lama) ║
║      If %VOL_COUNT >= 3: Exit Loop                   ║
║                                                      ║
║  A3: Flash — "⚠️ DARURAT? Tahan Vol+ 5 detik"       ║
║      Haptic feedback (long vibrate 2x)               ║
║                                                      ║
║  A4: Wait for Event: Volume Up Long Press (≥ 5 detik)║
║      Timeout: 10 detik                               ║
║      If NOT received: kembali ke A2 (false alarm)    ║
║                                                      ║
║  A5: [KONFIRMASI DITERIMA]                           ║
║      Cancel all God Mode tasks                       ║
║      Enable Wi-Fi                                    ║
║      Disable Focus Mode                              ║
║      Disable DND                                     ║
║      HTTP POST → NEXA server:                        ║
║        { type: 'EMERGENCY_BYPASS_ACTIVATED',         ║
║          timestamp, trigger: 'panic_button' }        ║
║      Notify: "🚨 Emergency Override aktif.           ║
║               N.E.X.A mencatat ini. Stay safe."      ║
╚══════════════════════════════════════════════════════╝
```

### Server-Side Emergency Bypass Handler

```javascript
// Endpoint baru: POST /webhook/tasker
// Tambahkan ke adapter.js

} else if (type === 'EMERGENCY_BYPASS_ACTIVATED') {
  // Catat ke behavior log untuk weekly review
  await behaviorEngine.logEvent('EMERGENCY_BYPASS', {
    trigger:   data.trigger || 'panic_button',
    timestamp: data.timestamp,
    god_mode_level: data.god_mode_level || 4
  }).catch(() => {});

  // Kirim notifikasi Telegram sebagai audit trail
  await sendTelegramOutbound(
    `🚨 <b>Emergency Override Diaktifkan</b>\n\n` +
    `Tuan Faqih menggunakan Panic Button pada pukul ` +
    `${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}.\n` +
    `<i>Kejadian ini tercatat dalam Weekly Discipline Review.</i>`
  );

  // Reset discipline state untuk app yang aktif
  const today = new Date().toISOString().split('T')[0];
  await supabase
    .from('nexa_discipline_state')
    .update({ current_level: 0, pending_callback: false })
    .like('session_key', `%:${today}`)
    .eq('current_level', 4);

  res.status(200).json({ status: 'bypass_acknowledged' });
```

### Tampilan di Weekly Review

Override ini harus muncul di Weekly Report agar ada biaya psikologis yang nyata:

```
📊 Weekly Discipline Report — 13–19 Jan 2025

✅ Sesi fokus berhasil: 34/40 (85%)
⚠️ Escalation terpicu: 12 kali
🚨 Emergency Override: 2 kali
   → Senin 13 Jan, 22:47 (panic button)
   → Kamis 16 Jan, 14:23 (panic button)

Catatan: 2 override terjadi di saat deadline aktif.
Apakah ini genuine emergency atau resistensi?
```

---

## Ringkasan Integrasi Keempat Komponen

```
Tasker sends SCREEN_TIME_VIOLATION
           │
           ▼
  getOrInitSession(app_name)     ← Supabase nexa_discipline_state
  + computeDynamicProfile()      ← Behavior_Engine mood data
           │
           ▼
    advanceLevel()               ← Naik 1 level, hormat max_level_cap
           │
    ┌──────┴──────┐
  Level 2?      Lainnya?
    │               │
    ▼               ▼
fireLevel2       triggerGodMode(n)
WithFeedback()   (langsung)
    │
    ├── Telegram Inline Keyboard
    ├── Supabase: pending_callback = true
    └── cron.js: cek expiry setiap menit
              │
              └── Auto-eskalasi Level 3 jika timeout
```

Keempat komponen ini sekarang saling terhubung dengan satu state store (Supabase), satu sumber kebenaran mood (Behavior Engine), dan satu audit trail (behavior log + weekly review). Tidak ada lagi logika yang berjalan "di udara" tanpa persistensi.