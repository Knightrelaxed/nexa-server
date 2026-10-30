'use strict';
/**
 * Finance_Analytics - Financial reports: KPIs, period comparison, trends, saving rate.
 * Extracted from Finance_Engine.js (finance split). Behaviour is unchanged; Finance_Engine.js remains the public facade.
 */
const supabaseFinance = require('../../infrastructure/Supabase_Finance');

/**
 * Fetch and format the Analytics Table from Supabase.
 * Hasil laporan mencakup metrik KPI yang sama dengan halaman Analitik Nexa Finance Web:
 * Savings Rate, Rata-rata Harian, Total Transaksi.
 */
async function getFinanceAnalytics(dateText = null) {
  try {
    const { startDate, endDate, timeLabel } = _parseAnalyticsPeriod(dateText);

    const analytics = await supabaseFinance.getFinanceAnalytics(startDate, endDate);
    if (!analytics || (analytics.totalIncome === 0 && analytics.totalExpense === 0)) {
      return `📭 Data analitik belum tersedia untuk ${timeLabel}.`;
    }

    const formatRp = (val) => `Rp${Math.round(Math.abs(val)).toLocaleString('id-ID')}`;

    // === KPI Cards identik dengan analytics-view.tsx ===
    // Card 1: Savings Rate  — savingsRate = (income - expense) / income * 100
    // Card 2: Rata-rata Harian — avgDailyExpense = totalExpense / daysPassed
    // Card 3: Total Transaksi

    let report = `📊 <b>Laporan Analitik Keuangan ${timeLabel}:</b>\n\n`;
    report += `🟢 <b>Total Pemasukan:</b> ${formatRp(analytics.totalIncome)}\n`;
    report += `🔴 <b>Total Pengeluaran:</b> ${formatRp(analytics.totalExpense)}\n`;
    report += `──────────────\n`;
    report += `🏦 <b>SALDO BERSIH:</b> <b>${formatRp(analytics.balance)}</b>\n\n`;

    // Metrik lanjutan (setara KPI Cards di halaman Analitik Web)
    report += `💡 <b>Tingkat Tabungan (Savings Rate):</b> ${analytics.savingsRate.toFixed(1)}%\n`;
    report += `📈 <b>Rata-rata Harian:</b> ${formatRp(analytics.avgDailyExpense)} / hari\n`;
    report += `🔢 <b>Total Transaksi:</b> ${analytics.totalTransactions} transaksi dalam ${analytics.daysPassed} hari\n\n`;

    report += `<i>Dihitung real-time menggunakan logika identik dengan Dasbor Nexa Finance Web.</i>`;

    return report;
  } catch (err) {
    console.error('[FINANCE] Failed to fetch analytics:', err.message);
    return `⚠️ Gagal membaca tabel analitik: ${err.message}`;
  }
}

// ═══════════════════════════════════════════════════════════════
// FINANCE INTELLIGENCE LAYER — Advanced Analytics for Telegram
// ═══════════════════════════════════════════════════════════════

/**
 * Parse dateText to {startDate, endDate, timeLabel, prevStart, prevEnd}
 * Supports: minggu ini, bulan ini, tahun ini, hari ini, kemarin, bulan lalu, minggu lalu
 */
