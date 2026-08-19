// ============================================================
// N.E.X.A 3.0 — LIVE TOOL REGISTRY
// Real-Time Tool Calling Registry for Google Gemini Multimodal Live API
// Translates voice intents into server domain executions in <20ms
// Full Support: Finance, Calendar, Tasks, Living Memory, Device Control, Web Search
// ============================================================
'use strict';

const geminiVectorCache = require('../utils/gemini_vector_cache');
const supabaseFinance = require('../infrastructure/Supabase_Finance');
const supabaseMemories = require('../infrastructure/Supabase_Memories');
const mobileBridgeWs = require('../interfaces/mobile_bridge/MobileBridge_WS');
const bridge = require('../interfaces/mobile_bridge/adapter');
const agendaManager = require('../domain/Agenda_Manager');
const taskManager = require('../domain/Task_Manager');
const webSearch = require('../infrastructure/Web_Search');
const googleWorkspace = require('../infrastructure/Google_Workspace');
const googleTasks = require('../infrastructure/Google_Tasks');

/**
 * Tool Schema Declarations for Google Gemini Live Setup Payload
 */
const LIVE_TOOL_DECLARATIONS = [
  // ── 1. FINANCE ENGINE ──────────────────────────────────────────
  {
    name: 'recordExpense',
    description: 'Mencatat transaksi pengeluaran keuangan Tuan Faqih ke database Supabase secara real-time',
    parameters: {
      type: 'OBJECT',
      properties: {
        amount: { type: 'NUMBER', description: 'Jumlah nominal uang dalam Rupiah (contoh: 25000)' },
        category: { type: 'STRING', description: 'Kategori pengeluaran (Makanan, Transportasi, Pendidikan, Belanja, Hiburan, Kebutuhan, Lain-lain)' },
        description: { type: 'STRING', description: 'Keterangan atau nama barang/jasa yang dibeli' },
        paymentMethod: { type: 'STRING', description: 'Metode pembayaran (BCA, MANDIRI, QRIS, CASH, GOPAY, SHOPEEPAY)' },
        date: { type: 'STRING', description: 'Tanggal transaksi jika disebutkan khusus (contoh: "today", "yesterday", "2026-08-19")' }
      },
      required: ['amount', 'description']
    }
  },
  {
    name: 'recordIncome',
    description: 'Mencatat transaksi pemasukan uang atau penerimaan dana Tuan Faqih ke database Supabase',
    parameters: {
      type: 'OBJECT',
      properties: {
        amount: { type: 'NUMBER', description: 'Jumlah nominal uang yang diterima dalam Rupiah' },
        description: { type: 'STRING', description: 'Sumber atau keterangan pemasukan (contoh: Gaji, Transfer dari Ayah, Beasiswa, Proyek)' },
        destinationAccount: { type: 'STRING', description: 'Rekening penerima (BCA, MANDIRI, CASH, GOPAY)' }
      },
      required: ['amount', 'description']
    }
  },
  {
    name: 'queryFinancialSummary',
    description: 'Mengecek total pengeluaran, pemasukan, atau saldo rekening keuangan Tuan Faqih',
    parameters: {
      type: 'OBJECT',
      properties: {
        timeframe: { type: 'STRING', description: 'Periode waktu yang ingin dicek: "today", "this_week", "this_month", "all_balances"' },
        category: { type: 'STRING', description: 'Kategori pengeluaran spesifik jika ingin difilter' }
      }
    }
  },

  // ── 2. AGENDA & GOOGLE CALENDAR ────────────────────────────────
  {
    name: 'createCalendarEvent',
    description: 'Membuat jadwal atau agenda baru di Google Calendar Tuan Faqih',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Judul atau nama kegiatan (contoh: "Kuliah Nahwu", "Rapat BEM", "Bimbingan Skripsi")' },
        date: { type: 'STRING', description: 'Tanggal kegiatan (contoh: "today", "tomorrow", "besok", "2026-08-20")' },
        startTime: { type: 'STRING', description: 'Jam mulai kegiatan format HH:mm (contoh: "09:00", "14:30")' },
        endTime: { type: 'STRING', description: 'Jam selesai kegiatan format HH:mm (opsional, otomatis dihitung jika kosong)' },
        location: { type: 'STRING', description: 'Lokasi kegiatan jika ada (contoh: "Gedung Soegondo UGM", "Ruang Rapat 2")' },
        description: { type: 'STRING', description: 'Deskripsi atau catatan tambahan agenda' }
      },
      required: ['title', 'startTime']
    }
  },
  {
    name: 'queryCalendarAgenda',
    description: 'Mengecek jadwal kalender atau agenda Tuan Faqih untuk hari ini, besok, atau rentang waktu tertentu',
    parameters: {
      type: 'OBJECT',
      properties: {
        timeframe: { type: 'STRING', description: 'Periode yang ingin dicek: "today", "tomorrow", "this_week", "upcoming"' },
        date: { type: 'STRING', description: 'Tanggal spesifik jika ingin mengecek hari tertentu (YYYY-MM-DD)' }
      }
    }
  },

  // ── 3. GOOGLE TASKS ────────────────────────────────────────────
  {
    name: 'createTask',
    description: 'Mencatat tugas baru ke Google Tasks Tuan Faqih dengan kategori dan tenggat waktu',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Nama atau isi tugas yang harus dikerjakan' },
        dueDate: { type: 'STRING', description: 'Tenggat waktu pengerjaan (contoh: "today", "tomorrow", "lusa", "2026-08-22")' },
        listName: { type: 'STRING', description: 'Nama daftar tugas (Tugas Kuliah, Pekerjaan, Belanja, Riset & Baca, Tugas Saya)' },
        notes: { type: 'STRING', description: 'Catatan detail pengerjaan tugas' }
      },
      required: ['title']
    }
  },
  {
    name: 'queryTasks',
    description: 'Mengecek daftar tugas yang belum selesai atau jatuh tempo di Google Tasks Tuan Faqih',
    parameters: {
      type: 'OBJECT',
      properties: {
        listName: { type: 'STRING', description: 'Filter nama daftar tugas (opsional)' },
        status: { type: 'STRING', description: 'Status tugas: "pending", "overdue", "all"' }
      }
    }
  },

  // ── 4. LIVING MEMORY & 2ND BRAIN ───────────────────────────────
  {
    name: 'queryPersonalFacts',
    description: 'Mencari informasi, catatan pribadi, profil, preferensi, atau sejarah Tuan Faqih dari Living Memory SACR v3.0',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Topik atau kata kunci yang ingin dicari dalam memori (contoh: "jadwal nahwu", "sponsor", "diplomasi", "preferensi makanan")' }
      },
      required: ['query']
    }
  },
  {
    name: 'savePersonalFact',
    description: 'Menyimpan fakta baru, preferensi, catatan penting, atau memori permanen Tuan Faqih ke database ingatan',
    parameters: {
      type: 'OBJECT',
      properties: {
        fact: { type: 'STRING', description: 'Informasi atau fakta baru yang harus diingat permanen oleh N.E.X.A' },
        category: { type: 'STRING', description: 'Kategori memori (USER_PROFILE, PREFERENCE, ACADEMIC, PROJECT, PERSONAL)' }
      },
      required: ['fact']
    }
  },

  // ── 5. HARDWARE DEVICE CONTROL ─────────────────────────────────
  {
    name: 'controlDeviceHardware',
    description: 'Mengontrol fitur perangkat keras HP Samsung Tuan Faqih via Nexa Mobile Bridge (Senter, Volume, DND, Baterai, GPS)',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: { 
          type: 'STRING', 
          description: 'Aksi hardware: "TOGGLE_FLASHLIGHT", "SET_VOLUME", "FORCE_DND", "LOCK_SCREEN", "GET_BATTERY_STATUS", "GET_LOCATION"' 
        },
        enabled: { type: 'BOOLEAN', description: 'Status aktif/nonaktif untuk senter atau DND' },
        volumeLevel: { type: 'NUMBER', description: 'Tingkat volume 0 sampai 100 jika mengatur volume' }
      },
      required: ['action']
    }
  },

  // ── 6. WEB SEARCH & LIVE INTELLIGENCE ──────────────────────────
  {
    name: 'searchWeb',
    description: 'Mencari informasi terkini dari internet (berita, cuaca, informasi umum, harga pasar, kurs, dll.)',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Pertanyaan atau kata kunci pencarian di internet' }
      },
      required: ['query']
    }
  }
];

