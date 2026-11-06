import { BrandMark, MoonIcon, ShieldIcon, SunIcon } from './Icons'

export type ThemeMode = 'light' | 'dark'
export type ViewMode = 'token' | 'data'

interface HeaderProps {
  nowSeconds: number
  theme: ThemeMode
  view: ViewMode
  onToggleTheme: () => void
  onViewChange: (view: ViewMode) => void
}

export function Header({
  nowSeconds,
  theme,
  view,
  onToggleTheme,
  onViewChange,
}: HeaderProps) {
  const isDark = theme === 'dark'

  return (
    <header className="masthead">
      <a className="brand" href="#top" aria-label="OneNET Token Generator 首页">
        <BrandMark />
        <span className="brand-text">
          <span className="brand-name">OneNET</span>
          <span className="brand-sub">Token Generator</span>
        </span>
      </a>

      <div className="masthead-meta">
        <div
          className={`view-switch${view === 'data' ? ' is-data' : ''}`}
          role="group"
          aria-label="工作台视图"
        >
          <span className="view-switch-thumb" aria-hidden="true" />
          <button
            type="button"
            className={view === 'token' ? 'is-active' : ''}
            aria-pressed={view === 'token'}
            onClick={() => onViewChange('token')}
            title="密钥参数与生成结果"
          >
            密钥
          </button>
          <button
            type="button"
            className={view === 'data' ? 'is-active' : ''}
            aria-pressed={view === 'data'}
            onClick={() => onViewChange('data')}
            title="数据通信报文"
          >
            报文
          </button>
        </div>

        <div className="unix-clock" title="当前 Unix 时间戳（秒），用于计算 et">
          <span className="live-dot" aria-hidden="true" />
          <span className="clock-label">UNIX</span>
          <span className="clock-value">{nowSeconds}</span>
        </div>

        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label={isDark ? '切换为浅色主题' : '切换为深色主题'}
          aria-pressed={isDark}
          title={isDark ? '切换为浅色主题' : '切换为深色主题'}
        >
          {isDark ? <SunIcon size={15} /> : <MoonIcon size={15} />}
          <span className="theme-label">{isDark ? '浅色' : '深色'}</span>
        </button>

        <span className="local-badge">
          <ShieldIcon size={14} />
          本地计算 · 不上传
        </span>
      </div>
    </header>
  )
}