function _parseAnalyticsPeriod(dateText = null) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lower = (dateText || '').toLowerCase();

  let startDate, endDate, prevStart, prevEnd, timeLabel;

  if (lower.includes('kemarin')) {
    startDate = new Date(today); startDate.setDate(today.getDate() - 1);
    endDate = new Date(startDate);
    prevStart = new Date(startDate); prevStart.setDate(startDate.getDate() - 1);
    prevEnd = new Date(prevStart);
    timeLabel = 'Kemarin';
  } else if (lower.includes('hari ini') || lower.includes('today') || lower.includes('hari')) {
    startDate = new Date(today);
    endDate = new Date(today);
    prevStart = new Date(today); prevStart.setDate(today.getDate() - 1);
    prevEnd = new Date(prevStart);
    timeLabel = 'Hari Ini';
  } else if (lower.includes('minggu lalu')) {
    const day = today.getDay();
    const diffToThisMonday = day === 0 ? -6 : 1 - day;
    const thisMonday = new Date(today); thisMonday.setDate(today.getDate() + diffToThisMonday);
    startDate = new Date(thisMonday); startDate.setDate(thisMonday.getDate() - 7);
    endDate = new Date(thisMonday); endDate.setDate(thisMonday.getDate() - 1);
    prevStart = new Date(startDate); prevStart.setDate(startDate.getDate() - 7);
    prevEnd = new Date(endDate); prevEnd.setDate(endDate.getDate() - 7);
    timeLabel = 'Minggu Lalu';
  } else if (lower.includes('minggu')) {
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(today); startDate.setDate(diff);
    endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6);
    prevStart = new Date(startDate); prevStart.setDate(startDate.getDate() - 7);
    prevEnd = new Date(endDate); prevEnd.setDate(endDate.getDate() - 7);
    timeLabel = 'Minggu Ini';
  } else if (lower.includes('bulan lalu')) {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
    timeLabel = 'Bulan Lalu';
  } else if (lower.includes('tahun')) {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31);
    prevStart = new Date(now.getFullYear() - 1, 0, 1);
    prevEnd = new Date(now.getFullYear() - 1, 11, 31);
    timeLabel = 'Tahun Ini';
  } else {
    // Default: bulan ini
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    timeLabel = 'Bulan Ini';
  }

  return { startDate, endDate, prevStart, prevEnd, timeLabel };
}

// Category emoji map (Sesuai 52 Kategori Supabase Tuan Faqih)
const CATEGORY_EMOJI = {
  'Jajan / Ngopi / Kafe': '☕', 'Makan Berat / Makan Luar': '🍽️', 'Pesan Antar / Delivery': '🛵', 'Bahan Makanan / Groceries': '🛒',
  'Pendapatan (umum)': '💰', 'Hadiah': '🎁', 'Beasiswa': '🎓', 'Pengembalian dana pajak': '💵', 'Cek, kupon': '🎟️',
  'Obat & Vitamin': '💊', 'Pendapatan pengembalian hutang': '🤝', 'Iuran & hibah': '🤲', 'Kebutuhan Kampus / ATK': '📚',
  'Pendapatan sewa': '🏠', 'Pendapatan bisnis penjualan': '📈', 'Bunga, dividen': '💎', 'Elektronik & Gadget': '📱',
  'Gaji, faktur': '💼', 'Skincare & Kosmetik': '✨', 'Pakaian & Aksesoris': '👗', 'Potong Rambut / Barbershop': '✂️',
  'Alat Mandi & Cukur': '🚿', 'Perlengkapan Kamar': '🛏️', 'Jasa Laundry': '🧺', 'Listrik / Air': '⚡',
  'Sewa Kos / Kontrakan': '🏡', 'Tiket Jarak Jauh': '✈️', 'Ojek / Taksi Online': '🚗', 'Transportasi Umum': '🚌',
  'Sewa Kendaraan': '🚘', 'Servis / Cuci Kendaraan': '🔧', 'Bensin & Parkir': '⛽', 'Alkohol, tembakau': '🚬',
  'Sosial & Kado': '🎉', 'Kencan / Jalan-jalan': '🍿', 'Langganan Digital': '💻', 'Buku & Pendidikan': '📖',
  'Hobi / Eksperimen': '🎨', 'Memberi Pinjaman / Piutang': '💸', 'Olahraga & Event': '⚽', 'Klinik & Dokter': '🏥',
  'Internet / WiFi Kos': '🌐', 'Pulsa & Paket Data': '📶', 'Biaya Admin / Layanan': '🧾', 'Cicilan / Hutang': '💳',
  'Asuransi / BPJS': '🛡️', 'Pajak & Denda': '📑', 'Investasi (Reksadana / Saham)': '📊', 'Tabungan / Dana Darurat': '🏦',
  'Uang Hilang': '❓', 'Penyesuaian Saldo': '⚖️', 'Lainnya': '🔖'
};

