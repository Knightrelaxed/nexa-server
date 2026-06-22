const fs = require('fs');

// 1. RAW MANUAL DATA
const manualDataStr = `238	16 May 2026	08.14	Pengeluaran	Transportasi	Bank Mandiri Livin	[Menunggu Detail User]	-7000
239	16 May 2026	15.21	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	Untuk makan siangan eksa	-15000
240	17 May 2026	09.26	Pengeluaran	Lainnya	Bank Mandiri Livin	Untuk beli ayam geprek	-8000
241	18 May 2026	07.57	Pengeluaran	Transportasi	Bank Mandiri Livin	SSNU	-6000
242	18 May 2026	11.10	Pengeluaran	Alat tulis, peralatan	Bank Mandiri Livin	pengeluaran ke AMIRA FOTOCOPY Sleman	-4500
243	18 May 2026	20.20	Pengeluaran	Lainnya	Bank Mandiri Livin	pengeluaran ke Bakmi Jowo Khas Semarang SLEMAN - ID Tanggal 18 Mei 2026 &nbsp	-22000
244	18 May 2026	21.01	Pengeluaran	Pinjaman, bunga	Bank Mandiri Livin	Menghutangi aji	-150000
245	19 May 2026	09.04	Pengeluaran	Lainnya	Bank Mandiri Livin	pengeluaran ke nieta kitchen Sleman	-10000
246	19 May 2026	10.49	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	Beli tahu di kantin	-5000
247	19 May 2026	19.51	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	pengeluaran ke Duta Minang Family Jakal Sleman	-30000
248	19 May 2026	22.19	Pengeluaran	Lainnya	Bank Mandiri Livin	beli soto	-10000
249	20 May 2026	09.41	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	pengeluaran ke GRAB FOOD Jakarta Selatan	-15475
250	20 May 2026	15.45	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	Beli makan nasi sayur	-13000
251	20 May 2026	16.06	Pengeluaran	Transportasi	Bank Mandiri Livin	Transportasi ke takom	-5000
252	20 May 2026	18.39	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	Beli mie instan dan kopi di takom	-23000
253	20 May 2026	22.24	Pengeluaran	Lainnya	Bank Mandiri Livin	Beli nasi Padang	-14000
254	21 May 2026	08.55	Pengeluaran	Lainnya	Bank Mandiri Livin	pengeluaran ke nieta kitchen Sleman	-11000
255	21 May 2026	09.08	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	Beli Ades 600 ml (Dharma Wanita)	-4000
256	21 May 2026	13.05	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	Jajan pangsit Chili oil	-13000
257	21 May 2026	15.36	Pengeluaran	Lainnya	Bank Mandiri Livin	nge gym	-10000
258	21 May 2026	17.20	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	Makan nasi sayur krupuk	-9000
259	22 May 2026	16.50	Pengeluaran	Alkohol, tembakau	Bank Mandiri Livin	beli rokok 2 batang	-12500
260	22 May 2026	13.57	Pengeluaran	Lainnya	Bank Mandiri Livin	pengeluaran ke GRAB FOOD Jakarta Selatan	-15475
261	22 May 2026	11.41	Pengeluaran	Lainnya	Bank Mandiri Livin	pengeluaran ke GRAB TRANSPORT Jakarta Selatan	-6000
262	22 May 2026	08.45	Pengeluaran	Lainnya	Bank Mandiri Livin	pengeluaran ke Waroeng Emdje	-12000
263	22 May 2026	20.29	Pengeluaran	[Menunggu Kategori AI/User]	Bank Mandiri Livin	pengeluaran ke ACE BABERSHOP SLEMAN	-20000
264	22 May 2026	20.34	Pengeluaran	[Menunggu Kategori AI/User]	Bank Mandiri Livin	pengeluaran ke RM. PADANG PERGAULAN SLEMAN	-28000
265	22 May 2026	21.44	Pengeluaran	Pinjaman, bunga	Bank Mandiri Livin	Manghutangi aji	-25000
266	22 May 2026	21.44	Pengeluaran	Pinjaman, bunga	Bank Mandiri Livin	Untuk menghutangi aji	-27500
267	23 May 2026	10.08	Pengeluaran	Restoran, makanan cepat saji	Bank Mandiri Livin	Beli mie ayam	-15475
268	23 May 2026	17.09	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	beli batagor dan bayar bensin buat hasan	-15000
269	23 May 2026	21.43	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	Beli naspad	-14000
270	23 May 2026	22.25	Pengeluaran	Elektronik, aksesoris	Bank Mandiri Livin	Untuk COD HP Samsung terbaru	-2102500
271	24 May 2026	17.10	Pengeluaran	Alkohol, tembakau	Bank Mandiri Livin	Beli rokok dua batang	-5500
272	24 May 2026	17.28	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	Beli nasi sayur dan esteh	-12000
273	25 May 2026	07.12	Pengeluaran	Kesehatan dan kecantikan	Bank Mandiri Livin	Untuk topup shopee pay buat beli skincare	-51000
274	25 May 2026	08.31	Pengeluaran	Restoran, makanan cepat saji	Bank Mandiri Livin	beli magelangan	-16500
275	25 May 2026	09.01	Pengeluaran	Perawatan kendaraan	Bank Mandiri Livin	Untuk kirim bapak uang buat servis motor	-152500
276	25 May 2026	13.26	Pengeluaran	Internet	Bank Mandiri Livin	Buat beli kuota internet 11 gb	-40000
277	25 May 2026	13.38	Pengeluaran	Restoran, makanan cepat saji	Bank Mandiri Livin	beli nasi sayur ayam	-11500
278	25 May 2026	20.10	Pengeluaran	Restoran, makanan cepat saji	Bank Mandiri Livin	beli nasi sayur	-16000
279	25 May 2026	20.29	Pengeluaran	Layanan	Bank Mandiri Livin	pengeluaran ke OPAPER INTER INDONESIA JAKARTA PUSAT	-22000
280	26 May 2026	13.35	Pengeluaran	Pinjaman, bunga	Bank Mandiri Livin	Untuk menghutangi aji	-152500
281	27 May 2026	07.20	Pengeluaran	Bahan makanan	Bank Mandiri Livin	pengeluaran ke TOKO DIFA	-5000
282	27 May 2026	07.39	Pengeluaran	Restoran, makanan cepat saji	Bank Mandiri Livin	pengeluaran ke Warmindo Sami Asih Sleman	-13000
283	27 May 2026	16.53	Pengeluaran	Alkohol, tembakau	Bank Mandiri Livin	beli rokok 2 batang	-5500
284	27 May 2026	22.13	Pengeluaran	Restoran, makanan cepat saji	Bank Mandiri Livin	Beli makan malam dan bayar hutang Hasan 17 rb	-34000
285	27 May 2026	23.07	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	pengeluaran ke WARUNG BU RT	-17500
286	28 May 2026	13.50	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	pengeluaran ke warmindo	-14000
287	28 May 2026	13.57	Pengeluaran	Taksi	Bank Mandiri Livin	pengeluaran ke GRAB TRANSPORT Jakarta Selatan	-7000
288	28 May 2026	14.25	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	beli teh tarik di takom	-15000
289	28 May 2026	16.32	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	Untuk beli expreso di takom	-12000
290	29 May 2026	0.16	Pengeluaran	Makanan dan minuman	Bank Mandiri Livin	pengeluaran ke SABANA MURAH NAGA Sleman	-28000`;

