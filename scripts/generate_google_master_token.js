const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/meetings.space.created',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/photoslibrary',
  'https://www.googleapis.com/auth/youtube'
];

async function main() {
  let clientId = process.env.GOOGLE_CLIENT_ID || process.argv[2];
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.argv[3];

  // Cek jika ada file client_secret json di folder Downloads pengguna
  const downloadsPath = path.join(process.env.USERPROFILE || 'C:\\Users\\ThinkPad', 'Downloads');
  try {
    const files = fs.readdirSync(downloadsPath);
    const secretFile = files.find(f => f.startsWith('client_secret_') && f.endsWith('.json'));
    if (secretFile && (!clientId || !clientSecret)) {
      const secretJson = JSON.parse(fs.readFileSync(path.join(downloadsPath, secretFile), 'utf8'));
      const web = secretJson.web || secretJson.installed;
      if (web) {
        clientId = web.client_id;
        clientSecret = web.client_secret;
        console.log(`[INFO] Otomatis membaca kredensial dari: Downloads/${secretFile}`);
      }
    }
  } catch (_) {}

  // Fallback ke kredensial manual jika belum terbaca
  if (!clientId || !clientSecret) {
    clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  }

  if (!clientId || !clientSecret) {
    console.error('\n❌ Kredensial tidak ditemukan. Jalankan dengan:');
    console.error('node scripts/generate_google_master_token.js <CLIENT_ID> <CLIENT_SECRET>\n');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:3000/oauth2callback'
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });

  console.log('\n════════════════════════════════════════════════════════════════════════════');
  console.log('🔑 SILAKAN BUKA URL DI BAWAH INI PADA BROWSER ANDA UNTUK OTORISASI:');
  console.log('════════════════════════════════════════════════════════════════════════════\n');
  console.log(authUrl);
  console.log('\n════════════════════════════════════════════════════════════════════════════\n');

  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/oauth2callback')) {
      const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
      const code = qs.get('code');
      const error = qs.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>❌ Otorisasi Dibatalkan</h1><p>Alasan: ${error}</p>`);
        console.error('\n❌ Otorisasi dibatalkan oleh pengguna:', error);
        server.close();
        process.exit(1);
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
          <h1 style="color: #2e7d32;">✅ Otorisasi Master Berhasil!</h1>
          <p style="font-size: 18px;">Master Refresh Token telah berhasil diekstraksi dan dikirim ke terminal N.E.X.A.</p>
          <p style="color: #666;">Anda dapat menutup tab browser ini sekarang.</p>
        </div>
      `);
      server.close();

      try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('🎉 ════════════════════════════════════════════════════════════════════════');
        console.log('🎉 GOOGLE MASTER REFRESH TOKEN BERHASIL DIPEROLEH:');
        console.log('🎉 ════════════════════════════════════════════════════════════════════════\n');
        console.log(`GOOGLE_CLIENT_ID=${clientId}`);
        console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
        console.log(`GOOGLE_MASTER_REFRESH_TOKEN=${tokens.refresh_token}\n`);
        console.log('════════════════════════════════════════════════════════════════════════════\n');
        console.log('✅ Langkah selanjutnya: Token di atas akan dimasukkan ke file .env N.E.X.A.');
        process.exit(0);
      } catch (err) {
        console.error('❌ Gagal menukar token:', err.message);
        process.exit(1);
      }
    }
  }).listen(3000, () => {
    console.log('⏳ Server lokal aktif di port 3000, menunggu respons browser...');
  });
}

main().catch(console.error);
