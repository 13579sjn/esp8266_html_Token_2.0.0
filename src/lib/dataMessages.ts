/**
 * OneNET 属性上报 / 下发 / 回复报文构造与解析。
 *
 * 依据（逐条对应，不做协议合并）：
 * - c语言格式/C语言代码格式.txt
 *   property/post：{"id":"123","version":"1.0","params":{"count":{"value":%d},
 *                  "DHT11":{"value":%d},"CO2":{"value":%.2f}}}
 *   property/set_reply：{"id":"%s","code":200,"msg":"success"}
 * - c语言格式/上发.txt（最新）
 *   property/post（单参数，逐字符示例）：
 *   AT+MQTTPUB=0,.../post","{\"id\":\"123\"\,\"version\":\"1.0\"\,
 *   \"params\":{\"LED\":{\"value\":true}}}",0,0
 *   AT+MQTTPUB=0,.../post","{\"id\":\"123\"\,\"version\":\"1.0\"\,
 *   \"params\":{\"count\":{\"value\":33}}}",0,0
 * - c语言格式/解析onenet下发的内容.txt
 *   extract_mqtt_info() 的字段提取规则与缓冲区截断规则。
 * - c语言格式/回复的格式.txt
 *   回复先于业务逻辑，固定 code=200、msg=success，id 取自下发报文。
 */

export type ParamValueType = 'boolean' | 'integer' | 'float'
export type DownlinkValueType = 'boolean' | 'integer'

export const PARAM_VALUE_TYPES: readonly {
  value: ParamValueType
  label: string
  hint: string
}[] = [
  { value: 'boolean', label: '布尔值', hint: 'true / false' },
  { value: 'integer', label: '整数', hint: 'TXT 中 %d，32 位有符号' },
  { value: 'float', label: '浮点数', hint: 'TXT 中 %.2f，保留 2 位' },
]

export const DOWNLINK_VALUE_TYPES: readonly {
  value: DownlinkValueType
  label: string
  hint: string
}[] = [
  { value: 'boolean', label: '布尔值', hint: 'true / false' },
  { value: 'integer', label: '整数 1 / 0', hint: 'TXT 业务逻辑仅匹配 1 与 0' },
]

/**
 * 仅用于页面演示与测试的最小下发结构。
 * TXT 没有给出完整平台下发样例，此值由解析器读取的 id + params 推得。
 */
export const SAMPLE_DOWNLINK_PAYLOAD =
  '{"id":"123","params":{"LED":{"value":true}}}'

/** TXT 示例中出现过的标识符；仅作输入提示，不限制自定义。 */
export const IDENTIFIER_SUGGESTIONS = ['count', 'DHT11', 'CO2', 'LED'] as const

/** 依据示例推断出的默认类型，仅用于“载入示例”，不强制用户选择。 */
export const IDENTIFIER_DEFAULT_TYPES: Record<string, ParamValueType> = {
  count: 'integer',
  DHT11: 'integer',
  CO2: 'float',
  LED: 'boolean',
}

export interface UploadParamDraft {
  identifier: string
  type: ParamValueType
  value: string
}

export interface UploadMessageDraft {
  id: string
  version: string
  params: UploadParamDraft[]
}

export interface UploadPreset {
  key: string
  label: string
  source: string
  note: string
  draft: UploadMessageDraft
}

export const UPLOAD_PRESETS: readonly UploadPreset[] = [
  {
    key: 'upload-led',
    label: '上发.txt：LED = true',
    source: '上发.txt',
    note: '与最新 上发.txt 第 1 条 AT 指令逐字符一致（页面末尾另带 CRLF）。',
    draft: {
      id: '123',
      version: '1.0',
      params: [{ identifier: 'LED', type: 'boolean', value: 'true' }],
    },
  },
  {
    key: 'upload-count',
    label: '上发.txt：count = 33',
    source: '上发.txt',
    note: '与最新 上发.txt 第 2 条 AT 指令逐字符一致（页面末尾另带 CRLF）。',
    draft: {
      id: '123',
      version: '1.0',
      params: [{ identifier: 'count', type: 'integer', value: '33' }],
    },
  },
  {
    key: 'c-file',
    label: 'C语言代码格式.txt：count / DHT11 / CO2',
    source: 'C语言代码格式.txt',
    note: 'TXT 中 count、DHT11 为 %d 变量，CO2 为 %.2f；此处填入演示值。',
    draft: {
      id: '123',
      version: '1.0',
      params: [
        { identifier: 'count', type: 'integer', value: '1' },
        { identifier: 'DHT11', type: 'integer', value: '22' },
        { identifier: 'CO2', type: 'float', value: '22.00' },
      ],
    },
  },
]

