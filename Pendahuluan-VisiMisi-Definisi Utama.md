## PENDAHULUAN  
_(Introduction)_

### Latar Belakang

Menjaga keseimbangan antara tanggung jawab akademik yang masif sebagai mahasiswa Sastra Arab di Universitas Gadjah Mada, mempertahankan standar _Jardine Scholar_, dan mengeksekusi visi jangka panjang menuju karier diplomasi internasional membutuhkan fokus kognitif yang luar biasa. Mengandalkan tekad manual (_willpower_) semata untuk mencatat detail finansial harian, menahan diri dari distraksi media sosial, atau melacak peluang kompetisi akademik sangatlah menguras energi mental yang seharusnya digunakan untuk belajar dan riset. N.E.X.A lahir dari kebutuhan mendesak akan sebuah "otak eksternal" atau _Chief of Staff_ digital yang mampu mengambil alih seluruh beban tersebut secara otonom. N.E.X.A v2.0 dibangun ulang menggunakan arsitektur _Cloud-Native_ untuk menjadi sistem yang tidak pernah tidur, bertindak sebagai pengawas kedisiplinan absolut, melayani setiap hal yang di kehedaki majikannya dan memastikan setiap rutinitas harian selalu sejalan dengan ambisi masa depan.

### Visi & Misi Project

1.  **_Visi_**_:_ Menciptakan _Super AI Assistant_ (sekelas J.A.R.V.I.S.) yang bekerja secara senyap di latar belakang (_set-and-forget_).
2.  **_Misi (Jangka Pendek)_**_:_ Mengotomatisasi seluruh hal yang di butuhkan oleh tuannya seperti pencatatan finansial, pengingat kedisiplinan, pengatur jam tidur, pengatur jadwal akademik keseharian dan kegiatan apapun yang dilakukan Tuan Faqih serta menegakkan kedisiplinan durasi layar (_screen-time_).
3.  **_Misi (Jangka Panjang)_**_:_ Menjadi eksekutif digital proaktif yang mendukung penuh target akademik di Sastra Arab, mempertahankan beasiswa, menavigasi jalur karier diplomasi internasional melalui peringatan peluang (_radar_) dan ringkasan intelijen harian. Dan menjadikan Tuannya menjadi pribadi yang lebih baik kedepannya dengan memanfaatkan tenologi. Dan selalu berkembang mempelajari tentang apapun yang diakukakn oleh Tuannya

### Pengguna

Eksklusif untuk otorisasi tunggal (Tuan Faqih).

### Batasan Sistem_:_

Beroperasi di _cloud server_ (Koyeb) dengan ketergantungan pada perangkat Android utama yang menjalankan aplikasi Tasker sebagai sensor lapangan.

## DESKRIPSI SISTEM  
_(System Overview)_

### Definisi Utama (Executive Summary)

**N.E.X.A (Neural Extension Assistant for Intelligence)** adalah asisten kecerdasan buatan _cloud-native_ yang dirancang sebagai _Chief of Staff_ digital otonom. Sistem ini bertindak sebagai jembatan cerdas antara interaksi natural manusia (melalui teks dan suara) dengan eksekusi teknis tingkat tinggi (manipulasi API, manajemen _database_, hingga intervensi sistem operasi Android). N.E.X.A diciptakan khusus untuk mengambil alih beban kognitif dan administratif harian, memastikan pengguna dapat mempertahankan fokus absolut pada prioritas akademik dan target karier strategis di bidang diplomasi. Dan pastinya memliki tujuan absolut untuk Tuannya.

### Pilar Kapasitas Utama (Core Capabilities)

Sistem N.E.X.A tidak hanya merespons perintah pasif, melainkan digerakkan oleh empat pilar operasional proaktif:

1.  **Sistem Finansial Omnichannel (Omnichannel Finance Tracker)**
2.  **Deskripsi**

Mencatat, mengekstrak, dan membukukan transaksi keuangan ke dalam _spreadsheet_ secara _real-time_ melalui berbagai jalur input (_omnichannel_), baik secara otonom di latar belakang maupun melalui perintah interaktif pengguna.

1.  **Mekanisme Teknis (Multi-Input)**

Fleksibilitas pencatatan didukung oleh 5 jalur input yang terbagi dalam dua kategori:

*   1.  **Input Pasif (Otonom)**

Beroperasi tanpa campur tangan pengguna melalui (1) intersepsi notifikasi _push_ M-Banking oleh Tasker, dan (2) _polling_ otomatis _email_ struk dari bank.

*   1.  **Input Aktif (Interaktif)**

Dieksekusi langsung oleh pengguna melalui Telegram Bot berupa (3) instruksi teks natural, (4) _Voice Note_ yang ditranskripsi oleh sistem, dan (5) unggahan foto nota/struk fisik yang diekstrak menggunakan _Vision AI_.

