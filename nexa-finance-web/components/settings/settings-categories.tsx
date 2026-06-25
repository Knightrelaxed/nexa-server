"use client"

import { useState } from "react"
import { useCategories } from "@/hooks/use-finance-data"
import { createCategory, updateCategory, archiveCategory, fetchArchivedCategories, unarchiveCategory } from "@/lib/supabase/queries"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Edit2, Archive, Loader2, ArchiveRestore } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import type { DbCategory } from "@/lib/supabase/types"
import { ICON_MAP } from "@/lib/icon-map"

export function SettingsCategories() {
  const { categories, loading, refetch } = useCategories()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCat, setEditingCat] = useState<DbCategory | null>(null)
  const [formData, setFormData] = useState({ name: "", type: "expense", icon_key: "shopping-bag", group_name: "Lainnya" })
  const [isSaving, setIsSaving] = useState(false)
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false)
  const [archivedCategories, setArchivedCategories] = useState<DbCategory[]>([])
  const [isLoadingArchived, setIsLoadingArchived] = useState(false)

  const handleOpenModal = (cat?: DbCategory) => {
    if (cat) {
      setEditingCat(cat)
      setFormData({ name: cat.name, type: cat.type, icon_key: cat.icon_key, group_name: cat.group_name || "Lainnya" })
    } else {
      setEditingCat(null)
      setFormData({ name: "", type: "expense", icon_key: "shopping-bag", group_name: "Lainnya" })
    }
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name) return toast.error("Nama kategori wajib diisi")
    setIsSaving(true)
    try {
      if (editingCat) {
        await updateCategory(editingCat.id, formData)
        toast.success("Kategori berhasil diperbarui")
      } else {
        await createCategory(formData)
        toast.success("Kategori berhasil ditambahkan")
      }
      await refetch()
      setIsModalOpen(false)
    } catch (e: any) {
      toast.error("Gagal menyimpan kategori", { description: e.message })
    } finally {
      setIsSaving(false)
    }
  }

  const handleArchive = async (id: string) => {
    if (!confirm("Arsipkan kategori ini? Kategori tidak akan muncul lagi di pilihan, namun data lama tetap aman.")) return
    try {
      await archiveCategory(id)
      toast.success("Kategori berhasil diarsipkan")
      await refetch()
    } catch (e: any) {
      toast.error("Gagal mengarsipkan kategori", { description: e.message })
    }
  }

  const handleOpenArchive = async () => {
    setIsArchiveModalOpen(true)
    setIsLoadingArchived(true)
    try {
      const data = await fetchArchivedCategories()
      setArchivedCategories(data)
    } catch (e: any) {
      toast.error("Gagal mengambil data arsip")
    } finally {
      setIsLoadingArchived(false)
    }
  }

  const handleRestore = async (id: string) => {
    try {
      await unarchiveCategory(id)
      toast.success("Kategori berhasil dipulihkan")
      await refetch()
      setArchivedCategories(prev => prev.filter(c => c.id !== id))
    } catch (e: any) {
      toast.error("Gagal memulihkan kategori", { description: e.message })
    }
  }

  const expenses = categories.filter(c => c.type === 'expense')
  const incomes = categories.filter(c => c.type === 'income')

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-800">Daftar Kategori</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleOpenArchive} className="text-gray-500 hover:text-gray-700 border-gray-300 hover:bg-gray-100">
            <Archive className="mr-2 h-4 w-4" /> Arsip
          </Button>
          <Button onClick={() => handleOpenModal()} className="bg-emerald-500 hover:bg-emerald-600">
            <Plus className="mr-2 h-4 w-4" /> Tambah Kategori
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-emerald-500" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] overflow-hidden">
            <CardHeader className="pb-3 border-b bg-slate-50/50 px-5">
              <CardTitle className="text-[14px] font-bold text-red-500 uppercase tracking-wide">Pengeluaran</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {expenses.map((c) => {
                  const Icon = ICON_MAP[c.icon_key] || ICON_MAP['more-horizontal']
                  return (
                    <div key={c.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-red-100 text-red-600`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm text-slate-900">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.group_name}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenModal(c)}><Edit2 className="h-4 w-4 text-slate-500" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleArchive(c.id)}><Archive className="h-4 w-4 text-slate-400 hover:text-red-500" /></Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] overflow-hidden">
            <CardHeader className="pb-3 border-b bg-slate-50/50 px-5">
              <CardTitle className="text-[14px] font-bold text-emerald-500 uppercase tracking-wide">Pemasukan</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {incomes.map((c) => {
                  const Icon = ICON_MAP[c.icon_key] || ICON_MAP['more-horizontal']
                  return (
                    <div key={c.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-emerald-100 text-emerald-600`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm text-slate-900">{c.name}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenModal(c)}><Edit2 className="h-4 w-4 text-slate-500" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleArchive(c.id)}><Archive className="h-4 w-4 text-slate-400 hover:text-red-500" /></Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="w-[92vw] max-w-md p-0 overflow-hidden rounded-2xl border-0 shadow-2xl gap-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-xl font-bold text-slate-800">{editingCat ? "Edit Kategori" : "Tambah Kategori Baru"}</h2>
          </div>
          <div className="px-6 py-5 flex flex-col gap-5 bg-white">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-800">Nama Kategori <span className="text-red-500">*</span></Label>
              <Input 
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                placeholder="Cth: Belanja Bulanan" 
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-emerald-500"
              />
            </div>
            <div className="grid grid-cols-[1fr_1fr] gap-4">
              <div className="space-y-1.5 min-w-0">
                <Label className="text-sm font-semibold text-slate-800">Tipe</Label>
                <Select value={formData.type} onValueChange={(val) => setFormData({...formData, type: val})}>
                  <SelectTrigger className="w-full h-11 rounded-xl border-slate-200 focus:ring-emerald-500">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Pengeluaran</SelectItem>
                    <SelectItem value="income">Pemasukan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-sm font-semibold text-slate-800 truncate block" title="Grup (Khusus Pengeluaran)">Grup Kategori</Label>
                <Select disabled={formData.type === 'income'} value={formData.group_name} onValueChange={(val) => setFormData({...formData, group_name: val})}>
                  <SelectTrigger className="w-full h-11 rounded-xl border-slate-200 focus:ring-emerald-500 disabled:opacity-50 disabled:bg-slate-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Makanan & Minuman">Makanan & Minuman</SelectItem>
                    <SelectItem value="Perumahan & Kamar">Perumahan & Kamar</SelectItem>
                    <SelectItem value="Transportasi">Transportasi</SelectItem>
                    <SelectItem value="Komunikasi">Komunikasi</SelectItem>
                    <SelectItem value="Gaya Hidup & Sosial">Gaya Hidup & Sosial</SelectItem>
                    <SelectItem value="Kesehatan">Kesehatan</SelectItem>
                    <SelectItem value="Perawatan & Kecantikan">Perawatan & Kecantikan</SelectItem>
                    <SelectItem value="Belanja">Belanja</SelectItem>
                    <SelectItem value="Administrasi & Kewajiban">Administrasi & Kewajiban</SelectItem>
                    <SelectItem value="Investasi">Investasi</SelectItem>
                    <SelectItem value="Penyesuaian (Sistem)">Penyesuaian (Sistem)</SelectItem>
                    <SelectItem value="Lainnya">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="mt-2 flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setIsModalOpen(false)}
                className="h-12 flex-1 rounded-xl font-semibold border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Batal
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={isSaving || !formData.name.trim()} 
                className="h-12 flex-1 rounded-xl font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-sm"
              >
                {isSaving ? <Loader2 className="animate-spin h-5 w-5" /> : "Simpan"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL KATEGORI ARSIP */}
      <Dialog open={isArchiveModalOpen} onOpenChange={setIsArchiveModalOpen}>
        <DialogContent className="w-[92vw] max-w-lg p-0 overflow-hidden rounded-2xl border-0 shadow-2xl gap-0 bg-slate-50">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Archive className="h-5 w-5 text-slate-500" /> Kategori Diarsipkan
            </h2>
          </div>
          <div className="p-4 max-h-[60vh] overflow-y-auto">
            {isLoadingArchived ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-slate-400" /></div>
            ) : archivedCategories.length === 0 ? (
              <div className="text-center p-8 text-slate-500">Tidak ada kategori di arsip.</div>
            ) : (
              <div className="space-y-3">
                {archivedCategories.map(c => {
                  const Icon = ICON_MAP[c.icon_key] || ICON_MAP['more-horizontal']
                  return (
                    <div key={c.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200/60 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-slate-100 text-slate-500`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm text-slate-900">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.type === 'income' ? 'Pemasukan' : 'Pengeluaran'} • {c.group_name || "Lainnya"}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleRestore(c.id)} className="h-8 text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                        <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Pulihkan
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
