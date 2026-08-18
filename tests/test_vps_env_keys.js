const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../.env');
const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf-8'));

console.log('=== CHECKING API KEYS IN .env ===');
const checkKeys = [
  'GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY_4', 'GEMINI_API_KEY',
  'CEREBRAS_API_KEY_1', 'CEREBRAS_API_KEY_2', 'CEREBRAS_API_KEY_3', 'CEREBRAS_API_KEY_4',
  'MISTRAL_API_KEY', 'PUTER_AUTH_TOKEN', 'OPENROUTER_API_KEY', 'HF_INFERENCE_TOKEN'
];

checkKeys.forEach(k => {
  const val = parsed[k];
  if (val) {
    console.log(` - ${k}: Present (len: ${val.length}, prefix: ${val.substring(0, 5)}...)`);
  } else {
    console.log(` - ${k}: [NOT SET / EMPTY]`);
  }
});
