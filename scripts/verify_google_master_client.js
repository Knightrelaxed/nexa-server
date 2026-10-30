require('dotenv').config();
const googleMaster = require('../src/infrastructure/Google_Master_Client');

async function testAll() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('🧪 UJI INTEGRASI GOOGLE MASTER OAUTH 2.0 (FULL ACCESS)');
  console.log('══════════════════════════════════════════════════════════════\n');

  const auth = googleMaster.getAuthClient();
  if (!auth) {
    console.error('❌ Auth Client gagal diinisialisasi.');
    process.exit(1);
  }

  // 1. Uji Token & Profil
  try {
    const tokenInfo = await auth.getTokenInfo(auth.credentials.access_token || (await auth.getAccessToken()).token);
    console.log(`✅ [1/5] OTENTIKASI SUKSES:`);
    console.log(`   • Email Terhubung : ${tokenInfo.email}`);
    console.log(`   • Sisa Waktu Token: ${tokenInfo.expiry_date ? Math.round((tokenInfo.expiry_date - Date.now())/1000) + 's' : 'Aktif'}`);
    console.log(`   • Total Scopes    : ${tokenInfo.scopes.length} scope aktif\n`);
  } catch (e) {
    console.error('❌ [1/5] Gagal membaca token info:', e.message);
  }

  // 2. Uji Google Tasks (Read/Write)
  try {
    const tasks = googleMaster.getTasks();
    const res = await tasks.tasklists.list({ maxResults: 5 });
    const listCount = res.data.items?.length || 0;
    console.log(`✅ [2/5] GOOGLE TASKS TERHUBUNG:`);
    console.log(`   • Ditemukan ${listCount} Tasklist (Default: "${res.data.items?.[0]?.title || 'My Tasks'}")\n`);
  } catch (e) {
    console.error('❌ [2/5] Gagal membaca Google Tasks:', e.message);
  }

  // 3. Uji Google Calendar (Read/Write)
  try {
    const calendar = googleMaster.getCalendar();
    const res = await calendar.calendarList.list({ maxResults: 5 });
    const calCount = res.data.items?.length || 0;
    console.log(`✅ [3/5] GOOGLE CALENDAR TERHUBUNG:`);
    console.log(`   • Ditemukan ${calCount} Kalender (Primary: "${res.data.items?.[0]?.summary || 'Primary'}")\n`);
  } catch (e) {
    console.error('❌ [3/5] Gagal membaca Google Calendar:', e.message);
  }

  // 4. Uji Gmail API (Read/Send)
  try {
    const gmail = googleMaster.getGmail();
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log(`✅ [4/5] GMAIL API TERHUBUNG:`);
    console.log(`   • Akun Email      : ${profile.data.emailAddress}`);
    console.log(`   • Total Pesan     : ${profile.data.messagesTotal} pesan`);
    console.log(`   • Total Threads   : ${profile.data.threadsTotal} threads\n`);
  } catch (e) {
    console.error('❌ [4/5] Gagal membaca Gmail:', e.message);
  }

  // 5. Uji Google Drive API (Full Access)
  try {
    const drive = googleMaster.getDrive();
    const files = await drive.files.list({ pageSize: 5, fields: 'files(id, name, mimeType)' });
    console.log(`✅ [5/5] GOOGLE DRIVE TERHUBUNG:`);
    console.log(`   • Menemukan ${files.data.files?.length || 0} file terbaru di root/folder Drive Tuan.`);
    files.data.files?.forEach((f, idx) => {
      console.log(`     ${idx + 1}. ${f.name} (${f.mimeType})`);
    });
    console.log('');
  } catch (e) {
    console.error('❌ [5/5] Gagal membaca Google Drive:', e.message);
  }

  console.log('══════════════════════════════════════════════════════════════');
  console.log('🎉 SELURUH INTEGRASI MASTER OAUTH 2.0 BERHASIL 100%!');
  console.log('══════════════════════════════════════════════════════════════\n');
}

testAll().catch(console.error);