/**
 * Execute a tool call triggered by Google Gemini Live API.
 * @param {string} toolName - Name of the function
 * @param {Object} args - Arguments passed by Gemini Live
 * @returns {Promise<Object>} Result payload returned back to Gemini Live
 */
async function executeLiveTool(toolName, args = {}) {
  console.log(`[LIVE-TOOL] 🛠️ Executing: ${toolName}(${JSON.stringify(args)})`);
  const startTime = Date.now();

  try {
    switch (toolName) {
      // ─────────────────────────────────────────────────────────────
      // 1. FINANCE: RECORD EXPENSE
      // ─────────────────────────────────────────────────────────────
      case 'recordExpense': {
        const nominal = Math.abs(Number(args.amount) || 0);
        const desc = String(args.description || 'Pengeluaran').trim();
        const category = String(args.category || 'Lain-lain').trim();
        const method = String(args.paymentMethod || 'QRIS').toUpperCase();

        if (nominal <= 0) {
          return { status: 'ERROR', message: 'Nominal transaksi tidak valid.' };
        }

        const now = new Date();
        let targetDate = now.toISOString().split('T')[0];
        if (args.date === 'yesterday' || args.date === 'kemarin') {
          const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          targetDate = y.toISOString().split('T')[0];
        }

        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timeHHMM = `${hours}:${minutes}`;

        const writeRes = await supabaseFinance.writeTransaction({
          amount: nominal,
          type: 'EXPENSE',
          category,
          description: desc,
          source: 'LIVE_VOICE_CALL',
          paymentMethod: method,
          date: targetDate,
          timeHHMM
        });

        const elapsed = Date.now() - startTime;
        console.log(`[LIVE-TOOL] ✅ Expense recorded in ${elapsed}ms: Rp${nominal.toLocaleString('id-ID')} (${desc})`);

        return {
          status: 'SUCCESS',
          message: `Pengeluaran Rp${nominal.toLocaleString('id-ID')} untuk ${desc} (Kategori: ${category}) berhasil dicatat menggunakan metode ${method}.`,
          amount: nominal,
          description: desc,
          category,
          paymentMethod: method,
          transaction_id: writeRes?.id || 'RECORDED'
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 2. FINANCE: RECORD INCOME
      // ─────────────────────────────────────────────────────────────
      case 'recordIncome': {
        const nominal = Math.abs(Number(args.amount) || 0);
        const desc = String(args.description || 'Pemasukan').trim();
        const account = String(args.destinationAccount || 'BCA').toUpperCase();

        if (nominal <= 0) {
          return { status: 'ERROR', message: 'Nominal pemasukan tidak valid.' };
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timeHHMM = `${hours}:${minutes}`;

        const writeRes = await supabaseFinance.writeTransaction({
          amount: nominal,
          type: 'INCOME',
          category: 'Pemasukan',
          description: desc,
          source: 'LIVE_VOICE_CALL',
          paymentMethod: account,
          date: dateStr,
          timeHHMM
        });

        return {
          status: 'SUCCESS',
          message: `Pemasukan Rp${nominal.toLocaleString('id-ID')} (${desc}) berhasil dicatat masuk ke rekening ${account}.`,
          amount: nominal,
          destinationAccount: account,
          transaction_id: writeRes?.id || 'RECORDED'
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 3. FINANCE: QUERY SUMMARY & BALANCES
      // ─────────────────────────────────────────────────────────────
      case 'queryFinancialSummary': {
        const timeframe = args.timeframe || 'this_month';
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const analytics = await supabaseFinance.getFinanceAnalytics(startOfMonth, now);
        const balances = await supabaseFinance.getAccountBalances();
        const totalBalance = balances.reduce((sum, a) => sum + (a.balance || 0), 0);

        const balanceList = balances.map(b => `${b.account_name}: Rp${(b.balance || 0).toLocaleString('id-ID')}`).join(', ');

        return {
          status: 'SUCCESS',
          timeframe,
          expense_this_month: analytics?.totalExpense || 0,
          income_this_month: analytics?.totalIncome || 0,
          total_liquid_balance: totalBalance,
          account_balances: balanceList,
          summary_text: `Ringkasan: Total pengeluaran bulan ini Rp${(analytics?.totalExpense || 0).toLocaleString('id-ID')}, pemasukan Rp${(analytics?.totalIncome || 0).toLocaleString('id-ID')}, dan total saldo likuid Tuan Rp${totalBalance.toLocaleString('id-ID')} (${balanceList}).`
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 4. CALENDAR: CREATE EVENT
      // ─────────────────────────────────────────────────────────────
      case 'createCalendarEvent': {
        const title = String(args.title || 'Agenda Baru').trim();
        const startTime = args.startTime;
        let dateStr = args.date || 'today';
        
        const res = await agendaManager.handleCalendarIntent({
          action: 'CREATE',
          summary: title,
          date_raw: dateStr,
          start_time: startTime,
          end_time: args.endTime || null,
          duration_minutes: args.durationMinutes || null,
          location: args.location || null,
          description: args.description || null
        }, null);

        return {
          status: res.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          message: res.message ? res.message.replace(/<[^>]+>/g, '') : `Agenda "${title}" diproses.`
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 5. CALENDAR: QUERY AGENDA
      // ─────────────────────────────────────────────────────────────
      case 'queryCalendarAgenda': {
        const timeframe = args.timeframe || 'today';
        let dateQuery = args.date || (timeframe === 'tomorrow' || timeframe === 'besok' ? 'besok' : 'hari ini');

        const res = await agendaManager.handleCalendarIntent({
          action: 'LIST',
          date_raw: dateQuery
        }, null);

        const cleanMessage = res.message ? res.message.replace(/<[^>]+>/g, '') : 'Tidak ada agenda terjadwal.';
        return {
          status: 'SUCCESS',
          timeframe,
          agenda_details: cleanMessage
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 6. TASKS: CREATE TASK
      // ─────────────────────────────────────────────────────────────
      case 'createTask': {
        const title = String(args.title || 'Tugas Baru').trim();
        const dueDate = args.dueDate || null;
        const listName = args.listName || null;

        const res = await taskManager.handleTaskIntent({
          action: 'CREATE',
          title,
          due_date: dueDate,
          list_name: listName,
          notes: args.notes || null
        }, null);

        const cleanMessage = res.message ? res.message.replace(/<[^>]+>/g, '') : `Tugas "${title}" berhasil dicatat.`;
        return {
          status: res.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          message: cleanMessage
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 7. TASKS: QUERY TASKS
      // ─────────────────────────────────────────────────────────────
      case 'queryTasks': {
        const listName = args.listName || null;
        const res = await taskManager.handleTaskIntent({
          action: 'LIST',
          list_name: listName
        }, null);

        const cleanMessage = res.message ? res.message.replace(/<[^>]+>/g, '') : 'Tidak ada tugas yang tertunda.';
        return {
          status: 'SUCCESS',
          task_details: cleanMessage
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 8. MEMORY: QUERY PERSONAL FACTS
      // ─────────────────────────────────────────────────────────────
      case 'queryPersonalFacts': {
        const query = String(args.query || '').trim();
        const res = await geminiVectorCache.getRelevantFacts(query);
        const allFacts = [...(res.profileFacts || []), ...(res.identityFacts || [])];

        if (allFacts.length === 0) {
          return {
            status: 'NOT_FOUND',
            message: `Tidak ditemukan catatan spesifik mengenai "${query}".`
          };
        }

        const factsList = allFacts.slice(0, 5).join('\n• ');
        return {
          status: 'SUCCESS',
          query,
          facts: `• ${factsList}`
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 9. MEMORY: SAVE PERSONAL FACT
      // ─────────────────────────────────────────────────────────────
      case 'savePersonalFact': {
        const fact = String(args.fact || '').trim();
        const category = String(args.category || 'USER_PROFILE').toUpperCase();

        if (!fact) {
          return { status: 'ERROR', message: 'Fakta tidak boleh kosong.' };
        }

        await supabaseMemories.saveUserProfile(fact);
        try {
          if (geminiVectorCache.invalidateCache) {
            await geminiVectorCache.invalidateCache();
          }
        } catch (_) {}

        return {
          status: 'SUCCESS',
          message: `Fakta baru berhasil disimpan ke memori permanen Tuan Faqih: "${fact}".`
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 10. HARDWARE: CONTROL DEVICE
      // ─────────────────────────────────────────────────────────────
      case 'controlDeviceHardware': {
        const action = args.action;
        let commandParams = {};

        if (action === 'TOGGLE_FLASHLIGHT' || action === 'FLASHLIGHT') {
          const enabled = args.enabled !== undefined ? args.enabled : true;
          commandParams = { enabled };
          const bridgeRes = await mobileBridgeWs.sendCommand('TOGGLE_FLASHLIGHT', commandParams, { timeoutMs: 3000 });
          return {
            status: bridgeRes.success ? 'SUCCESS' : 'FAILED',
            action,
            message: bridgeRes.success ? `Lampu senter HP telah ${enabled ? 'dinyalakan' : 'dimatikan'}.` : 'Gagal mengubah status senter HP.'
          };
        } else if (action === 'SET_VOLUME') {
          const vol = Number(args.volumeLevel !== undefined ? args.volumeLevel : 80);
          commandParams = { volume: vol, streamType: 'STREAM_MUSIC' };
          const bridgeRes = await mobileBridgeWs.sendCommand('SET_VOLUME', commandParams, { timeoutMs: 3000 });
          return {
            status: bridgeRes.success ? 'SUCCESS' : 'FAILED',
            action,
            message: bridgeRes.success ? `Volume suara HP diatur ke ${vol}%.` : 'Gagal mengatur volume HP.'
          };
        } else if (action === 'FORCE_DND') {
          const enabled = args.enabled !== undefined ? args.enabled : true;
          commandParams = { enabled };
          const bridgeRes = await mobileBridgeWs.sendCommand('FORCE_DND', commandParams, { timeoutMs: 3000 });
          return {
            status: bridgeRes.success ? 'SUCCESS' : 'FAILED',
            action,
            message: bridgeRes.success ? `Mode Jangan Ganggu (DND) ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.` : 'Gagal mengubah status DND.'
          };
        } else if (action === 'LOCK_SCREEN') {
          const bridgeRes = await mobileBridgeWs.sendCommand('LOCK_SCREEN', {}, { timeoutMs: 3000 });
          return {
            status: bridgeRes.success ? 'SUCCESS' : 'FAILED',
            action,
            message: bridgeRes.success ? 'Layar HP berhasil dikunci.' : 'Gagal mengunci layar HP.'
          };
        } else if (action === 'GET_LOCATION') {
          const bridgeRes = await bridge.getLocation();
          return {
            status: bridgeRes.success ? 'SUCCESS' : 'FAILED',
            action,
            latitude: bridgeRes.latitude,
            longitude: bridgeRes.longitude,
            address: bridgeRes.address || 'Koordinat lokasi berhasil diambil.'
          };
        }

        return { status: 'UNKNOWN_ACTION', message: `Aksi hardware "${action}" tidak dikenali.` };
      }

      // ─────────────────────────────────────────────────────────────
      // 11. WEB SEARCH: LIVE SEARCH
      // ─────────────────────────────────────────────────────────────
      case 'searchWeb': {
        const query = String(args.query || '').trim();
        if (!query) {
          return { status: 'ERROR', message: 'Query pencarian tidak boleh kosong.' };
        }

        const searchResult = await webSearch.searchWeb(query);
        const cleanResult = typeof searchResult === 'string' ? searchResult.replace(/<[^>]+>/g, '').slice(0, 800) : JSON.stringify(searchResult).slice(0, 800);

        return {
          status: 'SUCCESS',
          query,
          result: cleanResult
        };
      }

      default:
        return { status: 'UNKNOWN_TOOL', message: `Tool "${toolName}" tidak terdaftar.` };
    }
  } catch (err) {
    console.error(`[LIVE-TOOL] ❌ Error executing ${toolName}:`, err.message);
    return { status: 'ERROR', message: `Gagal mengeksekusi alat: ${err.message}` };
  }
}

module.exports = {
  LIVE_TOOL_DECLARATIONS,
  executeLiveTool
};
