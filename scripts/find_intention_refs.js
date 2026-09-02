const fs = require('fs');
const path = require('path');

function searchTable(dir, table) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        searchTable(fullPath, table);
      }
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(table)) {
        console.log(`Found ${table} in: ${fullPath}`);
      }
    }
  }
}

searchTable(path.join(__dirname, '../src'), 'nexa_pending_intentions');
