/**
 * ============================================================
 * 🔑 N.E.X.A UNIVERSAL OAUTH2 TOKEN GENERATOR
 * ============================================================
 * Generates a SINGLE refresh token with ALL required scopes:
 * - Gmail (read/write/delete)
 * - Google Tasks (read/write)
 * - Google Drive (file upload for Vault)
 *
 * This replaces the need for separate get_gmail_token.js and
 * get_tasks_token.js scripts. One token rules them all.
 *
 * USAGE:
 *   node get_universal_token.js
 *
 * After running, update these HF Secrets with the SAME token:
 *   - GMAIL_REFRESH_TOKEN
 *   - TASKS_REFRESH_TOKEN
 *   - GOOGLE_DRIVE_REFRESH_TOKEN (optional, only if using OAuth for Drive)
 * ============================================================
 */

const { google } = require('googleapis');
const http = require('http');
const url = require('url');

// Ganti dengan OAuth Client ID & Secret dari Google Cloud Console
const CLIENT_ID = '811415183702-idiqmp253o2n4u8t27as1eaai3rt0mmc.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// ALL scopes N.E.X.A needs in one go
const SCOPES = [
  'https://mail.google.com/',                         // Gmail full access
  'https://www.googleapis.com/auth/tasks',            // Google Tasks
  'https://www.googleapis.com/auth/drive.file',       // Drive file upload (Vault)
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',      // Force consent screen to ensure refresh_token is returned
  scope: SCOPES,
});

console.log('====================================================');
console.log('🔑 N.E.X.A UNIVERSAL OAUTH2 TOKEN GENERATOR');
console.log('====================================================\n');
console.log('Scopes yang diminta:');
SCOPES.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
console.log('\n1. Silakan buka URL berikut di browser Anda:');
console.log('\n' + authUrl + '\n');
console.log('2. Login dengan email Anda dan klik "Continue/Izinkan".');
console.log('3. Script ini sedang menunggu respon dari Google (Listening on port 3000)...\n');

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/oauth2callback')) {
    const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
    const code = qs.get('code');

    if (code) {
      try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>✅ Otentikasi Berhasil!</h1><p>Silakan tutup jendela browser ini dan kembali ke terminal Anda.</p>');
        
        console.log('\n🎉 OTENTIKASI BERHASIL! Ini adalah Token Rahasia Anda:\n');
        console.log('====================================================');
        console.log('REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('====================================================\n');
        console.log('Salin token di atas ke dalam Hugging Face Secrets:');
        console.log('  → GMAIL_REFRESH_TOKEN  = ' + tokens.refresh_token);
        console.log('  → TASKS_REFRESH_TOKEN  = ' + tokens.refresh_token);
        console.log('  → GOOGLE_DRIVE_REFRESH_TOKEN = ' + tokens.refresh_token + '  (opsional)');
        console.log('\n⚠️  PENTING: Pastikan status OAuth Consent Screen di Google Cloud Console');
        console.log('   diubah dari "Testing" → "In Production" agar token TIDAK kadaluarsa setiap 7 hari!');
        console.log('\nProses selesai. Tekan Ctrl+C untuk keluar.');
        
        setTimeout(() => process.exit(0), 1000);
      } catch (err) {
        res.end('Gagal mendapatkan token: ' + err.message);
        console.error('Error getting token:', err);
      }
    } else {
      res.end('Parameter code tidak ditemukan pada URL.');
    }
  }
});

server.listen(3000, () => {
  const { exec } = require('child_process');
  exec(`start "" "${authUrl}"`);
});