export type DataIssueField =
  | 'id'
  | 'version'
  | 'params'
  | 'identifier'
  | 'value'
  | 'raw'

export interface DataIssue {
  field: DataIssueField
  rowIndex?: number
  message: string
}

export class DataMessageError extends Error {
  readonly field: DataIssueField
  readonly rowIndex?: number
  readonly code: string

  constructor(code: string, field: DataIssueField, message: string, rowIndex?: number) {
    super(message)
    this.name = 'DataMessageError'
    this.code = code
    this.field = field
    this.rowIndex = rowIndex
  }
}

export interface DataTopics {
  upload: string
  downlink: string
  reply: string
}

const TOPIC_PRODUCT_PLACEHOLDER = 'YOUR_PRODUCT_ID'
const TOPIC_DEVICE_PLACEHOLDER = 'YOUR_DEVICE_NAME'

/** 产品/设备参数为空时用占位符，保证仍能查看完整报文结构。 */
export function buildDataTopics(productId: string, deviceName: string): DataTopics {
  const pid = productId.trim() || TOPIC_PRODUCT_PLACEHOLDER
  const device = deviceName.trim() || TOPIC_DEVICE_PLACEHOLDER
  const base = `$sys/${pid}/${device}/thing/property`
  return {
    upload: `${base}/post`,
    downlink: `${base}/set`,
    reply: `${base}/set_reply`,
  }
}

const CONTROL_OR_ESCAPE = /["\\,\u0000-\u001f\u007f]/
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,30}$/

export function validateMessageId(value: string): string | null {
  const id = value.trim()
  if (!id) return '请输入报文 id'
  if (id.length > 63) return '报文 id 不能超过 63 个字符（TXT 解析缓冲区为 64 字节）'
  if (CONTROL_OR_ESCAPE.test(id)) return '报文 id 不能包含引号、反斜杠、逗号或控制字符'
  return null
}

export function validateVersion(value: string): string | null {
  const version = value.trim()
  if (!version) return '请输入 version'
  if (version.length > 31) return 'version 不能超过 31 个字符'
  if (CONTROL_OR_ESCAPE.test(version)) {
    return 'version 不能包含引号、反斜杠、逗号或控制字符'
  }
  return null
}

export function validateIdentifier(value: string): string | null {
  const identifier = value.trim()
  if (!identifier) return '请输入标识符'
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    return '标识符需以字母或下划线开头，仅含字母、数字、下划线，最长 31 字符'
  }
  return null
}

export function validateParamValue(
  type: ParamValueType,
  value: string,
): string | null {
  const raw = value.trim()
  if (!raw) return '请输入数据值'

  if (type === 'boolean') {
    return raw === 'true' || raw === 'false'
      ? null
      : '布尔值只能是 true 或 false'
  }

  if (type === 'integer') {
    if (!/^[+-]?\d+$/.test(raw)) return '整数只能包含数字，可带正负号'
    const numeric = Number(raw)
    if (!Number.isSafeInteger(numeric)) return '整数超出安全范围'
    if (numeric < -2147483648 || numeric > 2147483647) {
      return '整数超出 TXT 中 %d 对应的 32 位有符号范围'
    }
    return null
  }

  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) return '浮点数格式不正确'
  if (Math.abs(numeric) > 1e9) return '浮点数超出本工具的展示范围（±1e9）'
  return null
}

function jsonTokenFor(type: ParamValueType, value: string): string {
  const raw = value.trim()
  if (type === 'boolean') return raw
  if (type === 'integer') return String(Number(raw))

  const numeric = Object.is(Number(raw), -0) ? 0 : Number(raw)
  return numeric.toFixed(2)
}

