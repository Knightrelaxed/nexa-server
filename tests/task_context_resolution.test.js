'use strict';
/**
 * tests/task_context_resolution.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit Tests for Contextual & Temporal Task Resolution + Synthesis Disabling
 * 
 * Memastikan:
 * 1. Frasa alami seperti "dua tugas tadi" otomatis memetakan ke tugas aktif hari ini.
 * 2. Frasa "yang deadline hari ini" / "tugas hari ini" memfilter tugas yang due hari ini.
 * 3. Frasa ordinal "pertama dan kedua" / "tugas 1 dan 2" mengeksekusi multi-tugas.
 * 4. Conversational synthesis dinonaktifkan sehingga tidak ada balapan pesan susulan.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const test = require('node:test');
const assert = require('node:assert');

const taskManager = require('../src/domain/Task_Manager');
const googleTasks = require('../src/infrastructure/Google_Tasks');

test('Task_Manager: Contextual & Temporal Task Resolution', async (t) => {
  const todayWIB = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const tomorrowWIB = new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

  const mockTasks = [
    {
      index: 1,
      id: 'task-vo-1',
      title: 'membuat voice over untuk Bahasa Arab Lisan',
      listId: '@default',
      due: `${todayWIB}T00:00:00.000Z`
    },
    {
      index: 2,
      id: 'task-esai-2',
      title: 'esai untuk Bahasa Arab Tulis',
      listId: '@default',
      due: `${todayWIB}T00:00:00.000Z`
    },
    {
      index: 3,
      id: 'task-carousel-3',
      title: 'Membuat desain Carousel untuk feed latansa',
      listId: '@default',
      due: `${tomorrowWIB}T00:00:00.000Z`
    }
  ];

  taskManager.setLastRenderedTasks(mockTasks);

  await t.test('"dua tugas tadi" resolves to the 2 tasks due today', async () => {
    const resolved = await taskManager._resolveContextualTasks('dua tugas tadi');
    assert.ok(resolved, 'Expected resolved list not to be null');
    assert.strictEqual(resolved.length, 2);
    assert.strictEqual(resolved[0].id, 'task-vo-1');
    assert.strictEqual(resolved[1].id, 'task-esai-2');
  });

  await t.test('"nah yang deadline hari ini sudah ku selsaikan" resolves to today tasks', async () => {
    const resolved = await taskManager._resolveContextualTasks('nah yang deadline hari ini sudah ku selsaikan');
    assert.ok(resolved, 'Expected resolved list not to be null');
    assert.strictEqual(resolved.length, 2);
    assert.strictEqual(resolved[0].title, 'membuat voice over untuk Bahasa Arab Lisan');
    assert.strictEqual(resolved[1].title, 'esai untuk Bahasa Arab Tulis');
  });

  await t.test('"semua tugas hari ini" resolves to all today tasks', async () => {
    const resolved = await taskManager._resolveContextualTasks('semua tugas hari ini');
    assert.ok(resolved);
    assert.strictEqual(resolved.length, 2);
  });

  await t.test('"tugas 1 dan 2" resolves via ordinal index parser', async () => {
    const resolved = await taskManager._resolveTargetTasks('tugas 1 dan 2');
    assert.ok(resolved);
    assert.strictEqual(resolved.length, 2);
    assert.strictEqual(resolved[0].id, 'task-vo-1');
    assert.strictEqual(resolved[1].id, 'task-esai-2');
  });

  await t.test('"pertama dan kedua" resolves via word ordinals', async () => {
    const resolved = await taskManager._resolveTargetTasks('pertama dan kedua');
    assert.ok(resolved);
    assert.strictEqual(resolved.length, 2);
    assert.strictEqual(resolved[0].id, 'task-vo-1');
    assert.strictEqual(resolved[1].id, 'task-esai-2');
  });

  await t.test('action COMPLETE with contextual target marks both tasks done', async () => {
    const completedIds = [];
    const origComplete = googleTasks.completeTask;
    googleTasks.completeTask = async (id) => {
      completedIds.push(id);
      return { id };
    };

    try {
      taskManager.setLastRenderedTasks(mockTasks);
      const res = await taskManager.handleTaskIntent({
        action: 'COMPLETE',
        search_keyword: 'dua tugas tadi'
      }, 'chat-123');

      assert.strictEqual(res.status, 'SUCCESS');
      assert.ok(res.message.includes('2 Tugas Berhasil Ditandai Selesai'));
      assert.ok(res.message.includes('membuat voice over untuk Bahasa Arab Lisan'));
      assert.ok(res.message.includes('esai untuk Bahasa Arab Tulis'));
      assert.deepStrictEqual(completedIds, ['task-vo-1', 'task-esai-2']);
    } finally {
      googleTasks.completeTask = origComplete;
    }
  });
});

test('Telegram Interceptors: Conversational Synthesis is disabled', () => {
  const { triggerConversationalSynthesis } = require('../src/interfaces/telegram/interceptors');
  assert.strictEqual(typeof triggerConversationalSynthesis, 'function');
  // Must execute safely and return immediately without throwing or triggering async timers
  assert.doesNotThrow(() => {
    triggerConversationalSynthesis('halo', 'result', 'READ', 'session-1');
  });
});
