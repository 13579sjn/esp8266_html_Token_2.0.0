import { describe, expect, it } from 'vitest'

import {
  buildOneNetToken,
  buildRes,
  OneNetTokenError,
  urlEncodeStrict,
} from './onenet'

/**
 * 测试密钥是本地合成的 ASCII 字节（base64 后的 "0123456789abcdef..."），
 * 不是任何真实设备密钥。期望值由独立的 Node.js crypto HMAC 计算得到，
 * 作为固定输入 / 固定输出的已知答案测试。
 */
const KEY_B64 = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
const NOW_MS = 1893369600000 // 2030-01-01T00:00:00Z 减 24 小时

const BASE_INPUT = {
  productId: 'FRfr9m3Ppg',
  deviceName: 'OTA_Test_drive',
  keyBase64: KEY_B64,
  ttlSeconds: 86400,
  nowMs: NOW_MS,
}

const EXPECTED = {
  sha1: {
    sign: '1ggdD/lielO6g+W6j2nsLYh+Dr0=',
    signEncoded: '1ggdD%2FlielO6g%2BW6j2nsLYh%2BDr0%3D',
    token:
      'version=2018-10-31&res=products%2FFRfr9m3Ppg%2Fdevices%2FOTA_Test_drive&et=1893456000&method=sha1&sign=1ggdD%2FlielO6g%2BW6j2nsLYh%2BDr0%3D',
  },
  sha256: {
    sign: '5kuXP90sOPVyvGzd9oum55ShCv/ibiBDH+XUl/wZyso=',
    signEncoded: '5kuXP90sOPVyvGzd9oum55ShCv%2FibiBDH%2BXUl%2FwZyso%3D',
    token:
      'version=2018-10-31&res=products%2FFRfr9m3Ppg%2Fdevices%2FOTA_Test_drive&et=1893456000&method=sha256&sign=5kuXP90sOPVyvGzd9oum55ShCv%2FibiBDH%2BXUl%2FwZyso%3D',
  },
  md5: {
    sign: 'lFRPe1zbaFoc+0/1lTmKlg==',
    signEncoded: 'lFRPe1zbaFoc%2B0%2F1lTmKlg%3D%3D',
    token:
      'version=2018-10-31&res=products%2FFRfr9m3Ppg%2Fdevices%2FOTA_Test_drive&et=1893456000&method=md5&sign=lFRPe1zbaFoc%2B0%2F1lTmKlg%3D%3D',
  },
} as const

describe('OneNET Token 已知答案向量', () => {
  it.each(['sha1', 'sha256', 'md5'] as const)(
    '%s：HMAC 结果与完整 Token 均与参考实现一致',
    (method) => {
      const result = buildOneNetToken({ ...BASE_INPUT, method })

      expect(result.signBase64).toBe(EXPECTED[method].sign)
      expect(result.signEncoded).toBe(EXPECTED[method].signEncoded)
      expect(result.token).toBe(EXPECTED[method].token)
    },
  )

  it('签名原文严格为 et\\nmethod\\nres\\nversion，共 4 行', () => {
    const result = buildOneNetToken({ ...BASE_INPUT, method: 'sha1' })

    expect(result.stringForSignature).toBe(
      [
        '1893456000',
        'sha1',
        'products/FRfr9m3Ppg/devices/OTA_Test_drive',
        '2018-10-31',
      ].join('\n'),
    )
    expect(result.stringForSignature.split('\n')).toHaveLength(4)
  })

  it('et 为秒级时间戳，等于生成时间向下取整加有效期', () => {
    const result = buildOneNetToken({
      ...BASE_INPUT,
      method: 'sha1',
      nowMs: 1893369600123,
      ttlSeconds: 3600,
    })

    expect(result.et).toBe(1893369600 + 3600)
    expect(result.expiresAtMs).toBe(result.et * 1000)
    expect(result.et).toBeLessThan(1e11)
  })

  it('不同设备名称 / 产品 ID 会产生不同签名与不同 res', () => {
    const first = buildOneNetToken({ ...BASE_INPUT, method: 'sha1' })
    const second = buildOneNetToken({
      ...BASE_INPUT,
      method: 'sha1',
      deviceName: 'OTA_Test_drive_2',
    })
    const third = buildOneNetToken({
      ...BASE_INPUT,
      method: 'sha1',
      productId: 'AnotherPid1',
    })

    expect(second.signBase64).not.toBe(first.signBase64)
    expect(third.signBase64).not.toBe(first.signBase64)
    expect(second.token).toContain('devices%2FOTA_Test_drive_2')
    expect(third.token).toContain('products%2FAnotherPid1%2F')
  })

  it('不同有效期生成不同 et，并保持 et 为整数秒', () => {
    const oneHour = buildOneNetToken({
      ...BASE_INPUT,
      method: 'md5',
      ttlSeconds: 3600,
    })
    const sevenDays = buildOneNetToken({
      ...BASE_INPUT,
      method: 'md5',
      ttlSeconds: 604800,
    })

    expect(sevenDays.et - oneHour.et).toBe(604800 - 3600)
    expect(Number.isInteger(sevenDays.et)).toBe(true)
  })
})