export function collectUploadIssues(draft: UploadMessageDraft): DataIssue[] {
  const issues: DataIssue[] = []

  const idError = validateMessageId(draft.id)
  if (idError) issues.push({ field: 'id', message: idError })

  const versionError = validateVersion(draft.version)
  if (versionError) issues.push({ field: 'version', message: versionError })

  if (draft.params.length === 0) {
    issues.push({ field: 'params', message: '至少需要一个上报参数' })
    return issues
  }

  const seen = new Set<string>()
  draft.params.forEach((param, index) => {
    const identifierError = validateIdentifier(param.identifier)
    if (identifierError) {
      issues.push({ field: 'identifier', rowIndex: index, message: identifierError })
    } else {
      const identifier = param.identifier.trim()
      if (seen.has(identifier)) {
        issues.push({
          field: 'identifier',
          rowIndex: index,
          message: `参数标识符 ${identifier} 重复，JSON 对象会覆盖同名键`,
        })
      }
      seen.add(identifier)
    }

    const valueError = validateParamValue(param.type, param.value)
    if (valueError) {
      issues.push({ field: 'value', rowIndex: index, message: valueError })
    }
  })

  return issues
}

export interface UploadParamValue {
  identifier: string
  type: ParamValueType
  jsonToken: string
  displayValue: string
}

export interface UploadMessage {
  id: string
  version: string
  params: UploadParamValue[]
  topic: string
  payload: string
  atCommand: string
}

