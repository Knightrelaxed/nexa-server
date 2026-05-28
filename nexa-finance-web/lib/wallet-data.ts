import {
  Utensils, Bus, ShoppingBag, Film, Receipt, HeartPulse,
  Book, Briefcase, TrendingUp, Wifi, Wallet, MoreHorizontal,
  CreditCard, Wine, Coffee, Cake, Percent, type LucideIcon,
} from "lucide-react"

export const ICON_MAP: Record<string, LucideIcon> = {
  utensils: Utensils,
  bus: Bus,
  "shopping-bag": ShoppingBag,
  film: Film,
  receipt: Receipt,
  "heart-pulse": HeartPulse,
  book: Book,
  briefcase: Briefcase,
  "trending-up": TrendingUp,
  wifi: Wifi,
  wallet: Wallet,
  "more-horizontal": MoreHorizontal,
  "credit-card": CreditCard,
  wine: Wine,
  coffee: Coffee,
  cake: Cake,
  percent: Percent,
}

export const formatIDR = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount)
}
export const formatIDRFull = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export const formatIDRCompact = (amount: number) => {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? "-" : ""
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(2).replace(".", ",")} M`
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(2).replace(".", ",")} jt`
  if (abs >= 1_000) return `${sign}Rp ${(abs / 1_000).toFixed(0)} rb`
  return `${sign}Rp ${abs}`
}

export type Account = {
  id: string
  name: string
  type: string
  balance: number
  color: string
  dotColor: string
}

export const accounts: Account[] = [
  {
    id: "1",
    name: "Bank Mandiri Livin",
    type: "Bank",
    balance: 5293947,
    color: "bg-sky-100 text-sky-600",
    dotColor: "bg-sky-500",
  },
]

export type CategoryKey =
  | "makanan"
  | "transportasi"
  | "belanja"
  | "hiburan"
  | "tagihan"
  | "kesehatan"
  | "pendidikan"
  | "gaji"
  | "investasi"
  | "internet"
  | "pendapatan"
  | "lainnya"
  | "pinjaman"
  | "alkohol"
  | "bar"
  | "peristiwa"
  | "bunga"

export type Category = {
  name: string
  iconBg: string
  iconColor: string
  iconKey: string
}

export const categories: Record<CategoryKey, Category> = {
  makanan: { name: "Makanan & Minuman", iconBg: "bg-rose-100", iconColor: "text-rose-500", iconKey: "utensils" },
  transportasi: { name: "Transportasi", iconBg: "bg-blue-100", iconColor: "text-blue-600", iconKey: "bus" },
  belanja: { name: "Belanja", iconBg: "bg-pink-100", iconColor: "text-pink-500", iconKey: "shopping-bag" },
  hiburan: { name: "Hiburan & Kehidupan", iconBg: "bg-purple-100", iconColor: "text-purple-500", iconKey: "film" },
  tagihan: { name: "Tagihan & Utilitas", iconBg: "bg-yellow-100", iconColor: "text-yellow-600", iconKey: "receipt" },
  kesehatan: { name: "Kesehatan dan kecantikan", iconBg: "bg-cyan-100", iconColor: "text-cyan-600", iconKey: "heart-pulse" },
  pendidikan: { name: "Pendidikan", iconBg: "bg-indigo-100", iconColor: "text-indigo-500", iconKey: "book" },
  gaji: { name: "Gaji", iconBg: "bg-emerald-100", iconColor: "text-emerald-600", iconKey: "briefcase" },
  investasi: { name: "Investasi", iconBg: "bg-teal-100", iconColor: "text-teal-600", iconKey: "trending-up" },
  internet: { name: "Internet", iconBg: "bg-cyan-100", iconColor: "text-cyan-500", iconKey: "wifi" },
  pendapatan: { name: "Pendapatan", iconBg: "bg-amber-100", iconColor: "text-amber-500", iconKey: "wallet" },
  lainnya: { name: "Lainnya", iconBg: "bg-gray-100", iconColor: "text-gray-500", iconKey: "more-horizontal" },
  pinjaman: { name: "Pinjaman, bunga", iconBg: "bg-sky-100", iconColor: "text-sky-500", iconKey: "credit-card" },
  alkohol: { name: "Alkohol, tembakau", iconBg: "bg-emerald-100", iconColor: "text-emerald-500", iconKey: "wine" },
  bar: { name: "Bar, kafe", iconBg: "bg-rose-100", iconColor: "text-rose-400", iconKey: "coffee" },
  peristiwa: { name: "Peristiwa hidup", iconBg: "bg-green-100", iconColor: "text-green-500", iconKey: "cake" },
  bunga: { name: "Bunga, dividen", iconBg: "bg-amber-100", iconColor: "text-amber-500", iconKey: "percent" },
}

export type Transaction = {
  id: string
  date: string
  time: string
  description: string
  category: CategoryKey
  subCategory: string
  account: string
  amount: number
  type: "income" | "expense"
  badge?: string
}