function _catEmoji(name) { return CATEGORY_EMOJI[name] || '💳'; }

/**
 * Breakdown pengeluaran per kategori.
 */
async function getCategoryInsight(dateText = null) {
  try {
    const { startDate, endDate, timeLabel } = _parseAnalyticsPeriod(dateText);
    const breakdown = await supabaseFinance.getCategoryBreakdown(startDate, endDate);

    if (!breakdown || breakdown.length === 0) {
      return `📭 Tidak ada data pengeluaran untuk ${timeLabel}.`;
    }

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    let msg = `📊 <b>Breakdown Pengeluaran — ${timeLabel}</b>\n\n`;

    const top = breakdown.slice(0, 8);
    top.forEach((cat, i) => {
      const bar = '█'.repeat(Math.round(cat.percentage / 10)) + '░'.repeat(10 - Math.round(cat.percentage / 10));
      msg += `<b>${i + 1}. ${_catEmoji(cat.name)} ${cat.name}</b>\n`;
      msg += `   ${formatRp(cat.total)} · ${cat.percentage.toFixed(1)}% · ${cat.count} transaksi\n`;
      msg += `   <code>${bar}</code>\n\n`;
    });

    if (breakdown.length > 8) {
      const rest = breakdown.slice(8).reduce((s, c) => s + c.total, 0);
      msg += `🔖 <i>+${breakdown.length - 8} kategori lainnya: ${formatRp(rest)}</i>\n`;
    }

    return msg.trim();
  } catch (err) {
    return `⚠️ Gagal mengambil breakdown kategori: ${err.message}`;
  }
}

/**
 * Perbandingan periode ini vs periode sebelumnya.
 */
async function getPeriodComparisonReport(dateText = null) {
  try {
    const { startDate, endDate, prevStart, prevEnd, timeLabel } = _parseAnalyticsPeriod(dateText);
    const { current, previous } = await supabaseFinance.getPeriodComparison(startDate, endDate, prevStart, prevEnd);

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    const delta = (curr, prev) => {
      if (prev === 0) return curr > 0 ? '(baru)' : '';
      const pct = ((curr - prev) / prev * 100);
      return pct > 0 ? `📈 +${pct.toFixed(0)}%` : `📉 ${pct.toFixed(0)}%`;
    };

    const prevLabel = timeLabel.replace('Ini', 'Lalu').replace('Kemarin', '2 Hari Lalu').replace('Hari Ini', 'Kemarin');

    let msg = `📊 <b>Perbandingan Periode</b>\n\n`;
    msg += `<b>Periode:</b> ${timeLabel} vs ${prevLabel}\n\n`;
    msg += `<b>💰 Pengeluaran</b>\n`;
    msg += `  ${timeLabel}: ${formatRp(current.totalExpense)}\n`;
    msg += `  ${prevLabel}: ${formatRp(previous.totalExpense)} ${delta(current.totalExpense, previous.totalExpense)}\n\n`;
    msg += `<b>🟢 Pemasukan</b>\n`;
    msg += `  ${timeLabel}: ${formatRp(current.totalIncome)}\n`;
    msg += `  ${prevLabel}: ${formatRp(previous.totalIncome)} ${delta(current.totalIncome, previous.totalIncome)}\n\n`;
    msg += `<b>🏦 Saldo Bersih</b>\n`;
    msg += `  ${timeLabel}: ${formatRp(current.balance)}\n`;
    msg += `  ${prevLabel}: ${formatRp(previous.balance)} ${delta(current.balance, previous.balance)}`;

    return msg;
  } catch (err) {
    return `⚠️ Gagal membuat laporan perbandingan: ${err.message}`;
  }
}

/**
 * N pengeluaran terbesar dalam periode.
 */
