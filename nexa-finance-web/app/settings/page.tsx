import { Metadata } from 'next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SettingsCategories } from '@/components/settings/settings-categories';
import { SettingsAccounts } from '@/components/settings/settings-accounts';
import { AppShell } from '@/components/wallet/app-shell';

export const metadata: Metadata = {
  title: 'Pengaturan - NEXA Finance',
  description: 'Kelola kategori, akun, dan preferensi aplikasi.',
};

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mb-6 px-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pengaturan</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Kelola data utama Anda termasuk daftar kategori dan dompet.
        </p>
      </div>

        <Tabs defaultValue="categories" className="w-full">
          <TabsList className="grid w-full sm:w-[300px] grid-cols-2 mb-6 bg-slate-100/80 p-1 rounded-xl">
            <TabsTrigger 
              value="categories"
              className="rounded-lg data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300 text-slate-600"
            >
              Kategori
            </TabsTrigger>
            <TabsTrigger 
              value="accounts"
              className="rounded-lg data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300 text-slate-600"
            >
              Akun
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="categories" className="mt-0">
            <SettingsCategories />
          </TabsContent>
          
          <TabsContent value="accounts" className="mt-0">
            <SettingsAccounts />
          </TabsContent>
        </Tabs>
    </AppShell>
  );
}
