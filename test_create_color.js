const { createCalendarEvent } = require('./src/infrastructure/Google_Workspace');

async function test() {
  console.log('Creating test event...');
  const start = new Date(Date.now() + 3600000).toISOString();
  const end = new Date(Date.now() + 7200000).toISOString();
  const res = await createCalendarEvent('TEST COLOR 11', start, end, '', '', [], '', '11');
  console.log('Created:', res.htmlLink, 'Color:', res.colorId);
}

test();
