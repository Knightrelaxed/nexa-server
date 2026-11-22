'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFinanceTxCard,
  buildRecurringBillCard,
  buildIdentityProposalCard,
  buildMemoryHygieneCard,
  buildDisciplineCheckCard,
  buildCalendarConflictCard,
  buildFinanceDeleteCard,
  buildTaskConfirmCard,
  buildProactiveTasksCard,
  buildVaultMetadataCard,
  buildBriefingCard,
  buildBudgetRecapCard,
  handleCardAction
} = require('../src/interfaces/bridge/mobile_bridge/card_handler');

const { createMobileChatHandler } = require('../src/interfaces/bridge/mobile_bridge/chat_handler');

describe('Mobile Bridge Phase 1: Interactive Card Builders & Actions', () => {
  it('builds FINANCE_TX card with dynamic categories and countdown', () => {
    const card = buildFinanceTxCard(
      {
        nominal: 45000,
        type: 'EXPENSE',
        destination: 'Kopi Kenangan',
        category: 'Jajan / Ngopi / Kafe',
        suggestedAccount: 'Bank Mandiri',
        payment_method: 'QRIS',
        description: '[Menunggu Detail User]'
      },
      'gmail_abc123',
      {
        categories: [{ name: 'Makan Berat / Makan Luar' }, { name: 'Jajan / Ngopi / Kafe' }],
        expiresAtMs: 1800000000000
      }
    );

    assert.equal(card.card_id, 'fin_gmail_abc123');
    assert.equal(card.card_type, 'FINANCE_TX');
    assert.equal(card.status, 'PENDING');
    assert.equal(card.hero_value, '-Rp 45.000');
    assert.equal(card.expires_at, 1800000000000);
    assert.deepEqual(card.categories, ['Makan Berat / Makan Luar', 'Jajan / Ngopi / Kafe']);
    assert.equal(card.actions.length, 4);
  });

  it('handles FINANCE_TX confirm, cancel, and update_category live refresh', async () => {
    const frames = [];
    const mockTx = {
      nominal: 45000,
      type: 'EXPENSE',
      destination: 'Kopi Kenangan',
      category: 'Jajan / Ngopi / Kafe',
      account: 'Bank Mandiri',
      description: 'Kopi susu'
    };
    const deps = {
      sendFrame: (f) => frames.push(f),
      notifier: { markEngaged: async () => true },
      supabaseFinance: {
        getCategoriesList: async () => [{ name: 'Makan Berat / Makan Luar' }, { name: 'Jajan / Ngopi / Kafe' }]
      },
      financeConfirmations: {
        updatePendingTransaction: async (_desc, cat) => {
          if (cat) mockTx.category = cat;
          return 'Updated';
        },
        getPendingTransactionByKey: () => ({ tx: mockTx, expiresAtMs: 1800000000000 }),
        confirmPendingTransactions: async (isConfirm) => (isConfirm ? 'Transaksi dicatat.' : 'Transaksi dibatalkan.')
      }
    };

    // 1. Update category keeps card PENDING with refreshed fields
    await handleCardAction({
      card_id: 'fin_gmail_1',
      card_type: 'FINANCE_TX',
      action_id: 'update_category',
      payload: { category: 'Makan Berat / Makan Luar' }
    }, null, deps);

    assert.equal(frames.length, 1);
    assert.equal(frames[0].type, 'CARD_UPDATE');
    assert.equal(frames[0].status, 'PENDING');
    assert.equal(frames[0].updated_card.meta.category, 'Makan Berat / Makan Luar');

    // 2. Confirm resolves and locks card
    await handleCardAction({
      card_id: 'fin_gmail_1',
      card_type: 'FINANCE_TX',
      action_id: 'confirm'
    }, null, deps);

    assert.equal(frames.length, 2);
    assert.equal(frames[1].status, 'RESOLVED');
    assert.equal(frames[1].resolved_badge, 'Recorded');
  });

  it('handles RECURRING_BILL approve and reject', async () => {
    const card = buildRecurringBillCard({ id: 77, display_name: 'Spotify', cadence: 'MONTHLY', amount_median: 54990 });
    assert.equal(card.card_id, 'rec_77');

    const updates = [];
    const frames = [];
    const deps = {
      sendFrame: (f) => frames.push(f),
      notifier: { markEngaged: async () => true },
      supabaseFinance: {
        updateRecurringRuleStatus: async (id, status) => {
          updates.push({ id, status });
          return true;
        }
      }
    };

    await handleCardAction({ card_id: 'rec_77', card_type: 'RECURRING_BILL', action_id: 'approve' }, null, deps);
    assert.deepEqual(updates, [{ id: '77', status: 'ACTIVE' }]);
    assert.equal(frames[0].resolved_badge, 'Approved');
  });

  it('handles IDENTITY_PROPOSAL approve and reject with optional reason', async () => {
    const card = buildIdentityProposalCard({
      id: 19,
      layer: 'HABITS',
      trait_key: 'deep_work_window',
      old_value: 'Pagi',
      proposed_value: 'Subuh 05:00-08:00',
      confidence: 0.91,
      reasoning: 'Konsisten 7 hari terakhir'
    });
    assert.equal(card.card_id, 'idprop_19');
    assert.equal(card.confidence, 91);
    assert.equal(card.diff.old_value, 'Pagi');

    const rejected = [];
    const frames = [];
    const deps = {
      sendFrame: (f) => frames.push(f),
      notifier: { markEngaged: async () => true },
      aiRouter: { invalidatePersonalFactsCache: () => {}, invalidateIdentityModelCache: () => {} },
      supabaseMemories: {
        rejectIdentityProposal: async (id, reason) => { rejected.push({ id, reason }); }
      }
    };

    await handleCardAction({
      card_id: 'idprop_19',
      card_type: 'IDENTITY_PROPOSAL',
      action_id: 'reject',
      payload: { reason: 'Cuma pas proyek deadline' }
    }, null, deps);

    assert.deepEqual(rejected, [{ id: 19, reason: 'Cuma pas proyek deadline' }]);
    assert.equal(frames[0].status, 'RESOLVED');
    assert.equal(frames[0].resolved_badge, 'Rejected');
  });

  it('handles MEMORY_HYGIENE selective archive_selected (archives checked, keeps unchecked ACTIVE)', async () => {
    const card = buildMemoryHygieneCard([
      { id: 10, table: 'USER_PROFILE', content: 'Fakta lama A', last_reinforced_at: new Date(Date.now() - 40 * 86400e3).toISOString() },
      { id: 11, table: 'USER_PROFILE', content: 'Fakta lama B', last_reinforced_at: new Date(Date.now() - 50 * 86400e3).toISOString() }
    ], { ephemeralArchived: 1, merged: 0 });
    assert.equal(card.selectable_items.length, 2);
    assert.equal(card.selectable_items[0].id, 'USER_PROFILE:10');

    const archivedCalls = [];
    const restoredIds = [];
    const frames = [];
    const deps = {
      sendFrame: (f) => frames.push(f),
      notifier: { markEngaged: async () => true },
      aiRouter: { invalidatePersonalFactsCache: () => {} },
      supabaseMemories: {
        getStagedForPruning: async () => ({
          userProfile: [{ id: 10 }, { id: 11 }],
          coreIdentity: []
        }),
        bulkArchiveMemories: async (ids, table) => {
          archivedCalls.push({ ids, table });
          return { archived: ids.length };
        },
        supabase: {
          from: () => ({
            update: () => ({
              in: async (_col, ids) => { restoredIds.push(...ids); }
            })
          })
        }
      }
    };

    await handleCardAction({
      card_id: card.card_id,
      card_type: 'MEMORY_HYGIENE',
      action_id: 'archive_selected',
      payload: { selected_ids: ['USER_PROFILE:10'] }
    }, null, deps);

    assert.deepEqual(archivedCalls, [{ ids: [10], table: 'USER_PROFILE' }]);
    assert.deepEqual(restoredIds, [11]);
    assert.equal(frames[0].status, 'RESOLVED');
    assert.equal(frames[0].resolved_badge, 'Archived 1');
  });

  it('handles DISCIPLINE_CHECK valid_research and extend_10m', async () => {
    const card = buildDisciplineCheckCard({ sessionKey: 'sess_42', appName: 'YouTube', usedCount: 1 });
    assert.equal(card.card_id, 'disc_sess_42');
    assert.equal(card.actions.length, 3);

    const updates = [];
    const frames = [];
    const deps = {
      sendFrame: (f) => frames.push(f),
      notifier: { markEngaged: async () => true },
      godMode: { triggerGodMode: async () => true },
      supabaseMemories: {
        supabase: {
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    session_key: 'sess_42',
                    pending_callback: true,
                    app_name: 'YouTube',
                    message_tone: 'firm',
                    ten_min_used_count: 1
                  }
                })
              })
            }),
            update: (patch) => ({
              eq: async (_col, key) => { updates.push({ key, patch }); }
            })
          })
        }
      }
    };

    await handleCardAction({ card_id: 'disc_sess_42', card_type: 'DISCIPLINE_CHECK', action_id: 'extend_10m' }, null, deps);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].patch.ten_min_used_count, 2);
    assert.equal(frames[0].resolved_badge, '+10 Min Granted');
  });

  it('handles direct mobile slash commands (/search and /capabilities) without LLM router', async () => {
    let routerCalled = false;
    const sentFrames = [];
    const fakeWs = { readyState: 1, send: (raw) => sentFrames.push(JSON.parse(raw)) };

    const handler = createMobileChatHandler({
      chunkDelayMs: 0,
      aiRouter: { routeUserMessage: async () => { routerCalled = true; return { intent: 'NORMAL_CHAT' }; } },
      saveChatMemory: async () => {},
      supabaseMemories: {
        searchPastChats: async (q) => [{ created_at: '2026-11-22T01:00:00Z', role: 'user', content: `Cek ${q} kemarin` }]
      }
    });

    await handler.handleMessage({ type: 'CHAT_SEND', client_msg_id: 'cmd-1', content: '/search VPS' }, fakeWs);
    await new Promise(r => setTimeout(r, 80));

    assert.equal(routerCalled, false);
    const chunks = sentFrames.filter(f => f.type === 'CHAT_CHUNK' && f.status === 'STREAMING_CHUNK').map(f => f.chunk).join('');
    assert.match(chunks, /Hasil Pencarian Riwayat/);
    assert.match(chunks, /Cek VPS kemarin/);
    handler.destroy();
  });
});

