/**
 * OneNET 设备鉴权 Token 算法实现。
 *
 * 官方文档：
 * https://iot.10086.cn/doc/iot_platform/book/device-connect&manager/device-auth.html
 *
 * 关键点（顺序不可变）：
 *   StringForSignature = et + "\n" + method + "\n" + res + "\n" + version
 *   sign = base64(HMAC(base64_decode(device_key), StringForSignature))
 *   token = version=2018-10-31&res=...&et=...&method=...&sign=...
 *
 * 其中 method 参数取值为 sha1 / sha256 / md5（不是 hmacsha1），
 * res 与 sign 的 value 需做一次 URL 编码（斜杠 => %2F、+ => %2B、= => %3D）。
 */

import { hmac } from '@noble/hashes/hmac.js'
import { md5, sha1 } from '@noble/hashes/legacy.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

import { Base64DecodeError, bytesToBase64, decodeBase64Strict } from './base64'

export const ONENET_VERSION = '2018-10-31'
export const ONENET_BROKER = 'mqtts.heclouds.com'
export const ONENET_MQTT_PORT = 1883

export const MIN_TTL_SECONDS = 60
export const MAX_TTL_SECONDS = 365 * 86400

export type HashMethod = 'sha1' | 'sha256' | 'md5'

export interface HashMethodOption {
  value: HashMethod
  label: string
  description: string
}

export const HASH_METHODS: readonly HashMethodOption[] = [
  {
    value: 'sha1',
    label: 'HMAC-SHA1',
    description: 'OneNET 默认',
  },
  {
    value: 'sha256',
    label: 'HMAC-SHA256',
    description: '更高强度',
  },
  {
    value: 'md5',
    label: 'HMAC-MD5',
    description: '兼容旧设备',
  },
]

export const METHOD_LABELS: Record<HashMethod, string> = {
  sha1: 'HMAC-SHA1',
  sha256: 'HMAC-SHA256',
  md5: 'HMAC-MD5',
}

const HASH_BY_METHOD = {
  sha1,
  sha256,
  md5,
} as const

