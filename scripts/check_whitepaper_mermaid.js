const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../docs/NEXA_Whitepaper.md');
const content = fs.readFileSync(filePath, 'utf8');

const mermaidMatches = content.match(/```mermaid[\s\S]*?```/g) || [];
console.log(`Found ${mermaidMatches.length} mermaid diagrams in Whitepaper.`);

mermaidMatches.forEach((m, idx) => {
  const firstLine = m.split('\n')[1] || '';
  console.log(`Diagram ${idx + 1}: ${firstLine.trim()}`);
});