1.  **Deduplication Engine:**

Logika resolusi konflik tingkat lanjut yang diterapkan **secara eksklusif pada Input Pasif** (Notifikasi & Email). Menggunakan _Composite Key_, sistem memastikan transaksi otomatis yang berasal dari dua sumber berbeda pada waktu bersamaan tidak tercatat ganda. Sementara itu, Input Aktif dari Telegram akan di bypass dari mesin deduplikasi dan langsung diproses sebagai instruksi absolut.

1.  **Pusat Memori Kontekstual (Persistent Long-Term Memory)**
2.  **Deskripsi**

Mengeliminasi fenomena "amnesia AI" yang sering terjadi pada bot konvensional dengan mempertahankan rekam jejak obrolan secara utuh.

1.  **Mekanisme Teknis**

Memanfaatkan integrasi _database_ relasional di _cloud_ untuk menyimpan profil, preferensi, dan riwayat gelembung _chat_. N.E.X.A memproses rentetan diskusi sebelumnya setiap kali merespons, menghasilkan komunikasi yang persisten dan saling terhubung layaknya berdiskusi dengan rekan manusia.

1.  **Penegak Kedisiplinan Ekstrem (Productivity Enforcer & God Mode)**
2.  **Deskripsi**

Memitigasi distraksi digital yang mengancam produktivitas dan memotong rantai penundaan (procrastination) secara agresif demi menjaga ritme kerja.

1.  **Mekanisme Teknis**

Secara konstan memantau metrik durasi penggunaan aplikasi (screen-time) di latar belakang. Jika terdeteksi pelanggaran batas waktu pada aplikasi hiburan, N.E.X.A akan mengirimkan teguran eskalatif. Sebagai langkah terakhir, sistem memiliki wewenang memicu God Mode—mengirimkan sinyal balik (webhook) untuk mengambil alih kontrol OS Android dan memutus paksa koneksi jaringan (WiFi/Data) pengguna.

1.  **Pusat Komando Suara Universal (Voice-Activated Universal Router)**
2.  **Deskripsi**

Membebaskan pengguna dari keharusan mengetik dengan menerjemahkan perintah audio menjadi rantai eksekusi program yang presisi.

1.  **Mekanisme Teknis**

Mengubah _Voice Note_ menjadi teks akurasi tinggi, yang kemudian dianalisis oleh _core logic_ AI untuk memicu fungsi spesifik secara otomatis—seperti mengarsipkan gagasan esai, mencari literatur intelijen, atau mencatat metrik harian.

1.  **Pusat Kendali Agenda Otonom (Dynamic Lifecycle & Schedule Manager)**
2.  **Deskripsi**

Bertindak sebagai manajer waktu proaktif yang mengorkestrasi seluruh siklus kegiatan pengguna. N.E.X.A tidak sekadar pasif mencatat, melainkan mengambil alih beban kognitif penjadwalan untuk memastikan setiap target akademik, riset esai, dan rutinitas harian tereksekusi dengan presisi tanpa ada yang tumpang tindih.

1.  **Mekanisme Teknis**

Dibangun di atas ekosistem **Google Calendar API** sebagai fondasi waktu yang efisien dan presisi (bebas dari beban _polling server_).

*   1.  **Manipulasi Instan (Read/Write Access)**

Terintegrasi dengan _Universal Voice Router dan input teks._ Pengguna cukup mendelegasikan instruksi secara natural via teks atau suara di Bot Telegram (contoh: _"Bro, jadwal diskusi geopolitik hari ini batal, geser ke besok jam 4 sore dan kosongin jadwal pagi"_). N.E.X.A secara otomatis akan membedah intent, mengekstrak data waktu, dan menembakkan _request_ API untuk membuat, mengedit, atau menghapus blok jadwal di kalender secara seketika tanpa pengguna perlu membuka aplikasi.

*   1.  **Orkestrasi Proaktif (Push & Cron)**

Memanfaatkan _Push Notification_ Webhook dari kalender dan _Cron Job_ server Koyeb. N.E.X.A memindai peta jadwal secara berkala dan menembakkan pengingat eskalatif berlapis—menyajikan ringkasan apa yang harus dieksekusi hari ini pada pukul 05:30 pagi, memberikan peringatan 10 menit sebelum agenda dimulai, dan tersinkronisasi langsung dengan _God Mode_ untuk menampilkan layer merah (scenes) atau menekan tombol kembali kelayar utama (Go Home) secara berulang atau bahkan mengunci perangkat jika jadwal krusial tersebut malah dihabiskan untuk _memainkan_ aplikasi hiburan.