const MONTHS = { 'may': '05' };

// Map manual data by Date and Amount for easy lookup
const manualLookup = [];
manualDataStr.split('\n').forEach(line => {
  const p = line.split('\t');
  if (p.length < 8) return;
  const rawDate = p[1].split(' ');
  const day = rawDate[0].padStart(2, '0');
  const monthStr = MONTHS[rawDate[1].toLowerCase()];
  const yyyy = rawDate[2];
  
  let c = p[4];
  let desc = p[6].replace(/&nbsp/g, '');
  if (c.includes('Menunggu Kategori AI')) {
    if (desc.toLowerCase().includes('babershop')) c = 'Kesehatan dan kecantikan';
    else if (desc.toLowerCase().includes('padang')) c = 'Restoran, makanan cepat saji';
    else c = 'Lainnya';
  }
  
  const amount = Math.abs(parseInt(p[7].replace(/[^0-9-]/g, '')));
  
  manualLookup.push({
    date: yyyy + '-' + monthStr + '-' + day,
    amount: amount,
    category: c,
    description: desc,
    used: false
  });
});

// Fallback logic for bank-only transactions
function inferCategoryFallback(desc, amount) {
  const d = desc.toLowerCase();
  if (d.includes('waroeng emdje')) return 'Lainnya'; 
  if (d.includes('grab transport')) return 'Transportasi';
  if (d.includes('grab food')) return 'Makanan dan minuman'; 
  if (d.includes('ace babershop')) return 'Kesehatan dan kecantikan';
  if (d.includes('penarikan tunai')) return 'Lainnya';
  if (d.includes('amira fotocopy')) return 'Alat tulis, peralatan';
  if (d.includes('bakmi jowo')) return 'Lainnya'; 
  if (d.includes('biaya transfer')) return 'Biaya, tarif';
  if (d.includes('biaya penarikan')) return 'Biaya, tarif';
  if (d.includes('biaya transaksi')) return 'Biaya, tarif';
  
  if (d.includes('sulxxxx fuaxx')) {
    if (amount === 150000 || amount === 25000 || amount === 27500) return 'Pinjaman, bunga';
    return 'Lainnya';
  }
  if (d.includes('rizqi hidayatulloh') && amount === 150000) return 'Perawatan kendaraan'; 
  if (d.includes('rizqi hidayatulloh') && amount > 1000000) return 'Pendapatan'; 
  if (d.includes('firman rahmandana')) return 'Elektronik, aksesoris'; 
  if (d.includes('espay debit') || d.includes('income')) return 'Pendapatan';
  return 'Lainnya'; 
}

