const fs = require('fs');
const file = 'src/interfaces/webhook.js';
let content = fs.readFileSync(file, 'utf8');

const original = content;

// Remove saveChatMemory('user', textInput)
content = content.replace(/^[ \t]*await supabaseMemories\.saveChatMemory\('user', textInput\);\r?\n/gm, '');

// Remove saveChatMemory('faqih', textInput)
content = content.replace(/^[ \t]*await supabaseMemories\.saveChatMemory\('faqih', textInput\)\.catch\(\(\) => \{ ?\}\);\r?\n/gm, '');

// Remove saveChatMemory('nexa', ...) where it's for draft updates or system messages that duplicate or clutter
content = content.replace(/^[ \t]*await supabaseMemories\.saveChatMemory\('nexa', .*\r?\n/gm, (match) => {
  if (match.includes('String(text)')) return match; // Keep the core ones
  return '';
});

// Remove saveChatMemory('user', \[SISTEM...)
content = content.replace(/^[ \t]*await supabaseMemories\.saveChatMemory\('user', .*\r?\n/gm, (match) => {
  if (match.includes('rawInputStr')) return match; // Keep the one we added!
  return '';
});

fs.writeFileSync(file, content);
console.log('webhook.js replaced. Changed:', original !== content);

// Also fix Finance_Engine.js
const feFile = 'src/domain/Finance_Engine.js';
let feContent = fs.readFileSync(feFile, 'utf8');
const feOriginal = feContent;
feContent = feContent.replace(/^[ \t]*try \{ await supabase\.saveChatMemory\('assistant'.*\r?\n/gm, '');
fs.writeFileSync(feFile, feContent);
console.log('Finance_Engine.js replaced. Changed:', feOriginal !== feContent);

// Also fix AI_Router.js
const aiFile = 'src/core/AI_Router.js';
let aiContent = fs.readFileSync(aiFile, 'utf8');
const aiOriginal = aiContent;
aiContent = aiContent.replace(/^[ \t]*await supabaseMemories\.saveChatMemory\('user', textInput\);\r?\n/gm, '');
fs.writeFileSync(aiFile, aiContent);
console.log('AI_Router.js replaced. Changed:', aiOriginal !== aiContent);
