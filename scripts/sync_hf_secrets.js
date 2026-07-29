const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');

/**
 * Automatically sync all local .env secrets to a Hugging Face Space
 * Usage: node scripts/sync_hf_secrets.js <space_id> <hf_write_token>
 * Example: node scripts/sync_hf_secrets.js nexa-asistant/NEXA-Core-Server hf_xxx
 */
async function syncSecrets() {
  const spaceId = process.argv[2] || 'nexa-asistant/NEXA-Core-Server';
  const envPath = path.join(__dirname, '..', '.env');

  if (!fs.existsSync(envPath)) {
    console.error('❌ File .env tidak ditemukan!');
    process.exit(1);
  }

  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  const token = process.argv[3] || envConfig.HF_TOKEN || envConfig.HF_INFERENCE_TOKEN;

  if (!token) {
    console.error('❌ Token Hugging Face (Write Access) tidak ditemukan!');
    process.exit(1);
  }

  console.log(`🚀 Memulai sinkronisasi ${Object.keys(envConfig).length} secrets ke HF Space: ${spaceId}...`);

  let successCount = 0;
  let failCount = 0;

  for (const [key, value] of Object.entries(envConfig)) {
    if (!value || value.trim() === '') continue;

    try {
      // POST secret to Hugging Face API
      await axios.post(
        `https://huggingface.co/api/spaces/${spaceId}/secrets`,
        { key: key, val: value.trim() },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      console.log(` ✅ Secret [${key}] berhasil di-upload.`);
      successCount++;
    } catch (err) {
      console.warn(` ⚠️ Secret [${key}] gagal: ${err.response?.data?.error || err.message}`);
      failCount++;
    }
  }

  console.log(`\n🎉 Selesai! ${successCount} secrets sukses di-upload, ${failCount} gagal.`);
}

syncSecrets();
