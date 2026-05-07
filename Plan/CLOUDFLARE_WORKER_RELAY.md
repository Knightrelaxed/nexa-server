# Cloudflare Worker Relay untuk N.E.X.A Vision

## Mengapa Ini Dibutuhkan?
HuggingFace memblokir SEMUA koneksi keluar ke `api.telegram.org` (baik HTTPS port 443 maupun HTTP port 80). N.E.X.A tidak bisa mengunduh gambar dari Telegram secara langsung. Solusinya: relay melalui Cloudflare Worker (GRATIS, 100.000 request/hari).

## Langkah Setup (5 menit)

### 1. Buat Akun Cloudflare (Gratis)
Kunjungi https://dash.cloudflare.com/sign-up dan daftar.

### 2. Buat Worker Baru
1. Buka https://dash.cloudflare.com → **Workers & Pages** → **Create**
2. Klik **"Create Worker"**
3. Beri nama: `nexa-relay`
4. Klik **"Deploy"** (deploy template dulu)
5. Setelah deploy, klik **"Edit Code"**

### 3. Tempel Kode Ini (Ganti Semua Isi):

```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    if (!target) {
      return new Response('N.E.X.A Telegram Relay Active', { status: 200 });
    }

    // Hanya izinkan relay ke api.telegram.org (keamanan)
    if (!target.startsWith('https://api.telegram.org/')) {
      return new Response('Forbidden: only api.telegram.org allowed', { status: 403 });
    }

    try {
      const response = await fetch(target);
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (err) {
      return new Response('Relay error: ' + err.message, { status: 502 });
    }
  }
}
```

### 4. Deploy
Klik **"Save and Deploy"**. Anda akan mendapat URL seperti:
`https://nexa-relay.YOUR_SUBDOMAIN.workers.dev`

### 5. Tes Worker
Buka di browser:
```
https://nexa-relay.YOUR_SUBDOMAIN.workers.dev/?url=https%3A%2F%2Fapi.telegram.org%2Fbot<TOKEN>%2FgetMe
```
Jika berhasil, Anda akan melihat JSON info bot Anda.

### 6. Set Environment Variable di HuggingFace
1. Buka HuggingFace Space → **Settings** → **Variables and secrets**
2. Tambah Secret baru:
   - **Name**: `TELEGRAM_PROXY_URL`
   - **Value**: `https://nexa-relay.YOUR_SUBDOMAIN.workers.dev/?url=`
3. Space akan restart otomatis

### 7. Selesai!
N.E.X.A akan otomatis menggunakan relay privat Anda untuk mengunduh gambar dari Telegram.
