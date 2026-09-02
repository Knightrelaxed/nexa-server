const fs = require('fs');
const path = require('path');

function searchCode(dir, query) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        searchCode(fullPath, query);
      }
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(query) || content.toLowerCase().includes(query.toLowerCase())) {
        console.log(`Found in: ${fullPath}`);
      }
    }
  }
}

searchCode(path.join(__dirname, '../src'), 'Kilas Balik');
