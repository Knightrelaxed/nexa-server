"use client"

import { useState } from "react"
import { useAccounts } from "@/hooks/use-finance-data"
import { updateAccount, archiveAccount } from "@/lib/supabase/queries"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Edit2, Archive, Loader2, Wallet, Plus } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import type { DbAccount } from "@/lib/supabase/types"
import { formatIDR } from "@/lib/wallet-data"
import { AddAccountModal } from "@/components/wallet/add-account-modal"

export function SettingsAccounts() {
  const { accounts, loading, refetch } = useAccounts()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingAcc, setEditingAcc] = useState<DbAccount | null>(null)
  const [formData, setFormData] = useState({ name: "", type: "cash", initial_balance: 0 })
  const [isSaving, setIsSaving] = useState(false)

  const handleOpenEditModal = (acc: DbAccount) => {
    setEditingAcc(acc)
    setFormData({ name: acc.name, type: acc.type, initial_balance: acc.initial_balance })
    setIsEditModalOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name) return toast.error("Nama akun wajib diisi")
    setIsSaving(true)
    try {
      if (editingAcc) {
        await updateAccount(editingAcc.id, formData)
        toast.success("Akun berhasil diperbarui")
        await refetch()
      }
      setIsEditModalOpen(false)
    } catch (e: any) {
      toast.error("Gagal menyimpan akun", { description: e.message })
    } finally {
      setIsSaving(false)
    }
  }

  const handleArchive = async (id: string) => {
    if (!confirm("Arsipkan akun ini? Saldo dari akun ini tidak akan dihitung lagi di dasbor utama.")) return
    try {
      await archiveAccount(id)
      toast.success("Akun berhasil diarsipkan")
      await refetch()
    } catch (e: any) {
      toast.error("Gagal mengarsipkan akun", { description: e.message })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-800">Daftar Dompet / Akun</h2>
        <Button onClick={() => setIsAddModalOpen(true)} className="bg-emerald-500 hover:bg-emerald-600">
          <Plus className="mr-2 h-4 w-4" /> Tambah Akun
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-emerald-500" /></div>
      ) : (
        <Card>
          <CardHeader className="pb-3 border-b bg-slate-50/50">
            <CardTitle className="text-base text-slate-800">Akun Aktif</CardTitle>
            <CardDescription>Ubah saldo awal jika ada ketidaksesuaian dengan saldo asli.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {accounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#22d3ee] to-[#3b82f6] text-white shadow-sm">
                      <Wallet className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{acc.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 capitalize">{acc.type}</span>
                        <span className="text-xs text-muted-foreground">Saldo Awal: {formatIDR(acc.initial_balance)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
                    <div className="text-right mr-2 hidden sm:block">
                      <p className="text-xs text-muted-foreground">Saldo Saat Ini</p>
                      <p className="font-bold text-emerald-600">{formatIDR((acc as any).balance || 0)}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEditModal(acc)}><Edit2 className="h-4 w-4 text-slate-500" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleArchive(acc.id)}><Archive className="h-4 w-4 text-slate-400 hover:text-red-500" /></Button>
                    </div>
                  </div>
                </div>
              ))}
              {accounts.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">Belum ada akun terdaftar.</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gunakan Modal Add Account yang sudah ada */}
      <AddAccountModal open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSuccess={refetch} />

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Akun</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Nama Akun</Label>
              <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Cth: Bank BCA" />
            </div>
            <div className="space-y-2">
              <Label>Tipe</Label>
              <Select value={formData.type} onValueChange={(val) => setFormData({...formData, type: val})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank / Tabungan</SelectItem>
                  <SelectItem value="e-wallet">E-Wallet (OVO, Gopay)</SelectItem>
                  <SelectItem value="cash">Tunai / Dompet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Saldo Awal (Rp)</Label>
              <Input 
                type="number" 
                value={formData.initial_balance || ""} 
                onChange={(e) => setFormData({...formData, initial_balance: parseInt(e.target.value) || 0})} 
              />
              <p className="text-[11px] text-muted-foreground leading-tight mt-1">Ubah saldo awal ini jika perhitungan saldo saat ini tidak cocok dengan aslinya.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-500 hover:bg-emerald-600">
              {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
