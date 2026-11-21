'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFinanceTxCard,
  buildRecurringBillCard,
  buildIdentityProposalCard,
  buildMemoryHygieneCard,
  buildDisciplineCheckCard,
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
