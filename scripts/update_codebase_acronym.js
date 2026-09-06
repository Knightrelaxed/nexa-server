const fs = require('fs');
const path = require('path');

const OLD_NAME = 'Neural Extension Assistant for Intelligence';
const NEW_NAME = 'Neural Executive with Xenial Agent';

const filesToUpdate = [
  'src/core/Live_Voice_Engine.js',
  'tests/duel_gemma_31b_vs_26b.js',
  'README.md',
  'docs/NEXA_Whitepaper.md',
  'docs/NEXA_VERSION_EVOLUTION_ROADMAP.md',
  'docs/NEXA_v2.7_EVOLUTION_ROADMAP.md',
  'docs/NEXA_SECURITY_ARCHITECTURE_AND_HARDENING.md',
  'docs/nexa_core_identity_dump_231.json'
];

let totalReplacements = 0;

for (const relPath of filesToUpdate) {
  const fullPath = path.join(__dirname, '../', relPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`File not found: ${relPath}`);
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  if (content.includes(OLD_NAME)) {
    const count = (content.match(new RegExp(OLD_NAME, 'g')) || []).length;
    const updated = content.replace(new RegExp(OLD_NAME, 'g'), NEW_NAME);
    fs.writeFileSync(fullPath, updated, 'utf8');
    totalReplacements += count;
    console.log(`✅ Updated ${relPath} (${count} replacements)`);
  } else {
    console.log(`ℹ️ No match in ${relPath}`);
  }
}

console.log(`\n=== Total files updated: ${filesToUpdate.length}, Total replacements: ${totalReplacements} ===`);