const mdData = fs.readFileSync('tableConvert.com_hzg1dl.md', 'utf8');
let out = "BEGIN;\n\n";
const lines = mdData.split('\n');
let insertCounter = 237;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line.startsWith('|') || line.includes('---|---') || line.includes('No | Tanggal')) continue;
  
  const parts = line.split('|').map(p => p.trim());
  if (parts.length < 7) continue;
  
  const rawDate = parts[2].replace('PDF', '').trim();
  const rawTime = parts[3].replace('PDF', '').trim();
  const rawType = parts[4].replace('PDF', '').trim().toLowerCase();
  let bankDesc = parts[5].replace('PDF', '').trim();
  const rawAmount = parts[6].replace('PDF', '').trim();
  
  const dateParts = rawDate.split(' ');
  if (dateParts.length < 3) continue;
  const day = dateParts[0].padStart(2, '0');
  const mon = MONTHS[dateParts[1].toLowerCase()];
  const year = dateParts[2];
  const dt = year + '-' + mon + '-' + day;
  const timeStr = rawTime + ':00';
  
  const txType = rawType.includes('income') ? 'income' : 'expense';
  const amtClean = rawAmount.replace(/\./g, '').split(',')[0];
  const amt = Math.abs(parseInt(amtClean));
  
  // MERGE LOGIC: find matching transaction in manual data
  let finalDesc = bankDesc;
  let finalCategory = '';
  
  const matchIdx = manualLookup.findIndex(m => !m.used && m.date === dt && m.amount === amt);
  if (matchIdx !== -1) {
    // We found the manual record!
    if (manualLookup[matchIdx].description.includes('Menunggu Detail User') || manualLookup[matchIdx].description.includes('Menunggu Kategori AI')) {
      finalDesc = bankDesc;
    } else {
      finalDesc = manualLookup[matchIdx].description;
    }
    finalCategory = manualLookup[matchIdx].category;
    manualLookup[matchIdx].used = true;
  } else {
    // Use fallback for system-generated transactions (like bi fast fees)
    finalCategory = inferCategoryFallback(bankDesc, amt);
  }
  
  let pm = 'NULL';
  const dl = bankDesc.toLowerCase(); // always use bank desc for payment method detection
  if (dl.includes('qris') || dl.includes('pembayaran qr')) pm = "'QRIS'";
  else if (dl.includes('transfer')) pm = "'Transfer bank'";
  else if (dl.includes('tunai')) pm = "'Tunai'";

  out += "-- No. " + insertCounter + ": " + dt + " | " + finalCategory + " | Rp" + amt + "\n";
  out += "INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)\n";
  out += "SELECT\n";
  out += "  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),\n";
  out += "  (SELECT id FROM categories WHERE lower(name) LIKE lower('%" + finalCategory.replace(/'/g, "''") + "%') AND type='" + txType + "' LIMIT 1),\n";
  out += "  " + amt + ",\n";
  out += "  '" + txType + "',\n";
  out += "  '" + dt + "',\n";
  out += "  '" + timeStr + "',\n";
  out += "  '" + finalDesc.replace(/'/g, "''") + "',\n";
  out += "  " + pm + ";\n\n";
  
  insertCounter++;
}

out += "SELECT count(*) as total_inserted FROM transactions;\n\nROLLBACK;\n";
fs.writeFileSync('tools/insert_estatement.sql', out);
console.log('SQL Generated: tools/insert_estatement.sql');
