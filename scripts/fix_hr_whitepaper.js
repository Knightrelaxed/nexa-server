const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../docs/NEXA_Whitepaper.md');
let content = fs.readFileSync(filePath, 'utf8');

// Fix horizontal rules: lines that are just '--' or '-' should be '---'
content = content.split('\n').map(line => {
  if (line.trim() === '--' || line.trim() === '-') {
    return '---';
  }
  return line;
}).join('\n');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed markdown horizontal rules to ---');
