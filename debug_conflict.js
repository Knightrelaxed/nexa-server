const { checkCalendarConflicts, getTodaysEvents } = require('./src/infrastructure/Google_Workspace');

async function test() {
  const start = "2026-05-14T14:00:00+07:00";
  const end = "2026-05-14T16:00:00+07:00";
  
  const conflicts = await checkCalendarConflicts(start, end);
  console.log("Conflicts found:", conflicts.length);
  console.log(JSON.stringify(conflicts, null, 2));
}

test().catch(console.error);
