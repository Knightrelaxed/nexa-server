const aiRouter = require('./src/core/AI_Router');

async function test() {
  const result = await aiRouter.routeUserMessage("1 jam aja", {
    lastAssistantReply: "❓ Kira-kira berapa lama durasi untuk 'Ngopi di Taman' ini, Tuan?"
  });
  console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error);
