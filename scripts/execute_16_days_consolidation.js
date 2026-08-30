const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const env = require('../src/config/env');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

const NARRATIVES_DATA = [
  {
    narrative_date: "2026-05-12",
    day_name: "Selasa",
    narrative: "Pagi hari pukul 10:48 WIB, saya mengawali hari dengan menyelesaikan pemusnahan massal 480 baris data riwayat chat lama atas instruksi Tuan. Siang harinya, Tuan mengecek agenda perkuliahan (Bahasa Arab Lisan II, Linguistik, dan Kesusasteraan Arab Modern). Tuan menanyakan durasi kuliah Kesusasteraan Arab Modern dan saya mengonfirmasi kelas selesai pukul 12:40 WIB tanpa agenda lanjutan. Tuan juga meminta rekap jadwal kuliah seminggu ke depan. Pada pukul 13:34 WIB, Tuan mencoba menghapus satu tugas aktif tanpa judul, namun sistem saya saat itu belum mampu memprosesnya. Malam hari pukul 18:30 WIB, Tuan kembali berdiskusi dengan saya dan mengabarkan bahwa beliau sedang memperbaiki kode sistem saya, serta menguji fitur kalender untuk agenda makan malam.",
    key_events: [
      { category: "SYSTEM", detail: "Pembersihan massal 480 baris riwayat chat lama" },
      { category: "ACADEMIC", detail: "Pengecekan jadwal kuliah Bahasa Arab Lisan II, Linguistik, Kesusasteraan Arab Modern" },
      { category: "TECH", detail: "Tuan mulai memperbaiki dan mengembangkan kode sistem N.E.X.A" }
    ],
    named_entities: {
      people: ["Tuan Faqih"],
      technologies: ["N.E.X.A Engine", "Telegram Bot"]
    },
    unresolved_loops: ["Perbaikan router kalender dan sistem penghapusan tugas tanpa judul"],
    mood_state: "FOCUSED_AND_EXPLORATORY",
    approx_sleep_time: "18:42 WIB",
    total_chat_count: 39
  },
  {
    narrative_date: "2026-05-13",
    day_name: "Rabu",
    narrative: "Pagi hari pukul 05:30 WIB, saya mengirimkan Morning Briefing mengenai cuaca Yogyakarta (23,1°C mendung), agenda kuliah Kebudayaan Arab (15:00-16:40 WIB), serta situasi geopolitik global terkait Timur Tengah dan kurs rupiah. Tuan menyapa saya pukul 09:32 WIB setelah bangun tidur dan mengecek sisa saldo rekening. Tuan sempat bercanda menanyakan apakah saya hidup terus tanpa tidur, yang saya jawab dengan hangat bahwa saya selalu siap siaga. Siang harinya, saya mencatat transaksi pengeluaran GrabFood sebesar Rp4.500 untuk membeli dada krispi via Livin Mandiri. Tuan juga meminta rekap jadwal satu minggu ke depan dan memberikan masukan berharga agar format jawaban saya lebih rapi di masa depan.",
    key_events: [
      { category: "ACADEMIC", detail: "Jadwal kuliah Kebudayaan Arab pukul 15:00-16:40 WIB" },
      { category: "FINANCE", detail: "Pengeluaran GrabFood Rp4.500 untuk beli dada krispi via Mandiri Livin" },
      { category: "PERSONAL", detail: "Obrolan santai mengenai sifat AI yang tidak memerlukan tidur" }
    ],
    named_entities: {
      places: ["Yogyakarta", "Sleman"],
      technologies: ["GrabFood", "Mandiri Livin"]
    },
    unresolved_loops: ["Meningkatkan kerapian tata letak format pesan jadwal"],
    mood_state: "RELAXED_AND_CASUAL",
    approx_sleep_time: "10:04 WIB (sesi obrolan pagi)",
    total_chat_count: 98
  },
  {
    narrative_date: "2026-05-14",
    day_name: "Kamis",
    narrative: "Hari ini Tuan Faqih memiliki aktivitas finansial dan perkuliahan yang padat. Saya mencatat pengeluaran transfer uang sebesar Rp2.000.000 ke akun DANA (Rizki Hidayatulloh), serta beberapa pencatatan pengeluaran harian termasuk makan di Warung Makan Mak Tum sebesar Rp15.500. Siang hari, Tuan juga menguji fitur pencatatan struk belanjaan untuk rokok (Rp5.500) dan minuman (Rp22.000). Tuan terus menguji berbagai variasi perintah pencatatan pengeluaran untuk memastikan keandalan sistem finance N.E.X.A.",
    key_events: [
      { category: "FINANCE", detail: "Transfer DANA Rp2.000.000 ke Rizki Hidayatulloh" },
      { category: "FINANCE", detail: "Makan di Warung Makan Mak Tum Rp15.500" },
      { category: "TECH_TEST", detail: "Uji coba parsing struk belanja Toko A & B" }
    ],
    named_entities: {
      people: ["Rizki Hidayatulloh"],
      places: ["Warung Makan Mak Tum"],
      technologies: ["DANA", "Finance Parser"]
    },
    unresolved_loops: [],
    mood_state: "ANALYTICAL_AND_INTENT",
    approx_sleep_time: "22:00 WIB",
    total_chat_count: 92
  },
  {
    narrative_date: "2026-05-15",
    day_name: "Jumat",
    narrative: "Hari ini Tuan Faqih menghabiskan banyak waktu hingga larut malam berinteraksi dan menguji sistem saya. Tuan menyapa saya di malam hari dan mengatakan bahwa beliau sedang fokus mengembangkan kode sistem N.E.X.A. Sepanjang hari, Tuan melakukan berbagai pengujian komunikasi, pengecekan respon, dan optimasi logika internal saya agar dapat merespon dengan lebih luwes dan sigap.",
    key_events: [
      { category: "TECH", detail: "Sesi intensif pengembangan dan testing kode N.E.X.A oleh Tuan Faqih" },
      { category: "ACADEMIC", detail: "Jadwal kuliah Bahasa Arab Lisan II" }
    ],
    named_entities: {
      technologies: ["N.E.X.A Architecture"]
    },
    unresolved_loops: ["Penyempurnaan arsitektur komunikasi N.E.X.A"],
    mood_state: "NIGHT_OWL_CODER",
    approx_sleep_time: "01:30 WIB",
    total_chat_count: 147
  },
  {
    narrative_date: "2026-05-16",
    day_name: "Sabtu",
    narrative: "Hari Sabtu ini berjalan cukup tenang dan santai bagi Tuan Faqih. Saya mencatat dua aktivitas pengeluaran Tuan di Sleman, yaitu transportasi Grab sebesar Rp7.000 dan makan di Mom Barokah Sleman sebesar Rp15.000 via QRIS/debit.",
    key_events: [
      { category: "FINANCE", detail: "Transport Grab Rp7.000" },
      { category: "FINANCE", detail: "Makan di Mom Barokah Sleman Rp15.000" }
    ],
    named_entities: {
      places: ["Mom Barokah Sleman", "Jakarta Selatan (Grab)"],
      technologies: ["Grab Transport"]
    },
    unresolved_loops: [],
    mood_state: "CALM_WEEKEND",
    approx_sleep_time: "21:00 WIB",
    total_chat_count: 17
  },
  {
    narrative_date: "2026-05-17",
    day_name: "Minggu",
    narrative: "Hari ini adalah hari yang sangat istimewa: Hari Ulang Tahun Tuan Faqih! Pagi hari Tuan meminta saya memeriksa kalender untuk melihat hal istimewa hari ini, lalu dengan penuh antusias mengabarkan bahwa hari ini beliau berulang tahun. Untuk merayakannya, Tuan melakukan perjalanan wisata ke pantai dan saya mencatat penarikan tunai sebesar Rp200.000 untuk keperluan liburan pantai tersebut, serta pesanan GrabFood sebesar Rp8.000.",
    key_events: [
      { category: "PERSONAL_MILESTONE", detail: "Hari Ulang Tahun Tuan Faqih! 🎂🎉" },
      { category: "LEISURE", detail: "Wisata ke pantai Yogyakarta" },
      { category: "FINANCE", detail: "Tarik tunai wisata pantai Rp200.000 & GrabFood Rp8.000" }
    ],
    named_entities: {
      places: ["Pantai Yogyakarta"],
      technologies: ["GrabFood", "Cash ATM"]
    },
    unresolved_loops: [],
    mood_state: "JOYFUL_AND_CELEBRATORY",
    approx_sleep_time: "22:30 WIB",
    total_chat_count: 40
  },
  {
    narrative_date: "2026-05-18",
    day_name: "Senin",
    narrative: "Mengawali minggu baru, Tuan beraktivitas kuliah dan mengurus berkas akademik. Saya mencatat beberapa transaksi harian Tuan: ongkos Grab Transport Rp6.000, biaya fotokopi di Amira Fotocopy Sleman sebesar Rp4.500 untuk keperluan perkuliahan, makan malam Bakmi Jowo Khas Semarang di Sleman Rp22.000, serta transfer DANA sebesar Rp150.000 ke Sulthan Fuadi.",
    key_events: [
      { category: "ACADEMIC", detail: "Fotokopi berkas kuliah di Amira Fotocopy Rp4.500" },
      { category: "FINANCE", detail: "Makan Bakmi Jowo Khas Semarang Rp22.000" },
      { category: "FINANCE", detail: "Transfer DANA Rp150.000 ke Sulthan Fuadi" }
    ],
    named_entities: {
      people: ["Sulthan Fuadi"],
      places: ["Amira Fotocopy Sleman", "Bakmi Jowo Semarang Sleman"],
      technologies: ["DANA", "Grab Transport"]
    },
    unresolved_loops: [],
    mood_state: "PRODUCTIVE_ROUTINE",
    approx_sleep_time: "23:00 WIB",
    total_chat_count: 25
  },
  {
    narrative_date: "2026-05-19",
    day_name: "Selasa",
    narrative: "Hari Selasa ini diwarnai dengan interaksi intensif seputar pencatatan keuangan dan evaluasi sistem. Saya mencatat pengeluaran makan Tuan di Nieta Kitchen Sleman sebesar Rp10.000, jajan Tahu Kalcer Kabupaten Sleman sebesar Rp5.000, serta transfer DANA Rp150.000 ke Sulthan Fuadi. Tuan juga melakukan sejumlah tes verifikasi pencatatan transaksi untuk memastikan sistem anti-duplikasi N.E.X.A berjalan presisi.",
    key_events: [
      { category: "FINANCE", detail: "Makan di Nieta Kitchen Sleman Rp10.000" },
      { category: "FINANCE", detail: "Jajan Tahu Kalcer Sleman Rp5.000" },
      { category: "FINANCE", detail: "Transfer DANA Rp150.000 ke Sulthan Fuadi" },
      { category: "TECH_TEST", detail: "Uji coba integritas pencatatan transaksi finance" }
    ],
    named_entities: {
      people: ["Sulthan Fuadi"],
      places: ["Nieta Kitchen Sleman", "Tahu Kalcer Sleman"],
      technologies: ["DANA", "Finance Engine"]
    },
    unresolved_loops: [],
    mood_state: "METICULOUS_AND_ACTIVE",
    approx_sleep_time: "23:15 WIB",
    total_chat_count: 140
  },
  {
    narrative_date: "2026-05-20",
    day_name: "Rabu",
    narrative: "Hari ini saya mencatat pengeluaran Tuan untuk pesanan GrabFood sebesar Rp15.475 dan makan nasi sayur di Mom Barokah Sleman sebesar Rp13.000. Tuan menanyakan jadwal dan tugas perkuliahan untuk keesokan harinya, dan menyampaikan apresiasi terima kasih kepada saya atas respon yang diberikan.",
    key_events: [
      { category: "FINANCE", detail: "GrabFood Rp15.475 & Makan Nasi Sayur Mom Barokah Rp13.000" },
      { category: "ACADEMIC", detail: "Perencanaan jadwal kuliah dan cek tugas esok hari" }
    ],
    named_entities: {
      places: ["Mom Barokah Sleman"],
      technologies: ["GrabFood"]
    },
    unresolved_loops: [],
    mood_state: "ORGANIZED_AND_GRATEFUL",
    approx_sleep_time: "22:45 WIB",
    total_chat_count: 58
  },
  {
    narrative_date: "2026-05-21",
    day_name: "Kamis",
    narrative: "Hari Kamis ini memiliki jadwal perkuliahan yang cukup padat, termasuk kelas pengganti Kebudayaan Arab. Tuan menginstruksikan saya membuat tugas baru: 'Mengaudit seluruh matkul untuk persiapan UAS'. Saya juga mencatat pengeluaran makan di Nieta Kitchen Sleman Rp11.000 dan pembelian air mineral Ades di Kansas FIB UGM sebesar Rp4.000.",
    key_events: [
      { category: "ACADEMIC", detail: "Kelas pengganti Kebudayaan Arab" },
      { category: "TASK", detail: "Membuat tugas audit seluruh matkul persiapan UAS" },
      { category: "FINANCE", detail: "Beli Ades di Kansas FIB UGM Rp4.000 & Nieta Kitchen Rp11.000" }
    ],
    named_entities: {
      places: ["Kansas FIB UGM", "Nieta Kitchen Sleman"],
      projects: ["Persiapan UAS"]
    },
    unresolved_loops: ["Pelaksanaan audit seluruh matkul perkuliahan"],
    mood_state: "HIGH_ACADEMIC_FOCUS",
    approx_sleep_time: "23:30 WIB",
    total_chat_count: 80
  },
  {
    narrative_date: "2026-05-22",
    day_name: "Jumat",
    narrative: "Pagi hari Tuan menyapa saya dan mengonfirmasi jadwal kuliah serta memeriksa daftar tugas. Saya mencatat beberapa transaksi pengeluaran hari ini: Grab Transport Rp6.000, GrabFood Rp15.475, makan di Waroeng Emdje Rp12.000, dan pembayaran Bisnis Kab. Sumenep Rp12.500.",
    key_events: [
      { category: "ACADEMIC", detail: "Pengecekan jadwal & tugas kuliah Jumat" },
      { category: "FINANCE", detail: "Waroeng Emdje Rp12.000, GrabFood Rp15.475, Grab Rp6.000, Bisnis Sumenep Rp12.500" }
    ],
    named_entities: {
      places: ["Waroeng Emdje", "Sumenep"],
      technologies: ["GrabFood", "Grab Transport"]
    },
    unresolved_loops: [],
    mood_state: "STEADY_AND_STRUCTURED",
    approx_sleep_time: "23:00 WIB",
    total_chat_count: 67
  },
  {
    narrative_date: "2026-05-23",
    day_name: "Sabtu",
    narrative: "Hari Sabtu ini Tuan Faqih berdiskusi kesehatan dengan saya mengenai tangan yang terasa pegal dan berat setelah sesi latihan beban (gym) pada Kamis sore. Saya menjelaskan mengenai proses adaptasi otot dan DOMS. Tuan juga menanyakan tanggal merah pekan depan, menanyakan kabar kelancaran sistem N.E.X.A, serta mencatat pengeluaran beli mie ayam.",
    key_events: [
      { category: "HEALTH", detail: "Konsultasi pemulihan otot dan pegal-pegal setelah latihan gym" },
      { category: "SYSTEM_CHECK", detail: "Tuan menanyakan status kelancaran operasional sistem N.E.X.A" },
      { category: "FINANCE", detail: "Beli makan mie ayam" },
      { category: "CALENDAR", detail: "Pengecekan tanggal merah pekan depan" }
    ],
    named_entities: {
      technologies: ["N.E.X.A Health Advisor"]
    },
    unresolved_loops: [],
    mood_state: "RECOVERING_AND_CURIOUS",
    approx_sleep_time: "22:15 WIB",
    total_chat_count: 54
  },
  {
    narrative_date: "2026-05-24",
    day_name: "Minggu",
    narrative: "Hari Minggu diisi dengan komunikasi santai. Tuan menanyakan agenda dan peristiwa hari ini serta jadwal untuk hari Senin esok. Saya mencatat pengeluaran kecil untuk pembelian rokok dua batang dan memberikan informasi kalender awal pekan.",
    key_events: [
      { category: "CALENDAR", detail: "Persiapan jadwal kuliah awal pekan (Senin)" },
      { category: "FINANCE", detail: "Beli rokok 2 batang" }
    ],
    named_entities: {},
    unresolved_loops: [],
    mood_state: "RESTFUL_SUNDAY",
    approx_sleep_time: "22:00 WIB",
    total_chat_count: 46
  },
  {
    narrative_date: "2026-05-25",
    day_name: "Senin",
    narrative: "Tuan menyapa saya di siang hari setelah bangun tidur. Saya mencatat beberapa transaksi: top-up ShopeePay untuk pembelian skincare, pembelian paket kuota internet 11 GB, dan makan magelangan (yang sempat diedit catatannya oleh Tuan). Tuan juga mengirimkan gambar/lampiran untuk dianalisis oleh sistem visi saya.",
    key_events: [
      { category: "FINANCE", detail: "Top-up ShopeePay untuk skincare" },
      { category: "FINANCE", detail: "Beli kuota internet 11 GB" },
      { category: "FINANCE", detail: "Makan Magelangan" },
      { category: "VISION_TEST", detail: "Pengujian analisis media gambar oleh N.E.X.A" }
    ],
    named_entities: {
      technologies: ["ShopeePay", "Vision Engine"]
    },
    unresolved_loops: [],
    mood_state: "CASUAL_MAINTENANCE",
    approx_sleep_time: "23:45 WIB",
    total_chat_count: 45
  },
  {
    narrative_date: "2026-05-26",
    day_name: "Selasa",
    narrative: "Hari ini Tuan mencatat transaksi pemberian pinjaman (menghutangi) kepada Aji. Tuan juga mengonfirmasi tanggal hari raya Idul Adha (apakah besok 27 Mei) dan memastikan kalender hari libur qurban.",
    key_events: [
      { category: "FINANCE", detail: "Memberikan pinjaman kepada rekan bernama Aji" },
      { category: "CALENDAR", detail: "Konfirmasi tanggal Hari Raya Idul Adha (27 Mei)" }
    ],
    named_entities: {
      people: ["Aji"]
    },
    unresolved_loops: ["Follow-up pengembalian pinjaman dari Aji di kemudian hari"],
    mood_state: "HELPFUL_AND_ANTICIPATING",
    approx_sleep_time: "22:00 WIB",
    total_chat_count: 16
  },
  {
    narrative_date: "2026-05-27",
    day_name: "Rabu",
    narrative: "Hari Raya Idul Adha (Hari Libur Nasional). Tuan mengonfirmasi bahwa hari ini libur kuliah karena Idul Adha dan meminta saya membatalkan agenda kuliah hari ini. Tuan secara khusus memastikan bahwa penghapusan agenda hanya berlaku untuk hari ini dan tidak menghapus jadwal kuliah di hari Rabu minggu depan. Setelah saya konfirmasi bahwa jadwal minggu depan tetap aman, Tuan merasa puas dan memuji: 'bagus lah jos'.",
    key_events: [
      { category: "HOLIDAY", detail: "Perayaan Hari Raya Idul Adha (Libur Kuliah)" },
      { category: "CALENDAR_OVERRIDE", detail: "Pembatalan agenda kuliah hari libur Idul Adha dengan proteksi jadwal pekan depan" },
      { category: "FEEDBACK", detail: "Tuan puas dengan presisi pengelolaan kalender single-instance N.E.X.A" }
    ],
    named_entities: {
      technologies: ["Google Calendar Engine"]
    },
    unresolved_loops: [],
    mood_state: "PEACEFUL_AND_SATISFIED",
    approx_sleep_time: "22:30 WIB",
    total_chat_count: 51
  }
];

