const { google } = require('googleapis');
const http = require('http');
const url = require('url');

require('dotenv').config();

// Ambil Client ID dan Secret dari environment variables
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Error: GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET wajib didefinisikan di .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
  'https://mail.google.com/' // Akses Penuh ke Gmail (Baca, Tulis, Hapus)
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // Meminta Refresh Token
  prompt: 'consent',      // Memaksa muncul layar persetujuan
  scope: SCOPES,
});

console.log('====================================================');
console.log('🔑 N.E.X.A GMAIL OAUTH 2.0 TOKEN GENERATOR');
console.log('====================================================\n');
console.log('1. Silakan buka URL berikut di browser Anda:');
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
        console.log('GMAIL_REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('====================================================\n');
        console.log('Silakan copy GMAIL_REFRESH_TOKEN di atas, dan masukkan ke dalam file .env dan rahasia Hugging Face Anda.');
        console.log('Proses selesai. Anda dapat menekan Ctrl+C untuk keluar jika program tidak berhenti otomatis.');
        
        // Matikan server setelah selesai
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
  // Buka URL otomatis di Windows
  const { exec } = require('child_process');
  exec(`start "" "${authUrl}"`);
});