/** 复制 TXT 中 AT 指令对 JSON 的写法：引号前加 \，逗号前加 \。 */
export function toAtEscapedPayload(payload: string): string {
  return payload.replace(/"/g, '\\"').replace(/,/g, '\\,')
}

export function buildAtPublishCommand(topic: string, payload: string): string {
  return `AT+MQTTPUB=0,"${topic}","${toAtEscapedPayload(payload)}",0,0\r\n`
}

export function buildUploadMessage(
  draft: UploadMessageDraft,
  productId: string,
  deviceName: string,
): UploadMessage {
  const issues = collectUploadIssues(draft)
  if (issues.length > 0) {
    const first = issues[0]
    throw new DataMessageError(
      'INVALID_UPLOAD',
      first.field,
      first.message,
      first.rowIndex,
    )
  }

  const id = draft.id.trim()
  const version = draft.version.trim()
  const params: UploadParamValue[] = draft.params.map((param) => {
    const identifier = param.identifier.trim()
    const jsonToken = jsonTokenFor(param.type, param.value)
    return {
      identifier,
      type: param.type,
      jsonToken,
      displayValue: jsonToken,
    }
  })

  const paramsJson = params
    .map((param) => `${JSON.stringify(param.identifier)}:{"value":${param.jsonToken}}`)
    .join(',')

  // 字段顺序与 TXT 一致：id、version、params。
  const payload =
    `{"id":${JSON.stringify(id)},` +
    `"version":${JSON.stringify(version)},` +
    `"params":{${paramsJson}}}`

  const topic = buildDataTopics(productId, deviceName).upload

  return {
    id,
    version,
    params,
    topic,
    payload,
    atCommand: buildAtPublishCommand(topic, payload),
  }
}

export interface DownlinkDraft {
  id: string
  identifier: string
  type: DownlinkValueType
  value: string
}

export function collectDownlinkIssues(draft: DownlinkDraft): DataIssue[] {
  const issues: DataIssue[] = []

  const idError = validateMessageId(draft.id)
  if (idError) issues.push({ field: 'id', message: idError })

  const identifierError = validateIdentifier(draft.identifier)
  if (identifierError) {
    issues.push({ field: 'identifier', message: identifierError })
  }

  if (draft.type === 'boolean') {
    if (draft.value !== 'true' && draft.value !== 'false') {
      issues.push({ field: 'value', message: '布尔值只能是 true 或 false' })
    }
  } else if (draft.value !== '0' && draft.value !== '1') {
    issues.push({
      field: 'value',
      message: 'TXT 回复逻辑只匹配整数 1 与 0，请选择 1 或 0',
    })
  }

  return issues
}

export interface DownlinkMessage {
  id: string
  identifier: string
  type: DownlinkValueType
  value: string
  topic: string
  payload: string
}

/**
 * TXT 没有给出完整的平台下发样例，只给出解析规则。
 * 这里仅生成解析器必需的最小结构：id + params，不额外添加 version 等字段。
 */
export function buildDownlinkMessage(
  draft: DownlinkDraft,
  productId: string,
  deviceName: string,
): DownlinkMessage {
  const issues = collectDownlinkIssues(draft)
  if (issues.length > 0) {
    const first = issues[0]
    throw new DataMessageError(
      'INVALID_DOWNLINK',
      first.field,
      first.message,
    )
  }

  const id = draft.id.trim()
  const identifier = draft.identifier.trim()
  const value = draft.value
  const payload =
    `{"id":${JSON.stringify(id)},` +
    `"params":{${JSON.stringify(identifier)}:{"value":${value}}}}`

  return {
    id,
    identifier,
    type: draft.type,
    value,
    topic: buildDataTopics(productId, deviceName).downlink,
    payload,
  }
}

export interface NormalizedDownlink {
  text: string
  unescaped: boolean
}

/**
 * 截取从第一个 { 开始的内容；如果输入是 AT URC（含 \" 转义），
 * 额外还原引号与逗号，便于查看。TXT 解析规则本身从第一个 { 开始。
 */
export function normalizeDownlinkInput(raw: string): NormalizedDownlink {
  const start = raw.indexOf('{')
  if (start < 0) return { text: raw, unescaped: false }

  let text = raw.slice(start)
  const looksEscaped = /\\"id\\"/.test(text) || /\+MQTTSUBRECV/i.test(raw)
  if (looksEscaped) {
    text = text.replace(/\\"/g, '"').replace(/\\,/g, ',')
    return { text, unescaped: true }
  }
  return { text, unescaped: false }
}

export interface TxtDownlinkParsed {
  id: string
  identifier: string
  rawValue: string
  normalized: boolean
  idTruncated: boolean
  identifierTruncated: boolean
  valueTruncated: boolean
}

function takeLimited(
  text: string,
  start: number,
  end: number,
  maxLength: number,
): { value: string; truncated: boolean } {
  const rawLength = Math.max(0, end - start)
  const value = text.slice(start, start + Math.min(rawLength, maxLength))
  return { value, truncated: rawLength > maxLength }
}

/**
 * 严格按 TXT 的 extract_mqtt_info() 提取：
 * - 从第一个 { 开始；
 * - 只取 params 下的第一个字段；
 * - value 截取到第一个 , 或 }，不做 JSON 嵌套解析；
 * - id 最多 63 字符，标识符/值最多 31 字符。
 */
export function parseTxtDownlink(raw: string): TxtDownlinkParsed {
  const normalized = normalizeDownlinkInput(raw)
  const text = normalized.text

  if (!text.trim()) {
    throw new DataMessageError('EMPTY_RAW', 'raw', '请粘贴收到的一行报文')
  }

  const idTag = text.indexOf('"id"')
  if (idTag < 0) {
    throw new DataMessageError('MISSING_ID', 'raw', '未找到 "id" 字段')
  }

  let idStart = idTag + 4
  while (
    idStart < text.length &&
    (text[idStart] === ':' || text[idStart] === ' ' || text[idStart] === '\t')
  ) {
    idStart += 1
  }

  let idEnd = idStart
  const hasQuote = text[idStart] === '"'
  if (hasQuote) {
    idStart += 1
    idEnd = text.indexOf('"', idStart)
    if (idEnd < 0) {
      throw new DataMessageError('UNTERMINATED_ID', 'raw', 'id 字符串缺少结束引号')
    }
  } else {
    while (
      idEnd < text.length &&
      text[idEnd] !== ',' &&
      text[idEnd] !== '}' &&
      text[idEnd] !== ' ' &&
      text[idEnd] !== '\t'
    ) {
      idEnd += 1
    }
  }

  if (idEnd <= idStart) {
    throw new DataMessageError('EMPTY_ID', 'raw', 'id 为空，TXT 解析器会直接返回')
  }

  const idPart = takeLimited(text, idStart, idEnd, 63)

  const paramsTag = text.indexOf('"params"', idEnd)
  if (paramsTag < 0) {
    throw new DataMessageError('MISSING_PARAMS', 'raw', '未找到 "params" 字段')
  }

  const paramsBrace = text.indexOf('{', paramsTag)
  if (paramsBrace < 0) {
    throw new DataMessageError('MISSING_PARAMS_OBJECT', 'raw', 'params 缺少 {')
  }

  let keyStart = paramsBrace + 1
  while (
    keyStart < text.length &&
    (text[keyStart] === ' ' || text[keyStart] === '\t' || text[keyStart] === '"')
  ) {
    keyStart += 1
  }

  let keyEnd = keyStart
  while (
    keyEnd < text.length &&
    text[keyEnd] !== '"' &&
    text[keyEnd] !== ':' &&
    text[keyEnd] !== '\0'
  ) {
    keyEnd += 1
  }

  if (keyEnd <= keyStart) {
    throw new DataMessageError('EMPTY_IDENTIFIER', 'raw', '未解析到 params 标识符')
  }

  const identifierPart = takeLimited(text, keyStart, keyEnd, 31)

  const valueColon = text.indexOf(':', keyEnd)
  if (valueColon < 0) {
    throw new DataMessageError('MISSING_VALUE', 'raw', '标识符后未找到冒号')
  }

  let valueStart = valueColon + 1
  while (
    valueStart < text.length &&
    (text[valueStart] === ' ' || text[valueStart] === '\t')
  ) {
    valueStart += 1
  }

  let valueEnd = valueStart
  while (
    valueEnd < text.length &&
    text[valueEnd] !== ',' &&
    text[valueEnd] !== '}' &&
    text[valueEnd] !== '\0'
  ) {
    valueEnd += 1
  }

  const valuePart = takeLimited(text, valueStart, valueEnd, 31)
  if (!valuePart.value) {
    throw new DataMessageError('EMPTY_VALUE', 'raw', '未解析到 params 数据值')
  }

  return {
    id: idPart.value,
    identifier: identifierPart.value,
    rawValue: valuePart.value,
    normalized: normalized.unescaped,
    idTruncated: idPart.truncated,
    identifierTruncated: identifierPart.truncated,
    valueTruncated: valuePart.truncated,
  }
}

export interface JsonDownlinkView {
  id: string | null
  identifier: string | null
  value: unknown
  valueType: string
  paramsCount: number
}

function jsonValueType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * 便于调试的 JSON 结构化视图，不是 TXT 解析函数本身的行为。
 * 仅用于把 OneNET 常见的 {"value": ...} 嵌套直观展示出来。
 */
export function parseJsonDownlink(raw: string): JsonDownlinkView | null {
  const normalized = normalizeDownlinkInput(raw)
  const start = normalized.text.indexOf('{')
  if (start < 0) return null

  const lastBrace = normalized.text.lastIndexOf('}')
  if (lastBrace < start) return null

  const candidate = normalized.text.slice(start, lastBrace + 1)

  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    try {
      parsed = JSON.parse(candidate.replace(/\\"/g, '"').replace(/\\,/g, ','))
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  const params = record.params

  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return null
  }

  const keys = Object.keys(params)
  const identifier = keys[0] ?? null
  let value: unknown = identifier ? (params as Record<string, unknown>)[identifier] : undefined

  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'value' in (value as Record<string, unknown>)
  ) {
    value = (value as Record<string, unknown>).value
  }

  return {
    id: record.id == null ? null : String(record.id),
    identifier,
    value,
    valueType: jsonValueType(value),
    paramsCount: keys.length,
  }
}

export interface ReplyMessage {
  id: string
  topic: string
  payload: string
  atCommand: string
}

export function buildReplyMessage(
  id: string,
  productId: string,
  deviceName: string,
): ReplyMessage {
  const idError = validateMessageId(id)
  if (idError) {
    throw new DataMessageError('INVALID_REPLY_ID', 'id', idError)
  }

  const normalizedId = id.trim()
  const payload = `{"id":${JSON.stringify(normalizedId)},"code":200,"msg":"success"}`
  const topic = buildDataTopics(productId, deviceName).reply

  return {
    id: normalizedId,
    topic,
    payload,
    atCommand: buildAtPublishCommand(topic, payload),
  }
}
