const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../docs/NEXA_Whitepaper.md');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace all Em-dashes (\u2014) and En-dashes (\u2013)
// We will replace with appropriate separators (commas, colons, parentheses, or hyphens)
content = content.replace(/\s*\u2014\s*/g, ' : ');
content = content.replace(/\u2014/g, ' - ');
content = content.replace(/\s*\u2013\s*/g, ' - ');
content = content.replace(/\u2013/g, '-');

// Clean up any double colons or strange artifacts
content = content.replace(/:\s*:/g, ':');
content = content.replace(/-\s*-/g, '-');

console.log('Cleaned em-dashes and en-dashes.');
console.log('Remaining em-dashes:', (content.match(/\u2014/g) || []).length);
console.log('Remaining en-dashes:', (content.match(/\u2013/g) || []).length);

fs.writeFileSync(filePath, content, 'utf8');
