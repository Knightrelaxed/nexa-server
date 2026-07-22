# N.E.X.A 3.0: Web UI & Visual Embodiment (The "Emo Face" Initiative)

## Visi Utama
Evolusi N.E.X.A dari asisten berbasis teks Telegram menjadi entitas cerdas yang memiliki wujud fisik/visual berupa aplikasi Web. N.E.X.A akan divisualisasikan dengan wajah robot digital bergaya *Emo Robot* (minimalis, ekspresif, garis neon, dengan *pitch black background*).

## Mockup Visual
![NEXA Emo Face UI](../assets/images/nexa_emo_face_ui.png)
*Konsep antarmuka: Wajah N.E.X.A mengisi bagian atas layar, sementara panel chat bergaya Glassmorphism berada di bagian bawah.*

## 1. Arsitektur Wajah "Canvas Digital"
- **Desain:** Menggunakan latar belakang hitam pekat (Pitch Black). Mata dan mulut dibentuk dari garis neon bercahaya (*Cyan* atau *Deep Blue*).
- **Teknologi Animasi:** Tidak menggunakan file GIF atau video statis. Wajah digambar menggunakan **SVG Morphing** atau **HTML5 Canvas** (didukung oleh *Framer Motion* atau *GSAP* di React). 
- **Keuntungan:** Resolusi tajam tanpa batas, sangat ringan, animasi mulus (60+ FPS), dan memungkinkan kedipan/gerakan mata acak secara prosedural.

## 2. Logika Emosi Berbasis AI Intent
Backend Node.js N.E.X.A yang ada saat ini akan mengirimkan "Kode Emosi" bersamaan dengan respons teks. Frontend akan bereaksi seketika:
- **Netral/Idle:** Berkedip acak, mata sedikit bergerak layaknya sedang mengawasi atau menunggu instruksi.
- **Berpikir (Processing):** Mata menyipit fokus atau berubah menjadi cincin *loading* memutar saat sedang mengakses *database* atau mencari data di web.
- **Senang / Apresiasi:** Mata melengkung ke atas `^ ^` saat tugas selesai atau dipuji Tuan Faqih.
- **Cerewet / Otoriter:** Mata turun setengah (menatap tajam sinis) dan mulut membentuk garis datar. Terjadi saat fitur *Midnight Check-in* mendapati Tuan Faqih belum tidur pada jam 1 pagi.
- **Mendengar (Mic ON):** Mata membesar dan menatap lurus ke arah indikator *microphone* di bagian bawah layar.

## 3. Integrasi Suara & Lip-Sync (Audio Waveform)
- **Voice Engine:** N.E.X.A akan berbicara menggunakan integrasi *Text-to-Speech (TTS)* yang sangat realistis (misal: ElevenLabs atau Google Cloud TTS versi premium).
- **Lip-Sync Matematik:** Animasi mulut N.E.X.A akan diikat secara *real-time* dengan frekuensi audio (*Audio Frequency Analyzer*). Saat suaranya nyaring, mulut akan membesar; saat pelan, mengecil. Memberikan ilusi sempurna bahwa dia benar-benar sedang mengucapkan kata tersebut.

## 4. UI Chat Terintegrasi (Glassmorphism)
- Di bagian sepertiga bawah layar, panel riwayat percakapan (*chat log*) akan melayang transparan.
- **Interaksi:** Tuan Faqih bisa menggunakan mode ketik (*keyboard*) atau mode suara (menekan tombol Mic) secara *seamless*.
- Fokus utama layar tetap berada pada ekspresi wajah N.E.X.A.

## 5. Integrasi Sensor Otomatis
Pindah ke aplikasi Web membuka limitasi yang ada di Telegram:
- **Akses Lokasi (GPS) Berkelanjutan:** Saat Web dibuka, N.E.X.A dapat melacak lokasi secara dinamis tanpa harus ditambahkan manual via chat, sangat berguna untuk asisten cuaca dan pengingat berbasis lokasi.
- **Proactive Interruption (WebSocket):** N.E.X.A bisa secara spontan mengubah layarnya dan mengeluarkan suara jika ada tugas terlambat, tanpa harus menunggu di-*refresh* oleh Tuan Faqih.

---
**Status Dokumen:** Rencana Inti (Menunggu Inisiasi Frontend React/Next.js)
