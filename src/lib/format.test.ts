import { describe, expect, it } from 'vitest'

import {
  formatBytes,
  formatDateTime,
  formatDateTimeFromSeconds,
  formatRemaining,
  formatTtl,
} from './format'

describe('格式化工具', () => {
  it('有效期按天 / 小时 / 分钟 / 秒展示', () => {
    expect(formatTtl(86400)).toBe('1 天')
    expect(formatTtl(604800)).toBe('7 天')
    expect(formatTtl(3600)).toBe('1 小时')
    expect(formatTtl(5400)).toBe('90 分钟')
    expect(formatTtl(90)).toBe('90 秒')
  })

  it('倒计时超过一天时保留天数', () => {
    expect(formatRemaining(90061000)).toBe('1 天 01:01:01')
    expect(formatRemaining(3661000)).toBe('01:01:01')
    expect(formatRemaining(0)).toBe('00:00:00')
    expect(formatRemaining(-5000)).toBe('00:00:00')
  })

  it('时间戳按本地时区格式化为可读时间', () => {
    expect(formatDateTime(0)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(formatDateTimeFromSeconds(1893456000)).toBe(
      formatDateTime(1893456000 * 1000),
    )
  })

  it('字节数展示', () => {
    expect(formatBytes(32)).toBe('32 字节')
  })
})