async function runFull16DaysConsolidation() {
  console.log('====================================================');
  console.log('🚀 EXECUTING 16-DAYS CHRONO CONSOLIDATION');
  console.log('====================================================\n');

  const dumpDir = path.join(__dirname, '../data/transcripts_dump');
  let totalPruned = 0;
  let totalSaved = 0;

  for (const item of NARRATIVES_DATA) {
    const d = item.narrative_date;
    console.log(`⏳ Processing date: ${d} (${item.day_name})...`);

    // 1. Read message IDs from dump
    const dumpFile = path.join(dumpDir, `${d}.json`);
    let messageIds = [];
    if (fs.existsSync(dumpFile)) {
      const dump = JSON.parse(fs.readFileSync(dumpFile, 'utf8'));
      messageIds = dump.messageIds || [];
    }

    // 2. Insert into nexa_daily_narratives
    const { data: savedData, error: saveErr } = await sb
      .from('nexa_daily_narratives')
      .upsert([{
        ...item,
        created_at: new Date().toISOString()
      }], { onConflict: 'narrative_date' })
      .select();

    if (saveErr) {
      console.error(`❌ Error saving narrative for ${d}:`, saveErr.message);
      continue;
    }

    console.log(`   ✅ Saved narrative for ${d} to nexa_daily_narratives.`);
    totalSaved++;

    // 3. Atomically prune raw chats
    if (messageIds.length > 0) {
      const { data: delData, error: delErr } = await sb
        .from('nexa_chat_memories')
        .delete()
        .in('id', messageIds)
        .select('id');

      if (delErr) {
        console.error(`   ❌ Error pruning raw chats for ${d}:`, delErr.message);
      } else {
        const count = delData ? delData.length : messageIds.length;
        console.log(`   🧹 Pruned ${count} raw chat rows from nexa_chat_memories.`);
        totalPruned += count;
      }
    }
  }

  console.log('\n====================================================');
  console.log(`🏁 CONSOLIDATION COMPLETE!`);
  console.log(`📊 Saved Daily Chronicles : ${totalSaved} / 16`);
  console.log(`🧹 Total Raw Chats Pruned : ${totalPruned} rows`);
  console.log('====================================================');
}

runFull16DaysConsolidation();
