import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'

interface NotificationSettings {
  mac?: boolean
  telegram?: {
    enabled: boolean
    botToken: string
    chatId: string
  }
}

interface Settings {
  recentWorkspaces: string[]
  notifications?: NotificationSettings
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings)
  }, [])

  if (!settings) return null

  const notif = settings.notifications || {}
  const tg = notif.telegram || { enabled: false, botToken: '', chatId: '' }

  const update = (patch: Partial<NotificationSettings>) => {
    const updated = { ...settings, notifications: { ...notif, ...patch } }
    setSettings(updated)
    window.electronAPI.saveSettings(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const updateTg = (patch: Partial<typeof tg>) => {
    update({ telegram: { ...tg, ...patch } })
  }

  return (
    <div className="flex flex-1 overflow-auto">
      <div className="w-full max-w-lg mx-auto p-8 space-y-8">
        <h1 className="text-[15px] font-medium text-foreground/90">Settings</h1>

        {/* Notifications */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="ao-heading">Notifications</span>
            {saved && (
              <span className="text-[11px] text-green-400 flex items-center gap-1">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
          </div>

          {/* macOS */}
          <div className="ao-card">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-[13px] text-foreground/80">macOS Notifications</div>
                <div className="text-[11px] text-muted-foreground/60">Show native notification when pipeline completes</div>
              </div>
              <Toggle
                checked={notif.mac !== false}
                onChange={(v) => update({ mac: v })}
              />
            </div>
          </div>

          {/* Telegram */}
          <div className="ao-card">
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] text-foreground/80">Telegram</div>
                  <div className="text-[11px] text-muted-foreground/60">Send notifications via Telegram bot</div>
                </div>
                <Toggle
                  checked={tg.enabled}
                  onChange={(v) => updateTg({ enabled: v })}
                />
              </div>

              {tg.enabled && (
                <div className="space-y-2 pt-1">
                  <div className="space-y-1">
                    <label className="ao-label">Bot Token</label>
                    <input
                      type="password"
                      className="ao-input"
                      value={tg.botToken}
                      onChange={(e) => updateTg({ botToken: e.target.value })}
                      placeholder="123456:ABC-DEF..."
                    />
                    <div className="text-[10px] text-muted-foreground/40">Get from @BotFather on Telegram</div>
                  </div>
                  <div className="space-y-1">
                    <label className="ao-label">Chat ID</label>
                    <input
                      className="ao-input"
                      value={tg.chatId}
                      onChange={(e) => updateTg({ chatId: e.target.value })}
                      placeholder="Your numeric chat ID"
                    />
                    <div className="text-[10px] text-muted-foreground/40">Send /start to @userinfobot to get your ID</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-8 h-[18px] rounded-full transition-colors duration-150 ${
        checked ? 'bg-foreground/70' : 'bg-foreground/10'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-background transition-transform duration-150 ${
          checked ? 'translate-x-[14px]' : ''
        }`}
      />
    </button>
  )
}
