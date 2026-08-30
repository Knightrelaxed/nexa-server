const fs = require('fs');
const path = require('path');

function findPromptPhases(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        findPromptPhases(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (/\[.*phase.*\]/i.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
          console.log(`${fullPath}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
  }
}

findPromptPhases(path.join(__dirname, '../src'));
