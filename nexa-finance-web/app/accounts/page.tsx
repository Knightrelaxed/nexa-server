import { AppShell } from "@/components/wallet/app-shell"
import { AccountsView } from "@/components/wallet/accounts-view"

export const metadata = {
  title: "Akun - Nexa Finance",
  description: "Kelola akun keuangan Anda",
}

export default function AccountsPage() {
  return (
    <AppShell>
      <AccountsView />
    </AppShell>
  )
}
