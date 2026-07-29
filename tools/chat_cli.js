#!/usr/bin/env node
/**
 * N.E.X.A — UNIVERSAL REMOTE CLI CLIENT
 * 
 * Script sangat ringan ini berjalan di laptop pengguna (Client).
 * TIDAK memuat AI_Router, Supabase, atau API Keys sama sekali.
 * Hanya membaca input keyboard dan mengirim HTTP POST ke N.E.X.A Server (HF Space).
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.nexa-cli-config.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let config = {
  server_url: '',
  secret_key: ''
};

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      config = JSON.parse(data);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

async function setupWizard() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('       🤖 N.E.X.A — Universal Terminal CLI Setup');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('⚙️  Konfigurasi belum ditemukan di laptop ini.\n');

  rl.question('🔗 Masukkan NEXA Server URL (contoh: https://namaspace.hf.space): ', (url) => {
    config.server_url = url.trim().replace(/\/$/, '');
    
    rl.question('🔐 Masukkan Secret Key (NEXA_GODMODE_SECRET): ', (secret) => {
      config.secret_key = secret.trim();
      
      saveConfig();
      console.log('\n✅ Konfigurasi berhasil disimpan di ~/.nexa-cli-config.json');
      console.log('===========================================================\n');
      startChat();
    });
  });
}

async function sendMessageToServer(text) {
  const endpoint = `${config.server_url}/webhook/cli`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.secret_key}`
      },
      body: JSON.stringify({
        message: text,
        session_id: 'cli-terminal-default'
      })
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Autentikasi gagal (Secret Key salah).');
      }
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    throw error;
  }
}

function startChat() {
  console.log('===========================================================');
  console.log('🤖 N.E.X.A TERMINAL INTERACTIVE CHAT (REMOTE MODE)');
  console.log(`🌐 Terhubung ke: ${config.server_url}`);
  console.log('===========================================================');
  console.log('Ketik pesan Anda dan tekan Enter untuk berbicara langsung dengan N.E.X.A.');
  console.log('Ketik "exit" atau "keluar" untuk mengakhiri sesi obrolan.\n');

  function askQuestion() {
    rl.question('👤 Tuan Faqih: ', async (userText) => {
      const input = userText.trim();
      if (!input) {
        askQuestion();
        return;
      }
      if (['exit', 'keluar', 'q', 'quit'].includes(input.toLowerCase())) {
        console.log('\n👋 N.E.X.A: Sampai jumpa kembali, Tuan Faqih!');
        rl.close();
        return;
      }

      try {
        const responseData = await sendMessageToServer(input);
        
        if (responseData.ok) {
           console.log(`\n🤖 N.E.X.A (${responseData.elapsed_ms}ms) [${responseData.intent}]:\n${responseData.reply}\n`);
        } else {
           console.log(`\n❌ Error dari Server:\n${responseData.error || responseData.reply}\n`);
        }
      } catch (e) {
        console.error(`\n❌ Gagal Menghubungi Server: ${e.message}\nPastikan Server HF menyala dan URL sudah benar.\n`);
      }
      askQuestion();
    });
  }

  askQuestion();
}

// MAIN EXECUTION
if (loadConfig() && config.server_url && config.secret_key) {
  startChat();
} else {
  setupWizard();
}
