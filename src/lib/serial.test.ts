import { describe, expect, it } from 'vitest'

import { buildOneNetToken } from './onenet'
import {
  buildAtCommands,
  buildCSnippet,
  buildDebugText,
  buildMqttParamsText,
  escapeCString,
} from './serial'

const KEY_B64 = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='

const RESULT = {
  ...buildOneNetToken({
    productId: 'FRfr9m3Ppg',
    deviceName: 'OTA_Test_drive',
    keyBase64: KEY_B64,
    method: 'md5',
    ttlSeconds: 86400,
    nowMs: 1893369600000,
  }),
  productName: 'OTA_Test',
}

describe('串口 / C 代码格式', () => {
  it('C 片段包含 Token、设备名、产品 ID 与 Topic，使用 WiFi 占位符', () => {
    const snippet = buildCSnippet(RESULT)

    expect(snippet).toContain(`char token[] = "${RESULT.token}";`)
    expect(snippet).toContain('char device_name[] = "OTA_Test_drive";')
    expect(snippet).toContain('char produce_ID[] = "FRfr9m3Ppg";')
    expect(snippet).toContain(
      'char subscribe_topic[] = "$sys/FRfr9m3Ppg/OTA_Test_drive/thing/property/set";',
    )
    expect(snippet).toContain(
      'char publish_topic[] = "$sys/FRfr9m3Ppg/OTA_Test_drive/thing/property/post";',
    )
    expect(snippet).toContain('YOUR_WIFI_SSID')
    expect(snippet).not.toContain(KEY_B64)
    expect(snippet).toContain('/* ------------------onenet连接参数------------------ */')
  })

  it('AT 指令包含 MQTT 用户配置、连接、订阅与完整 Token', () => {
    const commands = buildAtCommands(RESULT)

    expect(commands).toContain(
      `AT+MQTTUSERCFG=0,1,"OTA_Test_drive","FRfr9m3Ppg","${RESULT.token}",0,0,""`,
    )
    expect(commands).toContain('AT+MQTTCONN=0,"mqtts.heclouds.com",1883,1')
    expect(commands).toContain(
      'AT+MQTTSUB=0,"$sys/FRfr9m3Ppg/OTA_Test_drive/thing/property/set",0',
    )
    expect(commands).not.toContain(KEY_B64)
  })

  it('C 字符串转义正确处理引号、反斜杠与换行', () => {
    expect(escapeCString('a"b\\c\nd')).toBe('a\\"b\\\\c\\nd')
    expect(escapeCString('plain')).toBe('plain')
  })
})

describe('MQTT 连接参数与调试文本', () => {
  it('连接参数包含 Client ID / Username / Password，且不含密钥', () => {
    const text = buildMqttParamsText(RESULT)

    expect(text).toContain('Client ID：OTA_Test_drive')
    expect(text).toContain('Username：FRfr9m3Ppg')
    expect(text).toContain(`Password：${RESULT.token}`)
    expect(text).toContain('接入点：mqtts.heclouds.com')
    expect(text).toContain('端口：1883')
    expect(text).toContain('订阅 Topic：$sys/FRfr9m3Ppg/OTA_Test_drive/thing/property/set')
    expect(text).not.toContain(KEY_B64)
  })

  it('调试文本包含签名原文与参数，但不含密钥', () => {
    const text = buildDebugText(RESULT)

    expect(text).toContain('StringForSignature')
    expect(text).toContain(RESULT.stringForSignature)
    expect(text).toContain(`sign(Base64)=${RESULT.signBase64}`)
    expect(text).toContain(`密钥指纹=SHA-256:${RESULT.keyFingerprint}`)
    expect(text).not.toContain(KEY_B64)
    expect(text).not.toContain('0123456789abcdef')
  })
})