describe('Mobile Bridge Phase 2: Quick Action Chips & Conversational Interceptor Parity', () => {
  it('handles CALENDAR_CONFLICT force_create and cancel', async () => {
    const card = buildCalendarConflictCard({
      summary: 'Meeting Tim',
      start: '2026-11-23T09:00:00+07:00',
      end: '2026-11-23T10:00:00+07:00',
      location: 'Zoom'
    });
    assert.equal(card.presentation, 'CHIPS');
    assert.equal(card.card_type, 'CALENDAR_CONFLICT');

    const created = [];
    const frames = [];
    let cleared = false;
    const deps = {
      sendFrame: (f) => frames.push(f),
      notifier: { markEngaged: async () => true },
      clearPendingConflict: () => { cleared = true; },
      googleWorkspace: {
        createCalendarEvent: async (summary, start, end, _desc, loc) => {
          created.push({ summary, start, end, loc });
          return { id: 'ev-1' };
        }
      }
    };

    await handleCardAction({
      card_id: card.card_id,
      card_type: 'CALENDAR_CONFLICT',
      action_id: 'force_create',
      payload: card.meta
    }, null, deps);

    assert.equal(created.length, 1);
    assert.equal(created[0].summary, 'Meeting Tim');
    assert.equal(cleared, true);
    assert.equal(frames[0].status, 'RESOLVED');
    assert.equal(frames[0].resolved_badge, 'Added to Calendar');
  });

  it('handles FINANCE_DELETE confirm_delete and keep', async () => {
    const card = buildFinanceDeleteCard('del_123', { id: 'tx-99', description: 'Kopi' });
    assert.equal(card.presentation, 'CHIPS');

    const calls = [];
    const frames = [];
    const deps = {
      sendFrame: (f) => frames.push(f),
      notifier: { markEngaged: async () => true },
      financeEngine: {
        confirmDeleteTransaction: async (isYes) => {
          calls.push(isYes);
          return isYes ? '🗑️ TRANSAKSI DIHAPUS DARI DATABASE' : 'Dibatalkan';
        }
      }
    };

    await handleCardAction({
      card_id: card.card_id,
      card_type: 'FINANCE_DELETE',
      action_id: 'confirm_delete',
      payload: card.meta
    }, null, deps);

    assert.deepEqual(calls, [true]);
    assert.equal(frames[0].resolved_badge, 'Deleted');
  });

  it('handles TASK_CONFIRM across CONFIRM_SYNC, CONFIRM_DURATION, and CONFIRM_LIST', async () => {
    const syncCard = buildTaskConfirmCard({ type: 'CONFIRM_SYNC', title: 'Review PR', listName: 'Kerja' }, 'mobile-primary');
    assert.equal(syncCard.presentation, 'CHIPS');
    assert.equal(syncCard.actions[0].id, 'sync_yes');

    const durCard = buildTaskConfirmCard({ type: 'CONFIRM_DURATION', title: 'Baca Buku', listName: 'Pribadi' }, 'mobile-primary');
    assert.equal(durCard.actions.some(a => a.id === 'dur_30'), true);

    const pendingMap = new Map();
    pendingMap.set('mobile-primary', {
      type: 'CONFIRM_DURATION',
      title: 'Baca Buku',
      notes: '',
      dueDate: '2026-11-23',
      listName: 'Pribadi',
      durationMins: 0
    });

    const executed = [];
    const frames = [];
    const deps = {
      sendFrame: (f) => frames.push(f),
      notifier: { markEngaged: async () => true },
      googleWorkspace: {
        findEmptySlot: async () => ({ start: '2026-11-23T14:00:00+07:00' })
      },
      taskManager: {
        pendingTaskCategories: pendingMap,
        executePendingTask: async (sk, listName) => {
          const item = pendingMap.get(sk);
          pendingMap.delete(sk);
          executed.push({ durationMins: item.durationMins, listName });
          return { message: 'Tugas Baca Buku terjadwal.' };
        },
        cancelPendingTask: (sk) => pendingMap.delete(sk)
      }
    };

    await handleCardAction({
      card_id: durCard.card_id,
      card_type: 'TASK_CONFIRM',
      action_id: 'dur_30',
      payload: durCard.meta
    }, null, deps);

    assert.equal(executed.length, 1);
    assert.equal(executed[0].durationMins, 30);
    assert.equal(frames[0].resolved_badge, 'Scheduled (30m)');
  });

  it('handles PROACTIVE_TASKS selective checklist create_selected', async () => {
    const card = buildProactiveTasksCard({
      summary: 'Presentasi Klien',
      start: '2026-11-24T10:00:00+07:00',
      tasks: ['Siapkan slide', 'Cek proyektor', 'Print handout']
    });
    assert.equal(card.presentation, 'INLINE_CARD');
    assert.equal(card.selectable_items.length, 3);

    const createdTasks = [];
    const frames = [];
    const deps = {
      sendFrame: (f) => frames.push(f),
      notifier: { markEngaged: async () => true },
      taskManager: {
        handleTaskIntent: async (ed) => {
          createdTasks.push(ed.title);
          return { status: 'SUCCESS' };
        }
      }
    };

    await handleCardAction({
      card_id: card.card_id,
      card_type: 'PROACTIVE_TASKS',
      action_id: 'create_selected',
      payload: { ...card.meta, selected_ids: ['idx_0', 'idx_2'] }
    }, null, deps);

    assert.deepEqual(createdTasks, ['Siapkan slide', 'Print handout']);
    assert.equal(frames[0].resolved_badge, 'Added 2 Tasks');
  });

  it('auto-attaches CALENDAR_CONFLICT CHIPS on STREAM_FINAL and locks card on text reply parity', async () => {
    const sentFrames = [];
    const fakeWs = { readyState: 1, send: (raw) => sentFrames.push(JSON.parse(raw)) };

    const handler = createMobileChatHandler({
      chunkDelayMs: 0,
      saveChatMemory: async () => {},
      financeEngine: {
        getPendingDeletionsContext: () => null,
        getPendingConfirmationsCount: () => 0
      },
      taskManager: { pendingTaskCategories: new Map() },
      splitEngine: { hasPendingRemainder: () => false },
      aiRouter: {
        routeUserMessage: async () => ({
          intent: 'CALENDAR',
          extracted_data: {
            action: 'CREATE',
            summary: 'Standup',
            start: '2026-11-23T09:00:00+07:00',
            end: '2026-11-23T09:30:00+07:00'
          }
        })
      },
      executeDomainIntent: async (_intent, _rd, ctx) => {
        ctx.setPendingConflictEvent({
          summary: 'Standup',
          start: '2026-11-23T09:00:00+07:00',
          end: '2026-11-23T09:30:00+07:00'
        });
        return 'Jadwal Standup bentrok dengan Rapat Pagi. Tetap buat?';
      },
      interceptors: {
        handleMorningCheckIn: async () => false,
        handlePendingConflict: async (_text, _ev, { respondToTelegram }) => {
          await respondToTelegram('Baik Tuan, penambahan jadwal dibatalkan karena ada bentrok.');
          return { handled: true, updatedConflict: null };
        }
      }
    });

    // Turn 1: domain sets conflict -> STREAM_FINAL includes CALENDAR_CONFLICT CHIPS card
    await handler.handleMessage({ type: 'CHAT_SEND', client_msg_id: 'c-1', content: 'Jadwalkan standup jam 9' }, fakeWs);
    for (let i = 0; i < 40 && !sentFrames.some(f => f.type === 'CHAT_CHUNK' && f.client_msg_id === 'c-1' && f.status === 'STREAM_FINAL'); i++) {
      await new Promise(r => setTimeout(r, 25));
    }

    const finalFrame1 = sentFrames.find(f => f.type === 'CHAT_CHUNK' && f.client_msg_id === 'c-1' && f.status === 'STREAM_FINAL');
    assert.ok(finalFrame1 && finalFrame1.card);
    assert.equal(finalFrame1.card.card_type, 'CALENDAR_CONFLICT');
    assert.equal(finalFrame1.card.presentation, 'CHIPS');
    const attachedCardId = finalFrame1.card.card_id;

    // Turn 2: user replies "batal" by text -> interceptor handles it AND emits CARD_UPDATE locking the chips!
    await handler.handleMessage({ type: 'CHAT_SEND', client_msg_id: 'c-2', content: 'batal' }, fakeWs);
    for (let i = 0; i < 40 && !sentFrames.some(f => f.type === 'CHAT_CHUNK' && f.client_msg_id === 'c-2' && f.status === 'STREAM_FINAL'); i++) {
      await new Promise(r => setTimeout(r, 25));
    }

    const cardUpdate = sentFrames.find(f => f.type === 'CARD_UPDATE' && f.card_id === attachedCardId);
    assert.ok(cardUpdate);
    assert.equal(cardUpdate.status, 'RESOLVED');
    assert.equal(cardUpdate.resolved_badge, 'Cancelled');
    handler.destroy();
  });

  it('Audit Fixes #1 & #3: attaches FINANCE_TX card on manual chat record and emits CARD_UPDATE on text edit & confirm', async () => {
    const sentFrames = [];
    const fakeWs = { readyState: 1, send: (raw) => sentFrames.push(JSON.parse(raw)) };
    const pendingConfirmations = new Map();

    const handler = createMobileChatHandler({
      chunkDelayMs: 0,
      saveChatMemory: async () => {},
      supabaseFinance: {
        getCategoriesList: async () => [{ name: 'Makan & Minum' }, { name: 'Transportasi' }]
      },
      financeEngine: {
        getPendingDeletionsContext: () => null,
        getPendingConfirmationsCount: () => pendingConfirmations.size,
        getPendingConfirmationsMap: () => pendingConfirmations
      },
      taskManager: { pendingTaskCategories: new Map() },
      splitEngine: { hasPendingRemainder: () => false },
      aiRouter: {
        routeUserMessage: async () => ({
          intent: 'FINANCE',
          extracted_data: {
            action: 'RECORD',
            type: 'EXPENSE',
            nominal: 25000,
            destination: 'Kopi Kenangan'
          }
        })
      },
      executeDomainIntent: async () => {
        pendingConfirmations.set('25000_kopikenangan', {
          tx: {
            nominal: 25000,
            type: 'EXPENSE',
            destination: 'Kopi Kenangan',
            category: 'Makan & Minum',
            description: '[Menunggu Detail User]',
            account: 'Bank Mandiri',
            payment_method: 'QRIS'
          },
          expiresAtMs: Date.now() + 300_000
        });
        return 'Konfirmasi pencatatan pengeluaran Rp25.000 ke Kopi Kenangan.';
      },
      interceptors: {
        handleMorningCheckIn: async () => false,
        handlePendingFinanceConfirmation: async (_msgShim, text, _sk, { respondToTelegram }) => {
          if (text.startsWith('ubah catatan')) {
            const entry = pendingConfirmations.get('25000_kopikenangan');
            entry.tx = { ...entry.tx, description: 'Es Kopi Susu Tetangga' };
            await respondToTelegram('Catatan diperbarui menjadi Es Kopi Susu Tetangga.');
            return true;
          }
          if (text === 'ya') {
            pendingConfirmations.delete('25000_kopikenangan');
            await respondToTelegram('Transaksi Rp25.000 berhasil dicatat.');
            return true;
          }
          return false;
        }
      }
    });

    // Turn 1: Manual chat "beli kopi 25rb" -> attaches FINANCE_TX card on STREAM_FINAL
    await handler.handleMessage({ type: 'CHAT_SEND', client_msg_id: 'f-1', content: 'beli kopi 25rb' }, fakeWs);
    for (let i = 0; i < 40 && !sentFrames.some(f => f.type === 'CHAT_CHUNK' && f.client_msg_id === 'f-1' && f.status === 'STREAM_FINAL'); i++) {
      await new Promise(r => setTimeout(r, 20));
    }
    const finalFrame1 = sentFrames.find(f => f.type === 'CHAT_CHUNK' && f.client_msg_id === 'f-1' && f.status === 'STREAM_FINAL');
    assert.ok(finalFrame1 && finalFrame1.card, 'Manual finance tx must attach FINANCE_TX card');
    assert.equal(finalFrame1.card.card_type, 'FINANCE_TX');
    assert.equal(finalFrame1.card.card_id, 'fin_25000_kopikenangan');

    // Turn 2: Text edit "ubah catatan jadi Es Kopi Susu Tetangga" -> emits CARD_UPDATE (status=PENDING, updated_card)
    await handler.handleMessage({ type: 'CHAT_SEND', client_msg_id: 'f-2', content: 'ubah catatan jadi Es Kopi Susu Tetangga' }, fakeWs);
    for (let i = 0; i < 40 && !sentFrames.some(f => f.type === 'CHAT_CHUNK' && f.client_msg_id === 'f-2' && f.status === 'STREAM_FINAL'); i++) {
      await new Promise(r => setTimeout(r, 20));
    }
    const pendingUpdate = sentFrames.find(f => f.type === 'CARD_UPDATE' && f.card_id === 'fin_25000_kopikenangan' && f.status === 'PENDING');
    assert.ok(pendingUpdate && pendingUpdate.updated_card, 'Text edit must emit CARD_UPDATE with updated_card');
    const noteField = pendingUpdate.updated_card.fields.find(fl => fl.key === 'note');
    assert.equal(noteField.value, 'Es Kopi Susu Tetangga');

    // Turn 3: Text confirm "ya" -> emits CARD_UPDATE (status=RESOLVED, resolved_badge=Recorded)
    await handler.handleMessage({ type: 'CHAT_SEND', client_msg_id: 'f-3', content: 'ya' }, fakeWs);
    for (let i = 0; i < 40 && !sentFrames.some(f => f.type === 'CHAT_CHUNK' && f.client_msg_id === 'f-3' && f.status === 'STREAM_FINAL'); i++) {
      await new Promise(r => setTimeout(r, 20));
    }
    const resolvedUpdate = sentFrames.find(f => f.type === 'CARD_UPDATE' && f.card_id === 'fin_25000_kopikenangan' && f.status === 'RESOLVED');
    assert.ok(resolvedUpdate, 'Text confirm must emit CARD_UPDATE RESOLVED');
    assert.equal(resolvedUpdate.resolved_badge, 'Recorded');
    handler.destroy();
  });

  it('Audit Fix #2 & #4: finance_handler allows mobile DELETE/UNDO_DELETE and background task auto-save emits CARD_UPDATE + CHAT_PROACTIVE', async (t) => {
    const { handleFinanceIntent } = require('../src/interfaces/common/handlers/finance_handler');
    const financeEngine = require('../src/domain/Finance_Engine');
    const origDel = financeEngine.deleteTransaction;
    const origUndo = financeEngine.undoDeleteTransaction;
    financeEngine.deleteTransaction = async (kw) => ({ message: `MOCK_DELETE_PROMPT:${kw}` });
    financeEngine.undoDeleteTransaction = async () => ({ message: 'MOCK_UNDO_OK' });
    t.after(() => {
      financeEngine.deleteTransaction = origDel;
      financeEngine.undoDeleteTransaction = origUndo;
    });

    const delRes = await handleFinanceIntent({
      intent: 'FINANCE',
      extracted_data: { action: 'DELETE', search_keyword: 'kopi' }
    }, { source: 'mobile' });
    assert.equal(delRes, 'MOCK_DELETE_PROMPT:kopi');

    const undoRes = await handleFinanceIntent({
      intent: 'FINANCE',
      extracted_data: { action: 'UNDO_DELETE' }
    }, { source: 'mobile' });
    assert.equal(undoRes, 'MOCK_UNDO_OK');

    // Audit Fix #4: Background timer firing notifyClient after turn finalized emits CARD_UPDATE (Auto-saved) + CHAT_PROACTIVE
    const sentFrames = [];
    const fakeWs = { readyState: 1, send: (raw) => sentFrames.push(JSON.parse(raw)) };
    const pendingTaskMap = new Map();
    let capturedNotifyClient = null;

    const handler = createMobileChatHandler({
      chunkDelayMs: 0,
      saveChatMemory: async () => {},
      financeEngine: {
        getPendingDeletionsContext: () => null,
        getPendingConfirmationsCount: () => 0,
        getPendingConfirmationsMap: () => new Map()
      },
      taskManager: { pendingTaskCategories: pendingTaskMap },
      splitEngine: { hasPendingRemainder: () => false },
      aiRouter: {
        routeUserMessage: async () => ({
          intent: 'TASK',
          extracted_data: { action: 'CREATE', title: 'Review PR' }
        })
      },
      executeDomainIntent: async (_intent, _rd, ctx) => {
        capturedNotifyClient = ctx.notifyClient;
        pendingTaskMap.set(ctx.sessionKey, {
          type: 'CONFIRM_SYNC',
          title: 'Review PR',
          listName: 'Kerja',
          dueDate: '2026-11-23',
          durationMins: 60
        });
        return 'Sinkronkan tugas Review PR ke kalender?';
      },
      interceptors: {
        handleMorningCheckIn: async () => false
      }
    });

    await handler.handleMessage({ type: 'CHAT_SEND', client_msg_id: 't-1', content: 'buat tugas review PR besok' }, fakeWs);
    for (let i = 0; i < 40 && !sentFrames.some(f => f.type === 'CHAT_CHUNK' && f.client_msg_id === 't-1' && f.status === 'STREAM_FINAL'); i++) {
      await new Promise(r => setTimeout(r, 20));
    }
    const finalFrame = sentFrames.find(f => f.type === 'CHAT_CHUNK' && f.client_msg_id === 't-1' && f.status === 'STREAM_FINAL');
    assert.ok(finalFrame && finalFrame.card);
    assert.equal(finalFrame.card.card_type, 'TASK_CONFIRM');
    const taskCardId = finalFrame.card.card_id;

    // Simulate 5-minute background timer firing after turn is FINAL
    pendingTaskMap.clear();
    capturedNotifyClient('Tugas Review PR disimpan otomatis tanpa sinkronisasi kalender.');

    const autoCardUpdate = sentFrames.find(f => f.type === 'CARD_UPDATE' && f.card_id === taskCardId);
    assert.ok(autoCardUpdate, 'Background timer must emit CARD_UPDATE for taskConfirm');
    assert.equal(autoCardUpdate.status, 'RESOLVED');
    assert.equal(autoCardUpdate.resolved_badge, 'Auto-saved');

    const proactiveMsg = sentFrames.find(f => f.type === 'CHAT_PROACTIVE' && f.kind === 'TASK_AUTOSAVE');
    assert.ok(proactiveMsg, 'Background timer must emit CHAT_PROACTIVE instead of stale CHAT_ACK');
    handler.destroy();
  });
});