const RFC3986_EXTRA = /[!'()*]/g

/**
 * RFC 3986 严格 URL 编码。比 encodeURIComponent 多编码 ! ' ( ) *，
 * 与官方示例中 res=/ 被编码为 %2F 的行为保持一致。
 */
export function urlEncodeStrict(value: string): string {
  return encodeURIComponent(value).replace(RFC3986_EXTRA, (character) => {
    return `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  })
}

export type TokenField = 'productId' | 'deviceName' | 'keyBase64' | 'ttl'

export type TokenErrorCode =
  | 'EMPTY_PRODUCT_ID'
  | 'INVALID_PRODUCT_ID'
  | 'EMPTY_DEVICE_NAME'
  | 'INVALID_DEVICE_NAME'
  | 'EMPTY_KEY'
  | 'INVALID_KEY'
  | 'INVALID_METHOD'
  | 'INVALID_TTL'
  | 'INVALID_CLOCK'

export class OneNetTokenError extends Error {
  readonly code: TokenErrorCode
  readonly field: TokenField

  constructor(code: TokenErrorCode, field: TokenField, message: string) {
    super(message)
    this.name = 'OneNetTokenError'
    this.code = code
    this.field = field
  }
}

const INVALID_NAME_PATTERN = /[\s/\\"']|[\u0000-\u001f\u007f]/

export function validateProductId(value: string): string | null {
  const productId = value.trim()
  if (!productId) return '请输入产品 ID'
  if (productId.length > 64) return '产品 ID 不能超过 64 个字符'
  if (INVALID_NAME_PATTERN.test(productId)) {
    return '产品 ID 不能包含空白、斜杠、引号或控制字符'
  }
  return null
}

export function validateDeviceName(value: string): string | null {
  const deviceName = value.trim()
  if (!deviceName) return '请输入设备名称'
  if (deviceName.length > 64) return '设备名称不能超过 64 个字符'
  if (INVALID_NAME_PATTERN.test(deviceName)) {
    return '设备名称不能包含空白、斜杠、引号或控制字符'
  }
  return null
}

export function validateTtlSeconds(ttlSeconds: number | null): string | null {
  if (ttlSeconds == null || !Number.isFinite(ttlSeconds)) {
    return '请输入有效期'
  }
  if (ttlSeconds < MIN_TTL_SECONDS) {
    return '有效期不能少于 1 分钟'
  }
  if (ttlSeconds > MAX_TTL_SECONDS) {
    return '有效期不能超过 365 天'
  }
  return null
}

export function buildRes(productId: string, deviceName: string): string {
  return `products/${productId}/devices/${deviceName}`
}

export function buildStringForSignature(
  et: number,
  method: HashMethod,
  res: string,
): string {
  return [String(et), method, res, ONENET_VERSION].join('\n')
}

export interface TopicPaths {
  subscribe: string
  publish: string
  publishReply: string
}

export function buildTopicPaths(
  productId: string,
  deviceName: string,
): TopicPaths {
  const base = `$sys/${productId}/${deviceName}/thing/property`
  return {
    subscribe: `${base}/set`,
    publish: `${base}/post`,
    publishReply: `${base}/post/reply`,
  }
}

export interface BuildTokenInput {
  productId: string
  deviceName: string
  keyBase64: string
  method: HashMethod
  ttlSeconds: number
  /** 便于测试注入固定时间；默认 Date.now()。 */
  nowMs?: number
}

export interface TokenComputation {
  version: string
  productId: string
  deviceName: string
  res: string
  resEncoded: string
  et: number
  method: HashMethod
  methodLabel: string
  stringForSignature: string
  signBase64: string
  signEncoded: string
  token: string
  ttlSeconds: number
  generatedAtMs: number
  expiresAtMs: number
  decodedKeyBytes: number
  keyFingerprint: string
}

export function keyFingerprintFor(keyBase64: string): string | null {
  try {
    const keyBytes = decodeBase64Strict(keyBase64)
    const fingerprint = bytesToHex(sha256(keyBytes)).slice(0, 12)
    keyBytes.fill(0)
    return fingerprint
  } catch {
    return null
  }
}

export function buildOneNetToken(input: BuildTokenInput): TokenComputation {
  const productId = input.productId.trim()
  const deviceName = input.deviceName.trim()

  const productIdError = validateProductId(productId)
  if (productIdError) {
    throw new OneNetTokenError(
      productId ? 'INVALID_PRODUCT_ID' : 'EMPTY_PRODUCT_ID',
      'productId',
      productIdError,
    )
  }

  const deviceNameError = validateDeviceName(deviceName)
  if (deviceNameError) {
    throw new OneNetTokenError(
      deviceName ? 'INVALID_DEVICE_NAME' : 'EMPTY_DEVICE_NAME',
      'deviceName',
      deviceNameError,
    )
  }

  if (!HASH_METHODS.some((option) => option.value === input.method)) {
    throw new OneNetTokenError('INVALID_METHOD', 'keyBase64', '不支持的签名算法')
  }

  const ttlError = validateTtlSeconds(input.ttlSeconds)
  if (ttlError) {
    throw new OneNetTokenError('INVALID_TTL', 'ttl', ttlError)
  }

  const nowMs = input.nowMs ?? Date.now()
  if (!Number.isFinite(nowMs) || nowMs <= 0) {
    throw new OneNetTokenError('INVALID_CLOCK', 'ttl', '系统时间无效，无法生成 Token')
  }

  let keyBytes: Uint8Array
  try {
    keyBytes = decodeBase64Strict(input.keyBase64)
  } catch (error) {
    const reason =
      error instanceof Base64DecodeError ? error.message : '设备密钥格式不正确'
    const code =
      error instanceof Base64DecodeError && error.failure === 'empty'
        ? 'EMPTY_KEY'
        : 'INVALID_KEY'
    throw new OneNetTokenError(code, 'keyBase64', reason)
  }

  const ttlSeconds = Math.round(input.ttlSeconds)
  const generatedAtMs = nowMs
  const et = Math.floor(nowMs / 1000) + ttlSeconds
  const expiresAtMs = et * 1000
  const res = buildRes(productId, deviceName)
  const stringForSignature = buildStringForSignature(et, input.method, res)

  try {
    const digest = hmac(
      HASH_BY_METHOD[input.method],
      keyBytes,
      new TextEncoder().encode(stringForSignature),
    )
    const signBase64 = bytesToBase64(digest)
    const signEncoded = urlEncodeStrict(signBase64)
    const resEncoded = urlEncodeStrict(res)
    const keyFingerprint = bytesToHex(sha256(keyBytes)).slice(0, 12)

    // 参数顺序必须为 version、res、et、method、sign。
    const token =
      `version=${ONENET_VERSION}` +
      `&res=${resEncoded}` +
      `&et=${et}` +
      `&method=${input.method}` +
      `&sign=${signEncoded}`

    return {
      version: ONENET_VERSION,
      productId,
      deviceName,
      res,
      resEncoded,
      et,
      method: input.method,
      methodLabel: METHOD_LABELS[input.method],
      stringForSignature,
      signBase64,
      signEncoded,
      token,
      ttlSeconds,
      generatedAtMs,
      expiresAtMs,
      decodedKeyBytes: keyBytes.length,
      keyFingerprint,
    }
  } finally {
    // 及时擦除解码后的密钥字节，避免在内存中长时间保留。
    keyBytes.fill(0)
  }
}