async function getTopExpensesReport(dateText = null, limit = 5) {
  try {
    const { startDate, endDate, timeLabel } = _parseAnalyticsPeriod(dateText);
    const rows = await supabaseFinance.getTopExpenses(startDate, endDate, limit);

    if (!rows || rows.length === 0) {
      return `📭 Tidak ada data pengeluaran untuk ${timeLabel}.`;
    }

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    let msg = `💸 <b>Top ${rows.length} Pengeluaran — ${timeLabel}</b>\n\n`;

    rows.forEach((tx, i) => {
      const cat = tx.categories?.name || '-';
      const desc = tx.description || cat;
      msg += `<b>${i + 1}. ${_catEmoji(cat)} ${desc}</b>\n`;
      msg += `   ${formatRp(tx.amount)} · ${tx.transaction_date}\n\n`;
    });

    return msg.trim();
  } catch (err) {
    return `⚠️ Gagal mengambil top pengeluaran: ${err.message}`;
  }
}

/**
 * Saldo semua akun real-time.
 */
async function getAccountBalancesReport() {
  try {
    const balances = await supabaseFinance.getAccountBalances();

    if (!balances || balances.length === 0) {
      return `📭 Tidak ada akun keuangan yang terdaftar di Nexa Finance Web.`;
    }

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    const typeLabel = { bank: 'Rekening', cash: 'Tunai', 'e-wallet': 'E-Wallet' };

    let msg = `🏦 <b>Saldo Per Akun (Real-time)</b>\n\n`;
    let grandTotal = 0;

    for (const acc of balances) {
      const icon = acc.type === 'bank' ? '🏦' : acc.type === 'cash' ? '💵' : '📱';
      const tLabel = typeLabel[acc.type] || acc.type;
      msg += `${icon} <b>${acc.name}</b> <i>(${tLabel})</i>\n`;
      msg += `   Saldo: <b>${formatRp(acc.balance)}</b>\n`;
      msg += `   Masuk: +${formatRp(acc.totalIncome)} · Keluar: -${formatRp(acc.totalExpense)}\n\n`;
      grandTotal += acc.balance;
    }

    msg += `──────────────\n`;
    msg += `💰 <b>Total Kekayaan Bersih: ${formatRp(grandTotal)}</b>`;
    return msg;
  } catch (err) {
    return `⚠️ Gagal mengambil saldo akun: ${err.message}`;
  }
}

/**
 * Tren pengeluaran harian dalam periode — narasi + data hari termahal.
 */
