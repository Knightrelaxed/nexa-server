const fs = require('fs');
const mdData = fs.readFileSync('tableConvert.com_hzg1dl.md', 'utf8');

const MONTHS = { 'may': '05' };

function inferCategory(desc, amount) {
  const d = desc.toLowerCase();
  if (d.includes('waroeng emdje')) return 'Lainnya'; 
  if (d.includes('grab transport')) return 'Transportasi';
  if (d.includes('grab food')) return 'Makanan dan minuman'; 
  if (d.includes('mom barokah')) return 'Makanan dan minuman';
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
  
  if (d.includes('nieta kitchen')) return 'Lainnya';
  if (d.includes('tahu kalcer')) return 'Makanan dan minuman';
  if (d.includes('warung p. supardi')) return 'Makanan dan minuman';
  if (d.includes('duta minang family')) return 'Makanan dan minuman';
  if (d.includes('opaper inter indonesia')) return 'Layanan'; 
  if (d.includes('rm. padang pergaulan')) return 'Restoran, makanan cepat saji';
  if (d.includes('kedai alika')) return 'Makanan dan minuman';
  if (d.includes('gadjah mada medical')) return 'Lainnya'; 
  if (d.includes('bisnis')) {
     if (amount === 12500 || amount === 5500) return 'Alkohol, tembakau';
     return 'Lainnya';
  }
  if (d.includes('ace babershop')) return 'Perawatan diri';
  if (d.includes('siomay dan batagor')) return 'Makanan dan minuman';
  if (d.includes('espay debit') || d.includes('income')) return 'Pendapatan';
  if (d.includes('firman rahmandana') && amount === 2100000) return 'Elektronik, aksesoris'; 
  if (d.includes('shopeepay') && amount === 50000) return 'Kesehatan dan kecantikan';
  if (d.includes('warmindo maharasa')) return 'Restoran, makanan cepat saji';
  if (d.includes('ioh') && amount === 40000) return 'Internet';
  if (d.includes('warung tentrem')) return 'Restoran, makanan cepat saji';
  if (d.includes('warung makan rizky')) return 'Restoran, makanan cepat saji';
  if (d.includes('toko difa')) return 'Bahan makanan';
  if (d.includes('warmindo sami asih')) return 'Restoran, makanan cepat saji';
  if (d.includes('kedai harvest')) return 'Restoran, makanan cepat saji';
  if (d.includes('warung bu rt')) return 'Makanan dan minuman';
  if (d.includes('warmindo biru')) return 'Makanan dan minuman';
  if (d.includes('sabana murah naga')) return 'Makanan dan minuman';

  return 'Lainnya'; 
}

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
  const desc = parts[5].replace('PDF', '').trim();
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
  
  const category = inferCategory(desc, amt);
  
  let pm = 'NULL';
  const dl = desc.toLowerCase();
  if (dl.includes('qris') || dl.includes('pembayaran qr')) pm = "'QRIS'";
  else if (dl.includes('transfer')) pm = "'Transfer bank'";
  else if (dl.includes('tunai')) pm = "'Tunai'";

  out += "-- No. " + insertCounter + ": " + dt + " | " + category + " | Rp" + amt + "\n";
  out += "INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)\n";
  out += "SELECT\n";
  out += "  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),\n";
  out += "  (SELECT id FROM categories WHERE lower(name) LIKE lower('%" + category.replace(/'/g, "''") + "%') AND type='" + txType + "' LIMIT 1),\n";
  out += "  " + amt + ",\n";
  out += "  '" + txType + "',\n";
  out += "  '" + dt + "',\n";
  out += "  '" + timeStr + "',\n";
  out += "  '" + desc.replace(/'/g, "''") + "',\n";
  out += "  " + pm + ";\n\n";
  
  insertCounter++;
}

out += "SELECT count(*) as total_inserted FROM transactions;\n\nROLLBACK;\n";
fs.writeFileSync('tools/insert_estatement.sql', out);
console.log('SQL Generated: tools/insert_estatement.sql');
