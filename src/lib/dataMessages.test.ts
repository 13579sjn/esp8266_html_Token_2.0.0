import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  buildAtPublishCommand,
  buildDataTopics,
  buildDownlinkMessage,
  buildReplyMessage,
  buildUploadMessage,
  collectDownlinkIssues,
  collectUploadIssues,
  DataMessageError,
  normalizeDownlinkInput,
  parseJsonDownlink,
  parseTxtDownlink,
  toAtEscapedPayload,
  UPLOAD_PRESETS,
  validateIdentifier,
  validateMessageId,
  type DownlinkDraft,
  type UploadMessageDraft,
} from './dataMessages'

const PRODUCT_ID = 'FRfr9m3Ppg'
const DEVICE_NAME = 'OTA_Test_drive'

const SINGLE_LED_DRAFT: UploadMessageDraft = {
  id: '123',
  version: '1.0',
  params: [{ identifier: 'LED', type: 'integer', value: '2' }],
}

const DOWNLINK_DRAFT: DownlinkDraft = {
  id: '123',
  identifier: 'LED',
  type: 'boolean',
  value: 'true',
}

describe('属性上报：依据 上发.txt / C语言代码格式.txt', () => {
  it('与最新上发.txt 的两条 AT 指令逐字符一致（除末尾换行）', () => {
    const commands = readFileSync('c语言格式/上发.txt', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('AT+MQTTPUB='))
      .map((line) => line.trimEnd())

    expect(commands).toHaveLength(2)

    const led = buildUploadMessage(
      {
        id: '123',
        version: '1.0',
        params: [{ identifier: 'LED', type: 'boolean', value: 'true' }],
      },
      PRODUCT_ID,
      DEVICE_NAME,
    )
    expect(led.atCommand.replace(/\r\n$/, '')).toBe(commands[0])

    const count = buildUploadMessage(
      {
        id: '123',
        version: '1.0',
        params: [{ identifier: 'count', type: 'integer', value: '33' }],
      },
      PRODUCT_ID,
      DEVICE_NAME,
    )
    expect(count.atCommand.replace(/\r\n$/, '')).toBe(commands[1])
  })

  it('单参数 LED 的 JSON 与 AT 指令逐字符符合 TXT 结构', () => {
    const message = buildUploadMessage(SINGLE_LED_DRAFT, PRODUCT_ID, DEVICE_NAME)

    expect(message.payload).toBe(
      '{"id":"123","version":"1.0","params":{"LED":{"value":2}}}',
    )
    expect(message.atCommand).toBe(
      'AT+MQTTPUB=0,"$sys/FRfr9m3Ppg/OTA_Test_drive/thing/property/post","{\\"id\\":\\"123\\"\\,\\"version\\":\\"1.0\\"\\,\\"params\\":{\\"LED\\":{\\"value\\":2}}}",0,0\r\n',
    )
    expect(message.topic).toBe(
      '$sys/FRfr9m3Ppg/OTA_Test_drive/thing/property/post',
    )
  })

  it('C语言代码格式.txt 的 count / DHT11 / CO2 结构与 %.2f 一致', () => {
    const draft: UploadMessageDraft = {
      id: '123',
      version: '1.0',
      params: [
        { identifier: 'count', type: 'integer', value: '1' },
        { identifier: 'DHT11', type: 'integer', value: '22' },
        { identifier: 'CO2', type: 'float', value: '22.5' },
      ],
    }
    const message = buildUploadMessage(draft, PRODUCT_ID, DEVICE_NAME)

    expect(message.payload).toBe(
      '{"id":"123","version":"1.0","params":{"count":{"value":1},"DHT11":{"value":22},"CO2":{"value":22.50}}}',
    )
    expect(message.params[2].type).toBe('float')
    expect(message.params[2].displayValue).toBe('22.50')
  })

  it('整数规范化、负数与 32 位边界', () => {
    const message = buildUploadMessage(
      {
        ...SINGLE_LED_DRAFT,
        params: [{ identifier: 'count', type: 'integer', value: '+007' }],
      },
      PRODUCT_ID,
      DEVICE_NAME,
    )
    expect(message.payload).toContain('"count":{"value":7}')

    expect(() =>
      buildUploadMessage(
        {
          ...SINGLE_LED_DRAFT,
          params: [{ identifier: 'count', type: 'integer', value: '2147483648' }],
        },
        PRODUCT_ID,
        DEVICE_NAME,
      ),
    ).toThrowError(/32 位/)
  })

  it('AT 转义按 TXT 对引号和逗号加反斜杠', () => {
    expect(toAtEscapedPayload('{"a":1,"b":2}')).toBe('{\\"a\\":1\\,\\"b\\":2}')
    expect(buildAtPublishCommand('topic', '{}')).toBe(
      'AT+MQTTPUB=0,"topic","{}",0,0\r\n',
    )
  })

  it('三个 TXT 示例均可通过校验并可被载入', () => {
    expect(UPLOAD_PRESETS).toHaveLength(3)
    for (const preset of UPLOAD_PRESETS) {
      expect(collectUploadIssues(preset.draft)).toEqual([])
      const message = buildUploadMessage(preset.draft, PRODUCT_ID, DEVICE_NAME)
      expect(() => JSON.parse(message.payload)).not.toThrow()
    }
  })

  it('缺少字段、重复标识符、非法值给出明确错误', () => {
    expect(
      collectUploadIssues({ id: '', version: '', params: [] }).map(
        (issue) => issue.message,
      ),
    ).toEqual(
      expect.arrayContaining(['请输入报文 id', '请输入 version', '至少需要一个上报参数']),
    )

    const duplicate = collectUploadIssues({
      id: '1',
      version: '1.0',
      params: [
        { identifier: 'LED', type: 'integer', value: '1' },
        { identifier: 'LED', type: 'integer', value: '0' },
      ],
    })
    expect(duplicate.some((issue) => issue.message.includes('重复'))).toBe(true)

    expect(
      collectUploadIssues({
        id: '1',
        version: '1.0',
        params: [{ identifier: '1LED', type: 'integer', value: '1' }],
      })[0].message,
    ).toContain('标识符')

    expect(
      collectUploadIssues({
        id: '1',
        version: '1.0',
        params: [{ identifier: 'LED', type: 'boolean', value: '1' }],
      })[0].message,
    ).toContain('true 或 false')
  })

  it('产品/设备为空时 Topic 使用占位符', () => {
    expect(buildDataTopics('', '').upload).toBe(
      '$sys/YOUR_PRODUCT_ID/YOUR_DEVICE_NAME/thing/property/post',
    )
  })
})