async function getDailyTrendReport(dateText = null) {
  try {
    const { startDate, endDate, timeLabel } = _parseAnalyticsPeriod(dateText);
    const trend = await supabaseFinance.getDailyTrend(startDate, endDate);

    if (!trend || trend.length === 0) {
      return `📭 Tidak ada data tren harian untuk ${timeLabel}.`;
    }

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    const expenseDays = trend.filter(d => d.expense > 0);
    const totalExpense = trend.reduce((s, d) => s + d.expense, 0);
    // === Rumus IDENTIK analytics-view.tsx: avgDaily = totalExpense / daysPassed ===
    // daysPassed = jumlah hari riil dalam periode (bukan hanya hari yang ada transaksi)
    const daysPassed = trend.length; // getDailyTrend sudah mengembalikan array lengkap
    const avgDaily = daysPassed > 0 ? totalExpense / daysPassed : 0;
    const maxDay = expenseDays.sort((a, b) => b.expense - a.expense)[0];
    const minDay = [...expenseDays].sort((a, b) => a.expense - b.expense)[0];

    // Narasi tren: apakah meningkat, menurun, atau stabil?
    const firstHalf = trend.slice(0, Math.floor(trend.length / 2));
    const secondHalf = trend.slice(Math.floor(trend.length / 2));
    const avgFirst = firstHalf.reduce((s, d) => s + d.expense, 0) / (firstHalf.length || 1);
    const avgSecond = secondHalf.reduce((s, d) => s + d.expense, 0) / (secondHalf.length || 1);
    let trendNarasi;
    if (avgSecond > avgFirst * 1.1) trendNarasi = '📈 Meningkat di akhir periode';
    else if (avgSecond < avgFirst * 0.9) trendNarasi = '📉 Menurun di akhir periode';
    else trendNarasi = '↔️ Relatif stabil sepanjang periode';

    let msg = `📈 <b>Tren Pengeluaran Harian — ${timeLabel}</b>\n\n`;
    msg += `<b>Pola:</b> ${trendNarasi}\n`;
    msg += `<b>Rata-rata harian:</b> ${formatRp(avgDaily)}\n`;
    if (maxDay) msg += `<b>Hari termahal:</b> ${maxDay.date} (${formatRp(maxDay.expense)})\n`;
    if (minDay && minDay.date !== maxDay?.date) msg += `<b>Hari terhemat:</b> ${minDay.date} (${formatRp(minDay.expense)})\n`;
    msg += `<b>Hari ada transaksi:</b> ${expenseDays.length} hari\n\n`;

    // Mini chart ASCII tren per hari (max 14 hari terakhir)
    const chartDays = trend.slice(-14);
    if (chartDays.length > 0) {
      const maxExp = Math.max(...chartDays.map(d => d.expense), 1);
      msg += `<b>Grafik Pengeluaran:</b>\n<code>`;
      for (const d of chartDays) {
        const bars = Math.round((d.expense / maxExp) * 8);
        const bar = '█'.repeat(bars) + '░'.repeat(8 - bars);
        const label = d.date.slice(5); // MM-DD
        msg += `${label} ${bar} ${formatRp(d.expense)}\n`;
      }
      msg += `</code>`;
    }

    return msg.trim();
  } catch (err) {
    return `⚠️ Gagal mengambil tren harian: ${err.message}`;
  }
}

/**
 * Ringkasan keuangan cerdas ALL-IN-ONE dengan insight AI.
 */
