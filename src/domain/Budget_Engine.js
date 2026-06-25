const supabaseFinance = require('../infrastructure/Supabase_Finance');

function getStartAndEndOf(period, txDate) {
  // Gunakan WIB (UTC+7) agar konsisten dengan transaksi yang dicatat di zona waktu Jakarta
  const WIB_OFFSET = 7 * 60 * 60 * 1000;
  const txWIB = new Date(txDate.getTime() + WIB_OFFSET);

  if (period === 'daily') {
    // Mulai dari 00:00:00 WIB hari ini, akhir 23:59:59 WIB hari ini
    const startWIB = new Date(txWIB);
    startWIB.setUTCHours(0, 0, 0, 0);
    const endWIB = new Date(txWIB);
    endWIB.setUTCHours(23, 59, 59, 999);
    return {
      start: new Date(startWIB.getTime() - WIB_OFFSET),
      end: new Date(endWIB.getTime() - WIB_OFFSET)
    };
  } else if (period === 'weekly') {
    // Mulai Senin WIB, akhir Minggu WIB
    const dayOfWeekWIB = txWIB.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diffToMonday = dayOfWeekWIB === 0 ? -6 : 1 - dayOfWeekWIB;
    const startWIB = new Date(txWIB);
    startWIB.setUTCDate(txWIB.getUTCDate() + diffToMonday);
    startWIB.setUTCHours(0, 0, 0, 0);
    const endWIB = new Date(startWIB);
    endWIB.setUTCDate(startWIB.getUTCDate() + 6);
    endWIB.setUTCHours(23, 59, 59, 999);
    return {
      start: new Date(startWIB.getTime() - WIB_OFFSET),
      end: new Date(endWIB.getTime() - WIB_OFFSET)
    };
  } else { // monthly
    // Mulai tanggal 1 bulan ini WIB, akhir hari terakhir bulan ini WIB
    const startWIB = new Date(txWIB);
    startWIB.setUTCDate(1);
    startWIB.setUTCHours(0, 0, 0, 0);
    const endWIB = new Date(txWIB);
    endWIB.setUTCMonth(endWIB.getUTCMonth() + 1, 0); // hari terakhir bulan ini
    endWIB.setUTCHours(23, 59, 59, 999);
    return {
      start: new Date(startWIB.getTime() - WIB_OFFSET),
      end: new Date(endWIB.getTime() - WIB_OFFSET)
    };
  }
}

function generateProgressBar(percentage) {
  const totalBlocks = 12;
  const filledBlocks = Math.round((Math.min(percentage, 100) / 100) * totalBlocks);
  const emptyBlocks = totalBlocks - filledBlocks;
  return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
}

function formatRp(amount) {
  return 'Rp' + Math.abs(amount).toLocaleString('id-ID');
}

/**
 * Cek apakah transaksi baru melanggar/mendekati batas anggaran.
 * Dipanggil dari Finance_Engine.processTransaction setiap ada pengeluaran.
 */