describe('平台指令下发', () => {
  it('按 TXT 解析所需的最小结构生成 id + params', () => {
    const message = buildDownlinkMessage(DOWNLINK_DRAFT, PRODUCT_ID, DEVICE_NAME)

    expect(message.payload).toBe(
      '{"id":"123","params":{"LED":{"value":true}}}',
    )
    expect(message.topic).toBe(
      '$sys/FRfr9m3Ppg/OTA_Test_drive/thing/property/set',
    )
  })

  it('整数下发只允许 TXT 业务逻辑识别的 1 / 0', () => {
    const one = buildDownlinkMessage(
      { ...DOWNLINK_DRAFT, type: 'integer', value: '1' },
      PRODUCT_ID,
      DEVICE_NAME,
    )
    expect(one.payload).toBe('{"id":"123","params":{"LED":{"value":1}}}')

    const issues = collectDownlinkIssues({
      ...DOWNLINK_DRAFT,
      type: 'integer',
      value: '2',
    })
    expect(issues[0].message).toContain('1 与 0')
  })

  it('布尔下发拒绝 1/0', () => {
    const issues = collectDownlinkIssues({ ...DOWNLINK_DRAFT, value: '1' })
    expect(issues[0].message).toContain('true 或 false')
  })

  it('缺少 id / 标识符时给出错误', () => {
    expect(
      collectDownlinkIssues({ ...DOWNLINK_DRAFT, id: '', identifier: '' }).map(
        (issue) => issue.message,
      ),
    ).toEqual(expect.arrayContaining(['请输入报文 id', '请输入标识符']))
  })
})

