const fs = require('fs');
const path = require('path');

function searchDocs(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('Stated-vs-Revealed') || content.includes('Intention') || content.includes('Gentle Friction')) {
        console.log(`Matched in doc: ${entry.name}`);
      }
    }
  }
}

searchDocs(path.join(__dirname, '../docs'));
