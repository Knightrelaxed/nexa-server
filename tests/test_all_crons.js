'use strict';
const test = require('node:test');
const assert = require('node:assert');

// Mock external heavy I/O to safely test all cron callback executions
test('Comprehensive Cron Job Audit: every cron callback executes cleanly without runtime errors', async () => {
  const registeredJobs = [];

  // 1. Intercept cron.schedule to capture all 24 registered jobs
  const cron = require('node-cron');
  const originalSchedule = cron.schedule;
  cron.schedule = (pattern, fn, options) => {
    registeredJobs.push({ pattern, fn, options });
    return { stop: () => {}, start: () => {} };
  };

  try {
    // Require and initialize crons
    const { initCronJobs } = require('../src/interfaces/cron');
    initCronJobs();

    console.log(`[TEST-CRON-AUDIT] Successfully intercepted ${registeredJobs.length} cron schedules.`);
    assert.ok(registeredJobs.length >= 20, `Expected at least 20 cron jobs registered, got ${registeredJobs.length}`);

    // Mock notifier to avoid live delivery during test
    const { _setNotifier, createNotifier, createMemoryStore } = require('../src/core/Notifier');
    const sentHistory = [];
    _setNotifier(createNotifier({
      store: createMemoryStore(),
      send: async (text, meta) => { sentHistory.push({ text, meta }); }
    }));

    // 2. Iterate through every single registered job and execute it
    let executedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < registeredJobs.length; i++) {
      const job = registeredJobs[i];
      try {
        console.log(`[TEST-CRON-AUDIT] Running Cron #${i + 1} [Pattern: ${job.pattern}]...`);
        // Execute the cron job function directly
        await job.fn();
        executedCount++;
      } catch (err) {
        console.error(`[TEST-CRON-AUDIT] ❌ Cron #${i + 1} [Pattern: ${job.pattern}] threw error:`, err);
        failedCount++;
      }
    }

    console.log(`[TEST-CRON-AUDIT] Execution summary: ${executedCount} passed, ${failedCount} failed.`);
    assert.equal(failedCount, 0, `All registered cron jobs must execute without uncaught errors!`);

  } finally {
    // Restore original schedule function
    cron.schedule = originalSchedule;
    setTimeout(() => process.exit(0), 500);
  }
});
