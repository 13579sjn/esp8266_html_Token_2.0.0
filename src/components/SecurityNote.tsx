import { LockIcon, ShieldIcon } from './Icons'

export function SecurityNote() {
  return (
    <aside className="security-note" aria-labelledby="security-title">
      <div className="security-head">
        <span className="security-icon">
          <ShieldIcon size={18} />
        </span>
        <div>
          <h2 id="security-title">密钥安全</h2>
          <p className="security-kicker">LOCAL ONLY · NO STORAGE</p>
        </div>
        <LockIcon size={15} className="security-lock" />
      </div>

      <p className="security-warning">
        请勿在公共电脑或不可信网页中输入真实设备密钥。
      </p>

      <ul className="security-list">
        <li>密钥与 Token 只在当前浏览器内存中参与计算，不上传、不记录、不写入任何存储。</li>
        <li>刷新或重新打开页面后密钥不会恢复；切换到其他标签页时会自动清空密钥输入。</li>
        <li>Token 等同于 MQTT 密码，复制后请避免粘贴到聊天工具、截图或公开仓库。</li>
      </ul>

      <div className="security-foot">
        <span>无账号</span>
        <span>无后端</span>
        <span>无第三方请求</span>
      </div>
    </aside>
  )
}
