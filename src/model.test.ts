import { describe, expect, it } from 'vitest'

import { buildOneNetToken } from './lib/onenet'
import {
  DEFAULT_FORM,
  countErrors,
  isResultStale,
  ttlSecondsFrom,
  validateForm,
  type FormValues,
  type TokenResult,
} from './model'

const KEY_B64 = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
const NOW_MS = 1893369600000

const VALID_FORM: FormValues = { ...DEFAULT_FORM, keyBase64: KEY_B64 }

function makeResult(overrides: Partial<FormValues> = {}): TokenResult {
  const form = { ...VALID_FORM, ...overrides }
  const computation = buildOneNetToken({
    productId: form.productId,
    deviceName: form.deviceName,
    keyBase64: form.keyBase64,
    method: form.method,
    ttlSeconds: 86400,
    nowMs: NOW_MS,
  })
  return { ...computation, productName: form.productName.trim() }
}

describe('表单校验', () => {
  it('完整输入通过校验', () => {
    const { errors, ttlSeconds } = validateForm(VALID_FORM)

    expect(errors).toEqual({})
    expect(ttlSeconds).toBe(86400)
    expect(countErrors(errors)).toBe(0)
  })

  it('缺少密钥 / 产品 ID / 设备名称时给出错误', () => {
    const { errors } = validateForm({
      ...DEFAULT_FORM,
      productId: '',
      deviceName: '',
    })

    expect(errors.productId).toContain('产品 ID')
    expect(errors.deviceName).toContain('设备名称')
    expect(errors.keyBase64).toContain('设备密钥')
    expect(countErrors(errors)).toBe(3)
  })

  it('非法 Base64 密钥给出明确错误', () => {
    const { errors } = validateForm({ ...VALID_FORM, keyBase64: 'not-base64!!' })

    expect(errors.keyBase64).toContain('无效')
    expect(errors.keyBase64).toContain('Base64')
  })

  it('预置有效期换算为秒', () => {
    expect(ttlSecondsFrom({ ...VALID_FORM, preset: '1h' })).toBe(3600)
    expect(ttlSecondsFrom({ ...VALID_FORM, preset: '24h' })).toBe(86400)
    expect(ttlSecondsFrom({ ...VALID_FORM, preset: '7d' })).toBe(604800)
  })

  it('自定义有效期支持分钟 / 小时 / 天', () => {
    expect(
      ttlSecondsFrom({
        ...VALID_FORM,
        preset: 'custom',
        customValue: '90',
        customUnit: 'minutes',
      }),
    ).toBe(5400)

    expect(
      ttlSecondsFrom({
        ...VALID_FORM,
        preset: 'custom',
        customValue: '1.5',
        customUnit: 'hours',
      }),
    ).toBe(5400)

    expect(
      ttlSecondsFrom({
        ...VALID_FORM,
        preset: 'custom',
        customValue: '2',
        customUnit: 'days',
      }),
    ).toBe(172800)
  })

  it('自定义有效期越界或非法时提示', () => {
    const zero = validateForm({
      ...VALID_FORM,
      preset: 'custom',
      customValue: '0',
    })
    expect(zero.errors.ttl).toContain('大于 0')

    const tooLong = validateForm({
      ...VALID_FORM,
      preset: 'custom',
      customValue: '366',
      customUnit: 'days',
    })
    expect(tooLong.errors.ttl).toContain('365 天')

    const notNumber = validateForm({
      ...VALID_FORM,
      preset: 'custom',
      customValue: 'abc',
    })
    expect(notNumber.errors.ttl).toBeTruthy()

    const tooShort = validateForm({
      ...VALID_FORM,
      preset: 'custom',
      customValue: '30',
      customUnit: 'minutes',
    })
    expect(tooShort.errors.ttl).toBeUndefined()
  })

  it('产品名称必填且限长', () => {
    expect(validateForm({ ...VALID_FORM, productName: '  ' }).errors.productName).toContain(
      '产品名称',
    )
    expect(
      validateForm({ ...VALID_FORM, productName: 'x'.repeat(65) }).errors.productName,
    ).toContain('64')
  })
})

describe('结果是否落后于当前输入', () => {
  it('输入未变化时不是旧结果', () => {
    const result = makeResult()
    expect(isResultStale(result, VALID_FORM, 86400)).toBe(false)
  })

  it('修改设备名称 / 产品 ID 后判定为旧结果', () => {
    const result = makeResult()

    expect(
      isResultStale(
        result,
        { ...VALID_FORM, deviceName: 'another-device' },
        86400,
      ),
    ).toBe(true)
    expect(
      isResultStale(result, { ...VALID_FORM, productId: 'OtherPid01' }, 86400),
    ).toBe(true)
  })

  it('修改签名算法或有效期后判定为旧结果', () => {
    const result = makeResult()

    expect(isResultStale(result, { ...VALID_FORM, method: 'sha256' }, 86400)).toBe(
      true,
    )
    expect(isResultStale(result, { ...VALID_FORM, preset: '1h' }, 3600)).toBe(true)
  })

  it('输入不同密钥后判定为旧结果，清空密钥不判定', () => {
    const result = makeResult()
    const otherKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' // 32 字节全零

    expect(isResultStale(result, { ...VALID_FORM, keyBase64: otherKey }, 86400)).toBe(
      true,
    )
    expect(isResultStale(result, { ...VALID_FORM, keyBase64: '' }, 86400)).toBe(false)
    expect(
      isResultStale(result, { ...VALID_FORM, keyBase64: 'bad-key' }, 86400),
    ).toBe(true)
  })

  it('仅修改产品名称（不参与签名）不判定为旧结果', () => {
    const result = makeResult()

    expect(
      isResultStale(result, { ...VALID_FORM, productName: '另一个展示名' }, 86400),
    ).toBe(false)
  })
})
