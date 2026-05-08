const { google } = require('googleapis');
const http = require('http');
const url = require('url');

// Pakai Client ID & Secret yang SAMA dengan Gmail
const CLIENT_ID = process.env.GMAIL_CLIENT_ID || 'PASTE_YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || 'PASTE_YOUR_CLIENT_SECRET_HERE';
const REDIRECT_URI = 'http://localhost:3001/oauth2callback'; // Port 3001 agar tidak bentrok

require('dotenv').config();
const actualClientId = process.env.GMAIL_CLIENT_ID || CLIENT_ID;
const actualClientSecret = process.env.GMAIL_CLIENT_SECRET || CLIENT_SECRET;

const oauth2Client = new google.auth.OAuth2(actualClientId, actualClientSecret, REDIRECT_URI);

// Scope gabungan: Gmail + Google Tasks + Google Drive
const SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // Paksa muncul layar izin agar dapat refresh_token baru
  scope: SCOPES,
});

console.log('====================================================');
console.log('🔑 N.E.X.A — GOOGLE TASKS TOKEN GENERATOR');
console.log('====================================================\n');
console.log('Scope yang diminta:');
console.log('  ✅ Gmail (https://mail.google.com/)');
console.log('  ✅ Google Tasks (tasks read/write)');
console.log('  ✅ Google Drive (drive full)\n');
console.log('1. Silakan buka URL berikut di browser Anda:');
console.log('\n' + authUrl + '\n');
console.log('2. Login dengan akun Gmail Anda dan klik "Izinkan".');
console.log('3. Script ini sedang menunggu di port 3001...\n');

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/oauth2callback')) {
    const qs = new url.URL(req.url, 'http://localhost:3001').searchParams;
    const code = qs.get('code');

    if (code) {
      try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>✅ Otentikasi Berhasil!</h1><p>Silakan tutup jendela ini dan kembali ke terminal.</p>');

        console.log('\n🎉 BERHASIL! Ini Token Rahasia Anda:\n');
        console.log('====================================================');
        console.log('TASKS_REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('GOOGLE_DRIVE_REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('====================================================\n');
        console.log('📋 LANGKAH SELANJUTNYA:');
        console.log('1. Copy nilai refresh token di atas');
        console.log('2. Tambahkan ke file .env lokal Anda');
        console.log('3. Upload ke Hugging Face Secrets dengan nama:');
        console.log('   - TASKS_REFRESH_TOKEN');
        console.log('   - GOOGLE_DRIVE_REFRESH_TOKEN');
        console.log('\nSelesai! Tekan Ctrl+C untuk keluar.');

        setTimeout(() => process.exit(0), 2000);
      } catch (err) {
        res.end('Gagal mendapatkan token: ' + err.message);
        console.error('Error:', err);
      }
    } else {
      res.end('Parameter code tidak ditemukan.');
    }
  }
});

server.listen(3001, () => {
  const { exec } = require('child_process');
  // Auto-buka browser di Windows
  exec(`start "" "${authUrl}"`).on('error', () => {
    console.log('(Tidak bisa buka browser otomatis. Salin URL di atas secara manual.)');
  });
});
