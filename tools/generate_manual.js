const fs = require('fs');
const d = `237	15 May 2026	18.26	Pengeluaran	Bahan makanan	Bank Mandiri Livin	untuk pembelian 7 buah mie instan	-19000
238	16 May 2026	08.14	Pengeluaran	Transportasi	Bank Mandiri Livin	[Menunggu Detail User]	-7000
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

let out = `BEGIN;\n\n`;
d.split('\n').forEach(l => {
  let p = l.split('\t');
  if (p.length < 8) return;
  let c = p[4];
  let desc = p[6];
  if (c.includes('Menunggu Kategori AI')) {
    if (desc.toLowerCase().includes('babershop')) c = 'Perawatan diri';
    else if (desc.toLowerCase().includes('padang')) c = 'Restoran, makanan cepat saji';
    else c = 'Lainnya';
  }
  let dP = p[1].split(' ');
  let dt = `${dP[2]}-05-${dP[0].padStart(2,'0')}`;
  let timeStr = p[2].replace('.', ':') + ':00';
  let amt = Math.abs(parseInt(p[7].replace(/[^0-9-]/g, '')));
  let descEscaped = desc.replace(/'/g, "''").replace(/&nbsp/g, "");
  let cEscaped = c.replace(/'/g, "''");
  
  let pm = 'NULL';
  if (desc.toLowerCase().includes('grab')) pm = "'QRIS'";
  else if (desc.toLowerCase().includes('qris')) pm = "'QRIS'";

  out += `-- No. ${p[0]}: ${dt} | ${c} | Rp${amt}\n`;
  out += `INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)\n`;
  out += `SELECT\n`;
  out += `  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),\n`;
  out += `  (SELECT id FROM categories WHERE lower(name) LIKE lower('%${cEscaped}%') AND type='expense' LIMIT 1),\n`;
  out += `  ${amt},\n`;
  out += `  'expense',\n`;
  out += `  '${dt}',\n`;
  out += `  '${timeStr}',\n`;
  out += `  '${descEscaped}',\n`;
  out += `  ${pm};\n\n`;
});

out += `SELECT count(*) as total_inserted FROM transactions;\n\nROLLBACK;\n`;
fs.writeFileSync('tools/insert_237_290.sql', out);
console.log('SQL Generated: tools/insert_237_290.sql');