async function getSmartFinanceSummary(dateText = null) {
  try {
    const { startDate, endDate, prevStart, prevEnd, timeLabel } = _parseAnalyticsPeriod(dateText);

    const [analytics, breakdown, comparison, accountBals] = await Promise.all([
      supabaseFinance.getFinanceAnalytics(startDate, endDate),
      supabaseFinance.getCategoryBreakdown(startDate, endDate),
      supabaseFinance.getPeriodComparison(startDate, endDate, prevStart, prevEnd),
      supabaseFinance.getAccountBalances()
    ]);

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;

    let msg = `💡 <b>Ringkasan Keuangan Cerdas — ${timeLabel}</b>\n\n`;

    // Summary
    msg += `📊 <b>Ringkasan:</b>\n`;
    msg += `  💰 Pengeluaran: ${formatRp(analytics.totalExpense)}\n`;
    msg += `  🟢 Pemasukan:   ${formatRp(analytics.totalIncome)}\n`;
    msg += `  🏦 Saldo Bersih: <b>${formatRp(analytics.balance)}</b>\n\n`;

    // Top 3 kategori
    if (breakdown.length > 0) {
      msg += `🏆 <b>Top Kategori Pengeluaran:</b>\n`;
      breakdown.slice(0, 3).forEach((cat, i) => {
        msg += `  ${i + 1}. ${_catEmoji(cat.name)} ${cat.name}: ${formatRp(cat.total)} (${cat.percentage.toFixed(0)}%)\n`;
      });
      msg += '\n';
    }

    // Perbandingan vs periode sebelumnya
    if (comparison.previous.totalExpense > 0) {
      const pct = ((analytics.totalExpense - comparison.previous.totalExpense) / comparison.previous.totalExpense * 100);
      const icon = pct > 5 ? '📈' : pct < -5 ? '📉' : '↔️';
      msg += `${icon} <b>vs Periode Sebelumnya:</b>\n`;
      msg += `  Pengeluaran ${pct > 0 ? 'naik' : 'turun'} ${Math.abs(pct).toFixed(0)}% (dari ${formatRp(comparison.previous.totalExpense)})\n\n`;
    }

    // Saldo akun
    if (accountBals.length > 0) {
      msg += `💳 <b>Saldo Akun:</b>\n`;
      for (const acc of accountBals) {
        const icon = acc.type === 'bank' ? '🏦' : acc.type === 'cash' ? '💵' : '📱';
        msg += `  ${icon} ${acc.name}: <b>${formatRp(acc.balance)}</b>\n`;
      }
      msg += '\n';
    }

    // AI insight singkat
    try {
      const { callAI } = require('../../core/AI_Router');
      const topCat = breakdown[0]?.name || 'Lainnya';
      const balDir = analytics.balance >= 0 ? 'positif' : 'negatif';
      const insightPrompt = `Kamu adalah analis keuangan pribadi yang cerdas dan hangat. Berikan insight singkat (2-3 kalimat, casual dan personal, dalam bahasa Indonesia) untuk Tuan Faqih berdasarkan data berikut:\n- Periode: ${timeLabel}\n- Total Pengeluaran: ${formatRp(analytics.totalExpense)}\n- Total Pemasukan: ${formatRp(analytics.totalIncome)}\n- Saldo Bersih: ${formatRp(analytics.balance)} (${balDir})\n- Kategori pengeluaran terbesar: ${topCat}\nBerikan: 1 apresiasi/saran singkat dan 1 tips konkret. Jangan gunakan format JSON. Langsung teks.`;
      const insight = await callAI(insightPrompt);
      if (insight) msg += `🧠 <b>Insight AI:</b>\n<i>${insight.trim()}</i>`;
    } catch (_) { /* Non-fatal */ }

    return msg.trim();
  } catch (err) {
    return `⚠️ Gagal mengambil ringkasan cerdas: ${err.message}`;
  }
}

/**
 * Ringkasan bulanan 7 bulan terakhir (sama persis dengan chart bar di Web).
 */
async function getMonthlySummaryReport() {
  try {
    const data = await supabaseFinance.getMonthlySummary(7);
    if (!data || data.length === 0) return '📭 Tidak ada data ringkasan bulanan.';

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    const MONTHS_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];

    let msg = `📅 <b>Tren Keuangan 7 Bulan Terakhir</b>\n\n`;
    const maxVal = Math.max(...data.map(d => Math.max(d.total_income, d.total_expense)), 1);

    for (const row of data) {
      const [y, m] = row.month.split('-');
      const label = `${MONTHS_ID[parseInt(m) - 1]} ${y}`;
      const incBars = Math.round((row.total_income / maxVal) * 8);
      const expBars = Math.round((row.total_expense / maxVal) * 8);
      const net = row.total_income - row.total_expense;
      const netIcon = net >= 0 ? '✅' : '🔴';
      msg += `<b>${label}</b> ${netIcon}\n`;
      msg += `<code>  🟢 ${'█'.repeat(incBars)}${'░'.repeat(8 - incBars)} ${formatRp(row.total_income)}\n`;
      msg += `  🔴 ${'█'.repeat(expBars)}${'░'.repeat(8 - expBars)} ${formatRp(row.total_expense)}</code>\n\n`;
    }

    return msg.trim();
  } catch (err) {
    return `⚠️ Gagal mengambil ringkasan bulanan: ${err.message}`;
  }
}

/**
 * Saving rate (tingkat tabungan) untuk periode tertentu.
 */
