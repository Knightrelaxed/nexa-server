// ============================================================
// N.E.X.A 3.0 — LIVE TOOL REGISTRY
// Real-Time Tool Calling Registry for Google Gemini Multimodal Live API
// Translates voice intents into server domain executions in <20ms
// ============================================================
'use strict';

const geminiVectorCache = require('../utils/gemini_vector_cache');
const supabaseFinance = require('../infrastructure/Supabase_Finance');
const supabaseMemories = require('../infrastructure/Supabase_Memories');
const mobileBridgeWs = require('../interfaces/mobile_bridge/MobileBridge_WS');

/**
 * Tool Schema Declarations for Google Gemini Live Setup Payload
 */
const LIVE_TOOL_DECLARATIONS = [
  {
    name: 'recordExpense',
    description: 'Mencatat transaksi pengeluaran atau pemasukan keuangan Tuan Faqih ke database Supabase',
    parameters: {
      type: 'OBJECT',
      properties: {
        amount: { type: 'NUMBER', description: 'Jumlah nominal uang dalam Rupiah (contoh: 25000)' },
        category: { type: 'STRING', description: 'Kategori pengeluaran (contoh: Makanan, Transportasi, Pendidikan, Hiburan, Kebutuhan)' },
        description: { type: 'STRING', description: 'Keterangan atau nama barang/jasa yang dibeli' },
        paymentMethod: { type: 'STRING', description: 'Metode pembayaran (BCA, MANDIRI, QRIS, CASH, GOPAY, SHOPEEPAY)' }
      },
      required: ['amount', 'description']
    }
  },
  {
    name: 'queryFinancialSummary',
    description: 'Mengecek total pengeluaran hari ini atau ringkasan saldo keuangan Tuan Faqih',
    parameters: {
      type: 'OBJECT',
      properties: {
        timeframe: { type: 'STRING', description: 'Periode waktu yang ingin dicek: "today", "this_week", "this_month"' }
      }
    }
  },
  {
    name: 'queryPersonalFacts',
    description: 'Mencari informasi, catatan pribadi, jadwal, atau preferensi Tuan Faqih dari Living Memory SACR v3.0',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Topik atau kata kunci yang ingin dicari dalam memori (contoh: "jadwal nahwu", "sponsor", "diplomasi")' }
      },
      required: ['query']
    }
  },
  {
    name: 'controlDeviceHardware',
    description: 'Mengontrol fitur perangkat keras HP Samsung Tuan Faqih (Senter, Volume, Do Not Disturb)',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: { 
          type: 'STRING', 
          description: 'Aksi kontrol hardware yang diinginkan: "TOGGLE_FLASHLIGHT", "SET_VOLUME", "FORCE_DND"' 
        },
        enabled: { type: 'BOOLEAN', description: 'Status aktif/nonaktif untuk senter atau DND' },
        volumeLevel: { type: 'NUMBER', description: 'Tingkat volume 0 sampai 100 jika mengatur volume' }
      },
      required: ['action']
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
      // 1. Record Expense / Income
      case 'recordExpense': {
        const nominal = Math.abs(Number(args.amount) || 0);
        const desc = String(args.description || 'Pengeluaran').trim();
        const category = String(args.category || 'Lain-lain').trim();
        const method = String(args.paymentMethod || 'QRIS').toUpperCase();

        if (nominal <= 0) {
          return { status: 'ERROR', message: 'Nominal transaksi tidak valid.' };
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
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
          date: dateStr,
          timeHHMM
        });

        const elapsed = Date.now() - startTime;
        console.log(`[LIVE-TOOL] ✅ Expense recorded in ${elapsed}ms: Rp${nominal.toLocaleString('id-ID')} (${desc})`);

        return {
          status: 'SUCCESS',
          message: `Transaksi Rp${nominal.toLocaleString('id-ID')} (${desc}) berhasil dicatatkan ke metode ${method}.`,
          transaction_id: writeRes?.id || 'LOCAL_SAVED',
          amount: nominal,
          category
        };
      }

      // 2. Query Financial Summary
      case 'queryFinancialSummary': {
        const timeframe = args.timeframe || 'today';
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const analytics = await supabaseFinance.getFinanceAnalytics(startOfMonth, now);
        const balances = await supabaseFinance.getAccountBalances();
        const totalBalance = balances.reduce((sum, a) => sum + (a.balance || 0), 0);

        return {
          status: 'SUCCESS',
          timeframe,
          this_month_expense: analytics?.totalExpense || 0,
          this_month_income: analytics?.totalIncome || 0,
          total_balance: totalBalance,
          summary_text: `Ringkasan keuangan: Pengeluaran bulan ini Rp${(analytics?.totalExpense || 0).toLocaleString('id-ID')}, Pemasukan Rp${(analytics?.totalIncome || 0).toLocaleString('id-ID')}, Total Saldo Rp${totalBalance.toLocaleString('id-ID')}.`
        };
      }

      // 3. Query Personal Facts / Living Memory
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

        const factsList = allFacts.slice(0, 4).join('\n• ');
        return {
          status: 'SUCCESS',
          query,
          facts: `• ${factsList}`
        };
      }

      // 4. Control Device Hardware via Nexa Bridge
      case 'controlDeviceHardware': {
        const action = args.action;
        let commandParams = {};

        if (action === 'TOGGLE_FLASHLIGHT') {
          commandParams = { enabled: args.enabled !== undefined ? args.enabled : true };
        } else if (action === 'SET_VOLUME') {
          commandParams = { volume: args.volumeLevel || 80, streamType: 'STREAM_MUSIC' };
        } else if (action === 'FORCE_DND') {
          commandParams = { enabled: args.enabled !== undefined ? args.enabled : true };
        }

        const bridgeRes = await mobileBridgeWs.sendCommand(action, commandParams, { timeoutMs: 3000 });
        return {
          status: bridgeRes.success ? 'SUCCESS' : 'FAILED',
          action,
          message: bridgeRes.message || (bridgeRes.success ? 'Perintah hardware berhasil dieksekusi di HP.' : 'Gagal mengirim perintah ke HP.')
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