// Transactions matching the reference screenshot (Maret 2026, Bank Mandiri Livin)
export const transactions: Transaction[] = [
  { id: "t1", date: "2026-03-18", time: "21.48", description: "beli nutriboost corner", category: "makanan", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 8000, type: "expense" },
  { id: "t2", date: "2026-03-17", time: "21.20", description: "beli mie instant dua", category: "makanan", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 9500, type: "expense" },
  { id: "t3", date: "2026-03-17", time: "16.00", description: "beli jus nanas + nanas potog", category: "makanan", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 19000, type: "expense" },
  { id: "t4", date: "2026-03-17", time: "16.00", description: "beli es bua", category: "makanan", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 9500, type: "expense" },
  { id: "t5", date: "2026-03-16", time: "21.20", description: "Mas Dayat minjem uang", category: "lainnya", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 1500000, type: "expense" },
  { id: "t6", date: "2026-03-16", time: "21.20", description: "Beli jus buan naga", category: "makanan", subCategory: "Faqih", account: "Bank Mandiri Livin", amount: 10000, type: "expense" },
  { id: "t7", date: "2026-03-16", time: "17.11", description: "potong rambut", category: "kesehatan", subCategory: "faqiih", account: "Bank Mandiri Livin", amount: 20000, type: "expense" },
  { id: "t8", date: "2026-03-15", time: "14.10", description: "beli es teh tarik", category: "makanan", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 5000, type: "expense" },
  { id: "t9", date: "2026-03-15", time: "03.22", description: "beli sahur", category: "makanan", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 9500, type: "expense" },
  { id: "t10", date: "2026-03-15", time: "03.21", description: "Bayar Hutang Aji", category: "pinjaman", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 100000, type: "expense" },
  { id: "t11", date: "2026-03-15", time: "01.58", description: "Beli indomie sambil bayar hutang pas nongkrong", category: "makanan", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 17500, type: "expense" },
  { id: "t12", date: "2026-03-15", time: "00.43", description: "Jardine scholarship (Biaya hidup triwulan kedua semester 1)", category: "pendapatan", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 3600000, type: "income" },
  { id: "t13", date: "2026-03-14", time: "03.21", description: "beli sahur", category: "makanan", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 9000, type: "expense" },
  { id: "t14", date: "2026-03-14", time: "23.59", description: "biaya administrasi kartu debit", category: "bunga", subCategory: "automatic", account: "Bank Mandiri Livin", amount: 5500, type: "expense", badge: "Biaya Admin" },
  { id: "t15", date: "2026-03-13", time: "13.12", description: "beli jajan buat girlfriend", category: "peristiwa", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 51000, type: "expense" },
  { id: "t16", date: "2026-03-13", time: "03.06", description: "beli makan sahur", category: "makanan", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 7500, type: "expense" },
  { id: "t17", date: "2026-03-12", time: "21.23", description: "pulang dari bukber gugus", category: "transportasi", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 6500, type: "expense" },
  { id: "t18", date: "2026-03-12", time: "18.03", description: "Berangkat Grab untuk bukber", category: "transportasi", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 6500, type: "expense" },
  { id: "t19", date: "2026-03-12", time: "17.30", description: "Beli Kuota 10 GB 28 Hari Im3", category: "internet", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 36000, type: "expense" },
  { id: "t20", date: "2026-03-11", time: "14.40", description: "bukber gugus pionir dan foto studio", category: "bar", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 40500, type: "expense" },
  { id: "t21", date: "2026-03-11", time: "21.38", description: "beli kwiteaw 1", category: "makanan", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 16000, type: "expense" },
  { id: "t22", date: "2026-03-10", time: "21.34", description: "beli rokok 76 mangga 1 bungkus", category: "alkohol", subCategory: "faqih", account: "Bank Mandiri Livin", amount: 17500, type: "expense" },
]

export const monthlyData = [
  { month: "Sep", income: 3200000, expense: 2100000 },
  { month: "Okt", income: 3500000, expense: 2400000 },
  { month: "Nov", income: 3800000, expense: 2200000 },
  { month: "Des", income: 4100000, expense: 2800000 },
  { month: "Jan", income: 4200000, expense: 4350000 },
  { month: "Feb", income: 4500000, expense: 4300000 },
  { month: "Mar", income: 3600000, expense: 1904000 },
]

// Daily balance trend for Maret 2026
export const balanceTrend = [
  { day: "1 Mar", saldo: 3500000 },
  { day: "4 Mar", saldo: 3500000 },
  { day: "7 Mar", saldo: 3500000 },
  { day: "10 Mar", saldo: 3482500 },
  { day: "11 Mar", saldo: 3426000 },
  { day: "12 Mar", saldo: 3377000 },
  { day: "13 Mar", saldo: 3318500 },
  { day: "14 Mar", saldo: 6913000 },
  { day: "15 Mar", saldo: 6781500 },
  { day: "18 Mar", saldo: 5293947 },
  { day: "22 Mar", saldo: 5293947 },
  { day: "26 Mar", saldo: 5293947 },
  { day: "31 Mar", saldo: 5293947 },
]

// Period comparison data (3 series)
export const comparisonTrend = [
  { day: "1 Mar", current: 0, prevYear: 0, previous: 0 },
  { day: "4 Mar", current: 0, prevYear: 0, previous: 0 },
  { day: "7 Mar", current: 0, prevYear: 0, previous: 0 },
  { day: "10 Mar", current: -17500, prevYear: 0, previous: 1200000 },
  { day: "14 Mar", current: 1500000, prevYear: 0, previous: 2800000 },
  { day: "18 Mar", current: 1696000, prevYear: 0, previous: 3850000 },
  { day: "22 Mar", current: 1696000, prevYear: 0, previous: 3850000 },
  { day: "26 Mar", current: 1696000, prevYear: 0, previous: 3850000 },
  { day: "31 Mar", current: 1696000, prevYear: 0, previous: 3850000 },
]