async function checkAndAlertBudget(newTransactionData) {
  // newTransactionData: { nominal, categoryName, description, date }
  try {
    const txDate = new Date(newTransactionData.date || new Date());
    
    // 1. Resolve category ID (UUID) dari nama kategori
    // CATATAN: resolveCategoryId mengembalikan NAMA yang dicocokkan (bukan UUID).
    // Kita perlu ID sebenarnya untuk filter. Ambil dari tabel categories langsung.
    let categoryId = null;
    try {
      const allCats = await supabaseFinance.getCategoriesList();
      const resolvedName = await supabaseFinance.resolveCategoryId(newTransactionData.categoryName, 'EXPENSE');
      const matched = allCats.find(c => c.name === resolvedName);
      if (matched) categoryId = matched.id;
    } catch (_) { /* category resolve tidak blocking */ }
    
    // 2. Load Budgets
    const budgets = await supabaseFinance.getBudgets();
    if (!budgets || budgets.length === 0) return null; // Tidak ada anggaran aktif
    
    // 3. Filter anggaran yang relevan (Global atau Spesifik Kelompok yang cocok)
    const applicableBudgets = budgets.filter(b => {
      if (!b.budget_group_id) return true; // Global
      if (b.budget_groups && b.budget_groups.category_ids && categoryId) {
        return b.budget_groups.category_ids.includes(categoryId);
      }
      return false;
    });
    
    if (applicableBudgets.length === 0) return null;

    let alertMessages = [];

    // Group budgets by budget_group_id to process them together
    const groups = {};
    for (const b of applicableBudgets) {
      const gid = b.budget_group_id || 'GLOBAL';
      if (!groups[gid]) {
        groups[gid] = { 
          groupName: b.budget_group_id ? b.budget_groups.name : 'GLOBAL', 
          budgets: [], 
          categoryIds: b.budget_group_id ? b.budget_groups.category_ids : null 
        };
      }
      groups[gid].budgets.push(b);
    }

    for (const gid of Object.keys(groups)) {
      const group = groups[gid];
      let alertTriggered = false;
      let statuses = {};

      for (const budget of group.budgets) {
        const budgetAmount = Number(budget.amount);
        // Jangan proses jika budget.amount 0 atau invalid (divide-by-zero protection)
        if (!budgetAmount || budgetAmount <= 0) continue;

        const { start, end } = getStartAndEndOf(budget.period, txDate);
        const spent = await supabaseFinance.getExpenseSumByCategories(group.categoryIds, start, end);
        const percentage = (spent / budgetAmount) * 100;
        
        statuses[budget.period] = {
          spent,
          amount: budgetAmount,
          percentage,
          isOver: percentage >= 100,
          isWarning: percentage >= 80 && percentage < 100
        };

        if (percentage >= 80) {
          alertTriggered = true;
        }
      }

      if (alertTriggered) {
        // Construct alert message for this group
        let title = group.groupName === 'GLOBAL' ? '🚨 ALERT ANGGARAN GLOBAL' : `🚨 ALERT ANGGARAN — ${group.groupName.toUpperCase()}`;
        let msg = `${title}\n`;
        
        const txDesc = newTransactionData.description || newTransactionData.categoryName;
        msg += `Tuan, setelah transaksi tadi (${formatRp(newTransactionData.nominal)} - ${txDesc}), jatah Anda mencapai batas peringatan.\n\n`;

        // Format Daily
        if (statuses['daily']) {
          const s = statuses['daily'];
          const statusIcon = s.isOver ? '❌' : (s.isWarning ? '⚠️' : '✅');
          msg += `📊 <b>Status Hari Ini:</b> ${statusIcon}\n`;
          msg += `   Terpakai: ${generateProgressBar(s.percentage)} ${formatRp(s.spent)}\n`;
          if (s.isOver) {
             msg += `   Over: ${formatRp(s.spent - s.amount)}\n\n`;
          } else {
             msg += `   Sisa: ${formatRp(s.amount - s.spent)}\n\n`;
          }
        }

        // Format Weekly
        if (statuses['weekly']) {
          const s = statuses['weekly'];
          const statusIcon = s.isOver ? '❌' : (s.isWarning ? '⚠️' : '✅');
          const safeStr = s.isOver ? 'Melebihi batas!' : 'Aman';
          msg += `📅 <b>Status Minggu Ini:</b> ${statusIcon} ${safeStr} (${formatRp(s.spent)} dari ${formatRp(s.amount)} — ${Math.round(s.percentage)}%)\n`;
        }

        // Format Monthly
        if (statuses['monthly']) {
          const s = statuses['monthly'];
          const statusIcon = s.isOver ? '❌' : (s.isWarning ? '⚠️' : '✅');
          const safeStr = s.isOver ? 'Melebihi batas!' : 'Aman';
          msg += `📆 <b>Status Bulan Ini:</b> ${statusIcon} ${safeStr} (${formatRp(s.spent)} dari ${formatRp(s.amount)} — ${Math.round(s.percentage)}%)\n`;
        }

        alertMessages.push(msg);
      }
    }

    if (alertMessages.length > 0) {
      return alertMessages.join('\n──────────────\n\n');
    }

    return null;
  } catch (error) {
    console.error('[BUDGET_ENGINE] checkAndAlertBudget error:', error);
    return null;
  }
}

module.exports = {
  checkAndAlertBudget
};