async function getSavingRateReport(dateText = null) {
  try {
    const { startDate, endDate, timeLabel } = _parseAnalyticsPeriod(dateText);
    const analytics = await supabaseFinance.getFinanceAnalytics(startDate, endDate);

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;

    if (analytics.totalIncome === 0 && analytics.totalExpense === 0) {
      return `📭 Tidak ada data keuangan untuk ${timeLabel}.`;
    }

    const savingsRate = analytics.totalIncome > 0
      ? ((analytics.totalIncome - analytics.totalExpense) / analytics.totalIncome * 100)
      : 0;
    const tabungan = analytics.totalIncome - analytics.totalExpense;

    let ratingIcon, ratingText;
    if (savingsRate >= 30) { ratingIcon = '🏆'; ratingText = 'Sangat Baik! Hemat sekali.'; }
    else if (savingsRate >= 20) { ratingIcon = '✅'; ratingText = 'Baik. Finansial sehat.'; }
    else if (savingsRate >= 10) { ratingIcon = '⚠️'; ratingText = 'Cukup. Bisa lebih hemat.'; }
    else if (savingsRate > 0) { ratingIcon = '🔴'; ratingText = 'Perlu perhatian. Pengeluaran hampir sama dengan pemasukan.'; }
    else { ratingIcon = '❌'; ratingText = 'Defisit! Pengeluaran melebihi pemasukan.'; }

    let msg = `💰 <b>Tingkat Tabungan — ${timeLabel}</b>\n\n`;
    msg += `<b>Pemasukan:</b>   ${formatRp(analytics.totalIncome)}\n`;
    msg += `<b>Pengeluaran:</b> ${formatRp(analytics.totalExpense)}\n`;
    msg += `<b>Sisa/Tabungan:</b> <b>${formatRp(tabungan)}</b>\n`;
    msg += `──────────────\n`;
    msg += `<b>Saving Rate: ${savingsRate.toFixed(1)}%</b>\n`;
    msg += `${ratingIcon} <i>${ratingText}</i>`;

    return msg;
  } catch (err) {
    return `⚠️ Gagal menghitung saving rate: ${err.message}`;
  }
}

/**
 * Tren saldo harian untuk akun pertama (sama persis dengan Area Chart di Web).
 */
async function getDailyBalanceTrendReport(dateText = null) {
  try {
    const { startDate, endDate, timeLabel } = _parseAnalyticsPeriod(dateText);
    const accounts = await supabaseFinance.getAccountsList();

    if (!accounts || accounts.length === 0) {
      return '📭 Tidak ada akun yang terdaftar.';
    }

    // Use getAccountBalances to get the first account with its id
    const balances = await supabaseFinance.getAccountBalances();
    if (!balances || balances.length === 0) return '📭 Tidak ada saldo akun.';

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    let msg = `📈 <b>Tren Saldo Harian — ${balances[0].name} (${timeLabel})</b>\n\n`;

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    const trend = await supabaseFinance.getDailyBalanceTrend(balances[0].id, startStr, endStr);

    if (!trend || trend.length === 0) return `📭 Tidak ada data tren saldo untuk ${timeLabel}.`;

    const maxVal = Math.max(...trend.map(d => Math.abs(d.running_balance)), 1);
    msg += `<code>`;
    for (const d of trend.slice(-10)) {
      const bars = Math.round((Math.abs(d.running_balance) / maxVal) * 8);
      const label = d.day.slice(5); // MM-DD
      msg += `${label} ${'█'.repeat(bars)}${'░'.repeat(8 - bars)} ${formatRp(d.running_balance)}\n`;
    }
    msg += `</code>\n`;
    msg += `<b>Saldo akhir periode:</b> ${formatRp(trend[trend.length - 1].running_balance)}`;

    return msg.trim();
  } catch (err) {
    return `⚠️ Gagal mengambil tren saldo: ${err.message}`;
  }
}

module.exports = {
  getFinanceAnalytics,
  _parseAnalyticsPeriod,
  CATEGORY_EMOJI,
  _catEmoji,
  getCategoryInsight,
  getPeriodComparisonReport,
  getTopExpensesReport,
  getAccountBalancesReport,
  getDailyTrendReport,
  getSmartFinanceSummary,
  getMonthlySummaryReport,
  getSavingRateReport,
  getDailyBalanceTrendReport,
};