describe('设备接收：严格复现 TXT 解析规则', () => {
  it('嵌套 {"value":true} 的下发报文按 TXT 提取为原始片段', () => {
    const parsed = parseTxtDownlink(
      '{"id":"123","params":{"LED":{"value":true}}}',
    )

    expect(parsed.id).toBe('123')
    expect(parsed.identifier).toBe('LED')
    // TXT 的 value 截取到第一个 }，因此保留 {"value":true
    expect(parsed.rawValue).toBe('{"value":true')
    expect(parsed.normalized).toBe(false)
  })

  it('数字 id 与扁平 params 也能解析', () => {
    const parsed = parseTxtDownlink('{"id":123,"params":{"LED":false}}')

    expect(parsed.id).toBe('123')
    expect(parsed.identifier).toBe('LED')
    expect(parsed.rawValue).toBe('false')
  })

  it('只解析 params 下的第一个字段，与 TXT 一致', () => {
    const parsed = parseTxtDownlink(
      '{"id":"7","params":{"LED":{"value":true},"count":{"value":33}}}',
    )

    expect(parsed.identifier).toBe('LED')
    expect(parsed.rawValue).toBe('{"value":true')
  })

  it('AT URC 中的转义引号会先还原再解析', () => {
    const urc =
      '+MQTTSUBRECV=0,"$sys/FRfr9m3Ppg/OTA_Test_drive/thing/property/set",54,"{\\"id\\":\\"abc\\",\\"params\\":{\\"LED\\":{\\"value\\":false}}}"'
    const normalized = normalizeDownlinkInput(urc)
    expect(normalized.unescaped).toBe(true)

    const parsed = parseTxtDownlink(urc)
    expect(parsed.id).toBe('abc')
    expect(parsed.identifier).toBe('LED')
    expect(parsed.rawValue).toBe('{"value":false')
  })

  it('缺少 id / params 或为空时报错', () => {
    expect(() => parseTxtDownlink('')).toThrowError(DataMessageError)
    expect(() => parseTxtDownlink('{"params":{"LED":true}}')).toThrowError(/id/)
    expect(() => parseTxtDownlink('{"id":"1","other":{}}')).toThrowError(/params/)
  })

  it('id 63 字符、标识符/值 31 字符的缓冲区截断与 TXT 一致', () => {
    const longId = 'a'.repeat(70)
    const longIdentifier = 'b'.repeat(40)
    const longValue = 'c'.repeat(40)
    const payload = `{"id":"${longId}","params":{"${longIdentifier}":{"value":${longValue}}}}`

    const parsed = parseTxtDownlink(payload)
    expect(parsed.id).toHaveLength(63)
    expect(parsed.idTruncated).toBe(true)
    expect(parsed.identifier).toHaveLength(31)
    expect(parsed.identifierTruncated).toBe(true)
    expect(parsed.rawValue).toHaveLength(31)
    expect(parsed.valueTruncated).toBe(true)
  })

  it('结构化 JSON 视图单独展示嵌套 value，不冒充 TXT 结果', () => {
    const view = parseJsonDownlink(
      '{"id":"123","params":{"LED":{"value":true},"count":{"value":33}}}',
    )

    expect(view).not.toBeNull()
    expect(view?.id).toBe('123')
    expect(view?.identifier).toBe('LED')
    expect(view?.value).toBe(true)
    expect(view?.valueType).toBe('boolean')
    expect(view?.paramsCount).toBe(2)
  })

  it('非 JSON 的原始片段不会产生结构化视图', () => {
    expect(parseJsonDownlink('+MQTTSUBRECV=0,"topic",2,"{}"')).toBeNull()
  })
})

describe('设备回复：依据 回复的格式.txt / C语言代码格式.txt', () => {
  it('id、code、msg 与 TXT 完全一致，Topic 为 set_reply', () => {
    const reply = buildReplyMessage('123', PRODUCT_ID, DEVICE_NAME)

    expect(reply.payload).toBe('{"id":"123","code":200,"msg":"success"}')
    expect(reply.topic).toBe(
      '$sys/FRfr9m3Ppg/OTA_Test_drive/thing/property/set_reply',
    )
    expect(reply.atCommand).toBe(
      'AT+MQTTPUB=0,"$sys/FRfr9m3Ppg/OTA_Test_drive/thing/property/set_reply","{\\"id\\":\\"123\\"\\,\\"code\\":200\\,\\"msg\\":\\"success\\"}",0,0\r\n',
    )
  })

  it('数字 id 在回复中仍按 TXT 的 %s 加引号', () => {
    const reply = buildReplyMessage('001', PRODUCT_ID, DEVICE_NAME)
    expect(reply.payload).toBe('{"id":"001","code":200,"msg":"success"}')
  })

  it('空 id 无法生成回复', () => {
    expect(() => buildReplyMessage('', PRODUCT_ID, DEVICE_NAME)).toThrowError(
      DataMessageError,
    )
  })
})

describe('字段校验', () => {
  it('id 拒绝引号、反斜杠、逗号与控制字符', () => {
    expect(validateMessageId('a"b')).not.toBeNull()
    expect(validateMessageId('a\\b')).not.toBeNull()
    expect(validateMessageId('a,b')).not.toBeNull()
    expect(validateMessageId('abc-123')).toBeNull()
  })

  it('标识符规则与 TXT 示例兼容', () => {
    for (const identifier of ['count', 'DHT11', 'CO2', 'LED']) {
      expect(validateIdentifier(identifier)).toBeNull()
    }
    expect(validateIdentifier('1count')).not.toBeNull()
    expect(validateIdentifier('a'.repeat(32))).not.toBeNull()
  })
})
