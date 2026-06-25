import { AppShell } from "@/components/wallet/app-shell"
import { BudgetView } from "@/components/wallet/budget-view"

export const metadata = {
  title: 'Anggaran | NEXA Finance',
}

export default function BudgetPage() {
  return (
    <AppShell>
      <BudgetView />
    </AppShell>
  )
}
