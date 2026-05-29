import { Metadata } from 'next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SettingsCategories } from '@/components/settings/settings-categories';
import { SettingsAccounts } from '@/components/settings/settings-accounts';
import { Topbar } from '@/components/wallet/topbar';

export const metadata: Metadata = {
  title: 'Pengaturan - NEXA Finance',
  description: 'Kelola kategori, akun, dan preferensi aplikasi.',
};

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50/50 pb-20 sm:pb-0">
      <Topbar />

      <main className="flex-1 w-full max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pengaturan</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Kelola data utama Anda termasuk daftar kategori dan dompet.
          </p>
        </div>

        <Tabs defaultValue="categories" className="w-full">
          <TabsList className="grid w-full sm:w-[300px] grid-cols-2 mb-6 bg-slate-100">
            <TabsTrigger value="categories">Kategori</TabsTrigger>
            <TabsTrigger value="accounts">Akun</TabsTrigger>
          </TabsList>
          
          <TabsContent value="categories" className="mt-0">
            <SettingsCategories />
          </TabsContent>
          
          <TabsContent value="accounts" className="mt-0">
            <SettingsAccounts />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
