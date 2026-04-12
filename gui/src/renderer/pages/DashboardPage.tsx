import { useStore } from '../hooks/use-store'

export function DashboardPage() {
  const workspacePath = useStore((s) => s.workspacePath)

  if (!workspacePath) {
    return (
      <div className="flex h-full items-center justify-center text-[#86868b]">
        <p>Open a workspace to see your agents</p>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center text-[#86868b]">
      <p>Dashboard — loading...</p>
    </div>
  )
}