describe('Token 格式与 URL 编码', () => {
  it('参数顺序为 version、res、et、method、sign，且只编码一次', () => {
    const result = buildOneNetToken({ ...BASE_INPUT, method: 'sha256' })
    const parts = result.token.split('&')

    expect(parts).toHaveLength(5)
    expect(parts[0]).toBe('version=2018-10-31')
    expect(parts[1].startsWith('res=products%2F')).toBe(true)
    expect(parts[2]).toBe('et=1893456000')
    expect(parts[3]).toBe('method=sha256')
    expect(parts[4].startsWith('sign=')).toBe(true)

    expect(result.token).not.toContain('%25')
    expect(result.token).not.toContain('products/FRfr9m3Ppg')
  })

  it('res 中的斜杠、sign 中的 + 与 = 均被编码', () => {
    const result = buildOneNetToken({ ...BASE_INPUT, method: 'sha1' })

    expect(result.resEncoded).toBe(
      'products%2FFRfr9m3Ppg%2Fdevices%2FOTA_Test_drive',
    )
    expect(result.signBase64).toContain('+')
    expect(result.signBase64).toContain('=')
    expect(result.signEncoded).toContain('%2B')
    expect(result.signEncoded).toContain('%3D')
    expect(result.signEncoded).not.toContain('+')
    expect(result.signEncoded).not.toContain('=')
  })

  it('urlEncodeStrict 编码 RFC 3986 保留字符', () => {
    expect(urlEncodeStrict("a/b+c=d !'()*~")).toBe(
      'a%2Fb%2Bc%3Dd%20%21%27%28%29%2A~',
    )
    expect(urlEncodeStrict('products/pid/devices/name')).toBe(
      'products%2Fpid%2Fdevices%2Fname',
    )
  })

  it('中文设备名称按 UTF-8 进行 URL 编码', () => {
    const result = buildOneNetToken({
      ...BASE_INPUT,
      method: 'sha1',
      deviceName: '测试设备-01',
    })

    expect(result.res).toBe('products/FRfr9m3Ppg/devices/测试设备-01')
    expect(result.resEncoded).toBe(
      'products%2FFRfr9m3Ppg%2Fdevices%2F%E6%B5%8B%E8%AF%95%E8%AE%BE%E5%A4%87-01',
    )
    expect(result.token).toContain(
      'res=products%2FFRfr9m3Ppg%2Fdevices%2F%E6%B5%8B%E8%AF%95%E8%AE%BE%E5%A4%87-01',
    )
  })

  it('method 参数是 sha1/sha256/md5，而不是 hmacsha1', () => {
    for (const method of ['sha1', 'sha256', 'md5'] as const) {
      const result = buildOneNetToken({ ...BASE_INPUT, method })
      expect(result.token).toContain(`&method=${method}&`)
      expect(result.token).not.toContain('hmac')
    }
  })

  it('不泄漏 Base64 密钥或其解码后的明文', () => {
    const result = buildOneNetToken({ ...BASE_INPUT, method: 'md5' })
    const decodedKey = '0123456789abcdef0123456789abcdef'

    expect(result.token).not.toContain(KEY_B64)
    expect(result.token).not.toContain(decodedKey)
    expect(result.stringForSignature).not.toContain(KEY_B64)
    expect(result.signBase64).not.toContain(KEY_B64)
    expect(result.decodedKeyBytes).toBe(32)
    expect(result.keyFingerprint).toMatch(/^[0-9a-f]{12}$/)
    expect(result.keyFingerprint).not.toContain(decodedKey)
  })
})

describe('输入校验', () => {
  it('空产品 ID / 设备名称会抛出对应字段错误', () => {
    expect(() =>
      buildOneNetToken({ ...BASE_INPUT, method: 'sha1', productId: '  ' }),
    ).toThrowError(OneNetTokenError)

    try {
      buildOneNetToken({ ...BASE_INPUT, method: 'sha1', deviceName: '' })
      throw new Error('应当抛出异常')
    } catch (error) {
      expect(error).toBeInstanceOf(OneNetTokenError)
      expect((error as OneNetTokenError).field).toBe('deviceName')
      expect((error as OneNetTokenError).code).toBe('EMPTY_DEVICE_NAME')
    }
  })

  it('空密钥 / 非法 Base64 会被拒绝', () => {
    expect(() =>
      buildOneNetToken({ ...BASE_INPUT, method: 'sha1', keyBase64: '' }),
    ).toThrowError(/设备密钥不能为空/)

    expect(() =>
      buildOneNetToken({ ...BASE_INPUT, method: 'sha1', keyBase64: 'not-base64!!' }),
    ).toThrowError(/Base64/)

    expect(() =>
      buildOneNetToken({ ...BASE_INPUT, method: 'sha1', keyBase64: 'abc' }),
    ).toThrowError(/4 的倍数/)
  })

  it('有效期超出 1 分钟 – 365 天会被拒绝', () => {
    for (const ttlSeconds of [0, 59, 365 * 86400 + 1]) {
      expect(() =>
        buildOneNetToken({ ...BASE_INPUT, method: 'sha1', ttlSeconds }),
      ).toThrowError(OneNetTokenError)
    }
  })

  it('产品 ID / 设备名称中的空白与斜杠会被拒绝', () => {
    for (const deviceName of ['bad name', 'bad/name', 'bad"name']) {
      expect(() =>
        buildOneNetToken({ ...BASE_INPUT, method: 'sha1', deviceName }),
      ).toThrowError(OneNetTokenError)
    }
    expect(() =>
      buildOneNetToken({ ...BASE_INPUT, method: 'sha1', productId: 'a/b' }),
    ).toThrowError(OneNetTokenError)
  })

  it('buildRes 遵循 products/{产品ID}/devices/{设备名称}', () => {
    expect(buildRes('FRfr9m3Ppg', 'OTA_Test_drive')).toBe(
      'products/FRfr9m3Ppg/devices/OTA_Test_drive',
    )
  })
})
