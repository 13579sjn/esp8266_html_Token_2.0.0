/**
 * 严格的 Base64 解码工具。
 *
 * OneNET 的设备密钥是标准 Base64 字符串，签名时必须先解码为二进制再作为
 * HMAC 的 key。这里不依赖 atob 的宽松行为：长度、字符集、填充都必须合法，
 * 避免把“看起来像 Base64”的字符串直接当成密钥使用。
 */

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export type Base64Failure = 'empty' | 'length' | 'charset' | 'decode'

export class Base64DecodeError extends Error {
  readonly failure: Base64Failure

  constructor(failure: Base64Failure, message: string) {
    super(message)
    this.name = 'Base64DecodeError'
    this.failure = failure
  }
}

export function decodeBase64Strict(raw: string): Uint8Array {
  const value = raw.trim()

  if (!value) {
    throw new Base64DecodeError('empty', '设备密钥不能为空')
  }

  if (value.length % 4 !== 0) {
    throw new Base64DecodeError(
      'length',
      'Base64 长度不是 4 的倍数，密钥可能没有复制完整',
    )
  }

  if (!BASE64_PATTERN.test(value)) {
    throw new Base64DecodeError(
      'charset',
      '不是有效的 Base64 字符串，只能包含 A-Z、a-z、0-9、+、/ 及末尾的 =',
    )
  }

  let binary: string
  try {
    binary = atob(value)
  } catch {
    throw new Base64DecodeError('decode', 'Base64 解码失败，请检查密钥是否完整')
  }

  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''

  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}
