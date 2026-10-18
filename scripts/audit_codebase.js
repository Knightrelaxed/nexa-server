'use strict';

const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '.next') {
        results = results.concat(walk(fullPath));
      }
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = walk('src');

console.log('Auditing ' + files.length + ' JS files in src/ ...\n');

// 1. Check for hardcoded version strings inside actual string literals (excluding comments)
const stringLiteralRegex = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
const versionInCode = [];

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    // Strip comments
    const codeOnly = line.replace(/\/\/.*$/, '').trim();
    if (!codeOnly || codeOnly.startsWith('*') || codeOnly.startsWith('/*')) return;
    
    let match;
    const strRegex = new RegExp(stringLiteralRegex.source, 'g');
    while ((match = strRegex.exec(codeOnly)) !== null) {
      const strVal = match[2];
      if (/v?3\.[0-9]+(?:\.[0-9]+)?/i.test(strVal)) {
        if (/llama|gemini|qwen|python3|3\.600\.000/i.test(strVal)) continue;
        versionInCode.push({
          file: f,
          line: idx + 1,
          literal: match[0],
          code: codeOnly
        });
      }
    }
  });
}

console.log('=== 1. HARDCODED VERSION STRINGS INSIDE STRING LITERALS ===');
if (versionInCode.length === 0) {
  console.log('None found! (100% Clean)');
} else {
  versionInCode.forEach(v => {
    console.log(`${v.file}:${v.line} -> Literal: ${v.literal} in code: ${v.code}`);
  });
}

// 2. Check for require('../package.json').version in src
console.log('\n=== 2. DIRECT package.json.version REQUIRES IN SRC ===');
const pkgVersionRequires = [];
for (const f of files) {
  // Exclude version.js itself
  if (f.endsWith('version.js')) continue;
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('package.json') && content.includes('.version')) {
    pkgVersionRequires.push(f);
  }
}
if (pkgVersionRequires.length === 0) {
  console.log('None found! (All clean, centralized in version.js)');
} else {
  pkgVersionRequires.forEach(f => console.log('Found in: ' + f));
}

// 3. Syntax & Require validity check across all src files
console.log('\n=== 3. SYNTAX & MODULE IMPORT INTEGRITY CHECK ===');
let loadErrors = 0;
for (const f of files) {
  try {
    // Only test require for non-entrypoint/non-daemon files or test syntax via vm.compileFunction
    const code = fs.readFileSync(f, 'utf8');
    const vm = require('vm');
    new vm.Script(code, { filename: f });
  } catch (err) {
    console.error(`Syntax error in ${f}: ${err.message}`);
    loadErrors++;
  }
}
if (loadErrors === 0) {
  console.log(`All ${files.length} files passed syntax compilation!`);
}

// 4. Check for broken relative requires
console.log('\n=== 4. RELATIVE REQUIRE RESOLUTION CHECK ===');
let brokenRequires = 0;
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const requireRegex = /require\(['"](\.[^'"]+)['"]\)/g;
  let match;
  while ((match = requireRegex.exec(content)) !== null) {
    const relPath = match[1];
    const dir = path.dirname(f);
    let resolved = null;
    const extensions = ['', '.js', '.json'];
    for (const ext of extensions) {
      const candidate = path.resolve(dir, relPath + ext);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        resolved = candidate;
        break;
      }
      const indexCandidate = path.resolve(dir, relPath, 'index.js');
      if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
        resolved = indexCandidate;
        break;
      }
    }
    if (!resolved) {
      console.error(`BROKEN REQUIRE in ${f}: cannot resolve "${relPath}"`);
      brokenRequires++;
    }
  }
}
if (brokenRequires === 0) {
  console.log('All relative requires resolve cleanly to existing files!');
}
