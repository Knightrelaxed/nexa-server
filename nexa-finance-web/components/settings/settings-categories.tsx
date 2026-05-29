"use client"

import { useState } from "react"
import { useCategories } from "@/hooks/use-finance-data"
import { createCategory, updateCategory, archiveCategory } from "@/lib/supabase/queries"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Edit2, Archive, Loader2 } from "lucide-react"
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

  const expenses = categories.filter(c => c.type === 'expense')
  const incomes = categories.filter(c => c.type === 'income')

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-800">Daftar Kategori</h2>
        <Button onClick={() => handleOpenModal()} className="bg-emerald-500 hover:bg-emerald-600">
          <Plus className="mr-2 h-4 w-4" /> Tambah Kategori
        </Button>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCat ? "Edit Kategori" : "Tambah Kategori Baru"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Nama Kategori</Label>
              <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Cth: Belanja Bulanan" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipe</Label>
                <Select value={formData.type} onValueChange={(val) => setFormData({...formData, type: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Pengeluaran</SelectItem>
                    <SelectItem value="income">Pemasukan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Grup (Hanya Pengeluaran)</Label>
                <Select disabled={formData.type === 'income'} value={formData.group_name} onValueChange={(val) => setFormData({...formData, group_name: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Makanan & Minuman">Makanan & Minuman</SelectItem>
                    <SelectItem value="Transportasi">Transportasi</SelectItem>
                    <SelectItem value="Belanja">Belanja</SelectItem>
                    <SelectItem value="Hiburan & Kehidupan">Hiburan</SelectItem>
                    <SelectItem value="Perumahan">Perumahan</SelectItem>
                    <SelectItem value="Kendaraan">Kendaraan</SelectItem>
                    <SelectItem value="Lainnya">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-500 hover:bg-emerald-600">
              {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
