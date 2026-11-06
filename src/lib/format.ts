/** 时间与时长展示工具。所有时间都以浏览器本地时区呈现。 */

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function formatDateTime(ms: number): string {
  return DATE_TIME_FORMATTER.format(new Date(ms)).replace(/\//g, '-')
}

export function formatDateTimeFromSeconds(seconds: number): string {
  return formatDateTime(seconds * 1000)
}

export function formatTtl(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400} 天`
  if (seconds % 3600 === 0) return `${seconds / 3600} 小时`
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`
  return `${seconds} 秒`
}

/**
 * 把剩余毫秒格式化为倒计时文本。
 * 超过 1 天时保留“天”，否则固定 HH:MM:SS，方便逐秒刷新时宽度稳定。
 */
export function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const clock = [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')

  return days > 0 ? `${days} 天 ${clock}` : clock
}

export function formatBytes(count: number): string {
  return `${count} 字节`
}