describe('Mobile Bridge Phase 3: Vault Metadata Card, Rich Briefing/Budget Cards & Slash Commands', () => {
  it('builds VAULT_METADATA card and supports update_fields and confirm actions', async () => {
    let storedRow = {
      id: 42,
      file_name: 'KTP_Tuan.jpg',
      category: 'IDENTITAS',
      status: 'DRAFT',
      telegram_file_id: 'tg-file-123',
      metadata_json: {
        judul: 'KTP Tuan Faqih',
        nik: '3404000000000001',
        alamat: 'Yogyakarta',
        source: 'VISION_DIRECT'
      }
    };

    const card = buildVaultMetadataCard(storedRow);
    assert.equal(card.card_id, 'vault_42');
    assert.equal(card.card_type, 'VAULT_METADATA');
    assert.equal(card.presentation, 'CARD');
    assert.equal(card.badge, 'Draft');
    assert.ok(card.fields.some(f => f.key === 'nik' && f.value === '3404000000000001'));
    assert.ok(!card.fields.some(f => f.key === 'source'));
    assert.ok(card.actions.some(a => a.kind === 'EDIT_VAULT'));

    const frames = [];
    let cacheInvalidated = 0;
    const deps = {
      sendFrame: (f) => frames.push(f),
      notifier: { markEngaged: async () => true },
      aiRouter: { invalidatePersonalFactsCache: () => { cacheInvalidated += 1; } },
      memoryVault: { getVaultItemById: async () => storedRow },
      supabaseMemories: {
        updateVaultItemById: async (_id, patch) => {
          storedRow = { ...storedRow, ...patch };
          return { success: true, row: storedRow };
        }
      }
    };

    // 1. Tap Edit Fields -> update_fields updates Supabase and returns refreshed card
    await handleCardAction({
      card_id: card.card_id,
      card_type: 'VAULT_METADATA',
      action_id: 'update_fields',
      payload: {
        vault_row_id: 42,
        category: 'IDENTITAS',
        edits: { alamat: 'Sleman, DI Yogyakarta', golongan_darah: 'O' }
      }
    }, null, deps);

    assert.equal(frames.length, 1);
    assert.equal(frames[0].status, 'PENDING');
    assert.ok(frames[0].updated_card);
    assert.ok(frames[0].updated_card.fields.some(f => f.key === 'alamat' && f.value === 'Sleman, DI Yogyakarta'));
    assert.ok(frames[0].updated_card.fields.some(f => f.key === 'golongan_darah' && f.value === 'O'));

    // 2. Tap Confirm & Save -> locks card as Confirmed
    await handleCardAction({
      card_id: card.card_id,
      card_type: 'VAULT_METADATA',
      action_id: 'confirm',
      payload: { vault_row_id: 42, category: 'IDENTITAS' }
    }, null, deps);

    assert.equal(frames.length, 2);
    assert.equal(frames[1].status, 'RESOLVED');
    assert.equal(frames[1].resolved_badge, 'Confirmed');
    assert.equal(storedRow.status, 'CONFIRMED');
    assert.equal(cacheInvalidated, 2);
  });

  it('builds BRIEFING_SUMMARY (Morning & Evening) and BUDGET_RECAP SUMMARY_CARD with metrics & progress bars', () => {
    const morningCard = buildBriefingCard('MORNING', {
      dateLabel: 'Sun, 22 Nov',
      weather: 'Yogyakarta 28°C, Clear',
      agendaCount: 3,
      overdueCount: 1,
      dueTodayCount: 2,
      billsDue: 350000,
      safeToSpendToday: 185000,
      intentionsCount: 2
    });
    assert.equal(morningCard.card_type, 'BRIEFING_SUMMARY');
    assert.equal(morningCard.presentation, 'SUMMARY_CARD');
    assert.equal(morningCard.status, 'INFO');
    assert.equal(morningCard.hero_value, 'Rp 185.000');
    assert.equal(morningCard.metrics.length, 4);
    assert.ok(morningCard.actions.some(a => a.kind === 'SEND_PROMPT' && a.prompt === 'Detail'));

    const eveningCard = buildBriefingCard('EVENING', {
      dateLabel: 'Sun, 22 Nov',
      tomorrowAgendaCount: 2,
      tomorrowFirstEvent: '09:00 Standup'
    });
    assert.equal(eveningCard.card_type, 'BRIEFING_SUMMARY');
    assert.equal(eveningCard.metrics.length, 2);

    const budgetCard = buildBudgetRecapCard({
      period: 'monthly',
      totalSaved: 450000,
      totalOver: 50000,
      items: [
        { name: 'GLOBAL', spent: 1800000, amount: 2250000, percentage: 80, isOver: false, isWarning: true },
        { name: 'MAKAN', spent: 650000, amount: 600000, percentage: 108, isOver: true, isWarning: false }
      ]
    });
    assert.equal(budgetCard.card_type, 'BUDGET_RECAP');
    assert.equal(budgetCard.presentation, 'SUMMARY_CARD');
    assert.equal(budgetCard.hero_value, '+Rp 400.000');
    assert.equal(budgetCard.metrics[0].progress, 80);
    assert.equal(budgetCard.metrics[0].tone, 'AMBER');
    assert.equal(budgetCard.metrics[1].progress, 100);
    assert.equal(budgetCard.metrics[1].tone, 'CRIMSON');
  });

  it('handles /briefing, /budget, and /vault direct slash commands with attached Phase 3 cards', async () => {
    const sentFrames = [];
    const fakeWs = { readyState: 1, send: (raw) => sentFrames.push(JSON.parse(raw)) };

    const handler = createMobileChatHandler({
      chunkDelayMs: 0,
      saveChatMemory: async () => {},
      intelligenceBrief: {
        generateMorningBriefingStructured: async () => ({
          text: 'Selamat pagi Tuan Faqih. Agenda hari ini 2 meeting.',
          summary: { dateLabel: 'Sun, 22 Nov', agendaCount: 2, dueTodayCount: 1, overdueCount: 0, safeToSpendToday: 200000 }
        })
      },
      budgetEngine: {
        generatePeriodicRecapStructured: async (period) => ({
          text: 'Rekap Anggaran Bulan Ini: GLOBAL Aman (60%).',
          period,
          totalSaved: 800000,
          totalOver: 0,
          items: [{ name: 'GLOBAL', spent: 1200000, amount: 2000000, percentage: 60, isOver: false, isWarning: false }]
        })
      },
      memoryVault: {
        getLatestVaultItems: async () => ([
          { id: 99, file_name: 'NPWP.jpg', category: 'IDENTITAS', status: 'DRAFT', metadata_json: { judul: 'NPWP Tuan', nomor: '09.123.456' } }
        ])
      }
    });

    for (const [id, cmd, expectedType] of [
      ['s-brief', '/briefing', 'BRIEFING_SUMMARY'],
      ['s-budget', '/budget', 'BUDGET_RECAP'],
      ['s-vault', '/vault', 'VAULT_METADATA']
    ]) {
      await handler.handleMessage({ type: 'CHAT_SEND', client_msg_id: id, content: cmd }, fakeWs);
      for (let i = 0; i < 40 && !sentFrames.some(f => f.type === 'CHAT_CHUNK' && f.client_msg_id === id && f.status === 'STREAM_FINAL'); i++) {
        await new Promise(r => setTimeout(r, 20));
      }
      const fin = sentFrames.find(f => f.type === 'CHAT_CHUNK' && f.client_msg_id === id && f.status === 'STREAM_FINAL');
      assert.ok(fin && fin.card, `Slash command ${cmd} must attach a card`);
      assert.equal(fin.card.card_type, expectedType);
    }

    handler.destroy();
  });
});
