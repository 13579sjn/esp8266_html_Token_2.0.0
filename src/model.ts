/** 表单模型、有效期换算与前端校验。 */

import { Base64DecodeError, decodeBase64Strict } from './lib/base64'
import {
  keyFingerprintFor,
  validateDeviceName,
  validateProductId,
  validateTtlSeconds,
  type HashMethod,
  type TokenComputation,
} from './lib/onenet'

export type TtlPreset = '1h' | '24h' | '7d' | 'custom'
export type TtlUnit = 'minutes' | 'hours' | 'days'

export interface FormValues {
  productName: string
  deviceName: string
  productId: string
  keyBase64: string
  method: HashMethod
  preset: TtlPreset
  customValue: string
  customUnit: TtlUnit
}

export const DEFAULT_FORM: FormValues = {
  productName: 'OTA_Test',
  deviceName: 'OTA_Test_drive',
  productId: 'FRfr9m3Ppg',
  keyBase64: '',
  method: 'sha1',
  preset: '24h',
  customValue: '24',
  customUnit: 'hours',
}

export const TTL_PRESETS: readonly {
  value: TtlPreset
  label: string
  short: string
  seconds: number | null
}[] = [
  { value: '1h', label: '1 小时', short: '1 h', seconds: 3600 },
  { value: '24h', label: '24 小时', short: '24 h', seconds: 86400 },
  { value: '7d', label: '7 天', short: '7 d', seconds: 604800 },
  { value: 'custom', label: '自定义', short: 'CUSTOM', seconds: null },
]

export const TTL_UNITS: readonly {
  value: TtlUnit
  label: string
  factor: number
}[] = [
  { value: 'minutes', label: '分钟', factor: 60 },
  { value: 'hours', label: '小时', factor: 3600 },
  { value: 'days', label: '天', factor: 86400 },
]

export type FieldKey = 'productName' | 'deviceName' | 'productId' | 'keyBase64' | 'ttl'

export type FieldErrors = Partial<Record<FieldKey, string>>

export interface FormValidation {
  errors: FieldErrors
  ttlSeconds: number | null
}

export function ttlSecondsFrom(form: FormValues): number | null {
  const preset = TTL_PRESETS.find((option) => option.value === form.preset)
  if (preset && typeof preset.seconds === 'number') return preset.seconds

  const raw = form.customValue.trim().replace(',', '.')
  if (!raw) return null

  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return null

  const unit = TTL_UNITS.find((option) => option.value === form.customUnit)
  return Math.round(value * (unit?.factor ?? 3600))
}

export function validateForm(form: FormValues): FormValidation {
  const errors: FieldErrors = {}

  const productName = form.productName.trim()
  if (!productName) {
    errors.productName = '请输入产品名称'
  } else if (productName.length > 64) {
    errors.productName = '产品名称不能超过 64 个字符'
  }

  const deviceNameError = validateDeviceName(form.deviceName)
  if (deviceNameError) errors.deviceName = deviceNameError

  const productIdError = validateProductId(form.productId)
  if (productIdError) errors.productId = productIdError

  const key = form.keyBase64.trim()
  if (!key) {
    errors.keyBase64 = '请输入设备密钥（OneNET 控制台中的 Base64 密钥）'
  } else if (key.length > 1024) {
    errors.keyBase64 = '设备密钥长度异常，请检查是否粘贴了多余内容'
  } else {
    try {
      const bytes = decodeBase64Strict(key)
      if (bytes.length === 0) errors.keyBase64 = '设备密钥解码后为空'
      bytes.fill(0)
    } catch (error) {
      errors.keyBase64 =
        error instanceof Base64DecodeError
          ? `设备密钥无效：${error.message}`
          : '设备密钥不是有效的 Base64 字符串'
    }
  }

  let ttlSeconds = ttlSecondsFrom(form)
  if (form.preset === 'custom' && ttlSeconds == null) {
    errors.ttl = '请输入大于 0 的自定义有效期'
    ttlSeconds = null
  } else {
    const ttlError = validateTtlSeconds(ttlSeconds)
    if (ttlError) {
      errors.ttl = ttlError
      ttlSeconds = null
    }
  }

  return { errors, ttlSeconds }
}

export function countErrors(errors: FieldErrors): number {
  return Object.values(errors).filter(Boolean).length
}

export interface TokenResult extends TokenComputation {
  productName: string
}

/**
 * 结果是否已落后于当前表单。设备密钥只比较 SHA-256 指纹，不保存明文；
 * 密钥输入被清空时不判定为过期（切换页面自动清空属于安全行为）。
 */
export function isResultStale(
  result: TokenResult,
  form: FormValues,
  ttlSeconds: number | null,
): boolean {
  if (result.deviceName !== form.deviceName.trim()) return true
  if (result.productId !== form.productId.trim()) return true
  if (result.method !== form.method) return true
  if (ttlSeconds == null || result.ttlSeconds !== ttlSeconds) return true

  const key = form.keyBase64.trim()
  if (key) {
    const fingerprint = keyFingerprintFor(key)
    if (!fingerprint || fingerprint !== result.keyFingerprint) return true
  }

  return false
}
