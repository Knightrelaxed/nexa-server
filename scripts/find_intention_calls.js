const fs = require('fs');
const path = require('path');

function searchCall(dir, func) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        searchCall(fullPath, func);
      }
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(func)) {
        console.log(`Found ${func} in: ${fullPath}`);
      }
    }
  }
}

searchCall(path.join(__dirname, '../src'), 'detectAndSaveIntention');
