/** 生成可复制的 MQTT 连接参数、C 代码片段与 ESP8266 AT 指令。 */

import { formatDateTime } from './format'
import {
  buildTopicPaths,
  METHOD_LABELS,
  ONENET_BROKER,
  ONENET_MQTT_PORT,
  type HashMethod,
  type TokenComputation,
} from './onenet'

export interface SerialTokenInfo {
  productId: string
  deviceName: string
  token: string
  method: HashMethod
  et: number
  generatedAtMs: number
  expiresAtMs: number
}

export function escapeCString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
}

/**
 * 对齐项目内 `c语言格式/C语言代码格式.txt` 的写法：
 * 相同变量名、相同 Topic 结构，WiFi 账号使用占位符。
 */
export function buildCSnippet(info: SerialTokenInfo): string {
  const topics = buildTopicPaths(info.productId, info.deviceName)

  return `/* ------------------onenet连接参数------------------ */
/* Token 生成于 ${formatDateTime(info.generatedAtMs)}，有效期至 ${formatDateTime(info.expiresAtMs)} */
/* 请勿把真实 Token 提交到公开仓库 */

char wifi_name[] = "YOUR_WIFI_SSID";
char wifi_pass[] = "YOUR_WIFI_PASSWORD";

char url[] = "mqtts.heclouds.com";   //连接 OneNET MQTT 服务器
char device_name[] = "${escapeCString(info.deviceName)}";  //设备名称（MQTT ClientID）
char produce_ID[] = "${escapeCString(info.productId)}";    //产品ID（MQTT Username）

// 订阅云端下发控制Topic
char subscribe_topic[] = "${escapeCString(topics.subscribe)}";
char publish_topic[] = "${escapeCString(topics.publish)}";

char token[] = "${escapeCString(info.token)}";
/* ------------------onenet连接参数------------------ */`
}

export function buildAtCommands(info: SerialTokenInfo): string {
  const topics = buildTopicPaths(info.productId, info.deviceName)

  return `/* 1. 连接 WiFi（替换为实际账号） */
AT+CWMODE=1
AT+CWJAP="YOUR_WIFI_SSID","YOUR_WIFI_PASSWORD"

/* 2. 配置 MQTT 客户端：clientId=设备名称，username=产品ID，password=Token */
AT+MQTTUSERCFG=0,1,"${info.deviceName}","${info.productId}","${info.token}",0,0,""

/* 3. 连接 OneNET MQTT 服务器 */
AT+MQTTCONN=0,"${ONENET_BROKER}",${ONENET_MQTT_PORT},1

/* 4. 订阅属性设置 Topic */
AT+MQTTSUB=0,"${topics.subscribe}",0`
}

export function buildMqttParamsText(info: SerialTokenInfo): string {
  const topics = buildTopicPaths(info.productId, info.deviceName)

  return [
    'OneNET MQTT 连接参数',
    '--------------------------------',
    `接入点：${ONENET_BROKER}`,
    `端口：${ONENET_MQTT_PORT}`,
    `Client ID：${info.deviceName}`,
    `Username：${info.productId}`,
    `Password：${info.token}`,
    `订阅 Topic：${topics.subscribe}`,
    `发布 Topic：${topics.publish}`,
    `签名算法：${METHOD_LABELS[info.method]}（method=${info.method}）`,
    `生成时间：${formatDateTime(info.generatedAtMs)}`,
    `过期时间：${formatDateTime(info.expiresAtMs)}`,
  ].join('\n')
}

export function buildDebugText(info: TokenComputation): string {
  const topics = buildTopicPaths(info.productId, info.deviceName)

  return [
    'OneNET Token 调试信息（不含设备密钥）',
    `version=${info.version}`,
    `res=${info.res}`,
    `res(URL 编码)=${info.resEncoded}`,
    `et=${info.et}`,
    `method=${info.method}`,
    `sign(Base64)=${info.signBase64}`,
    `sign(URL 编码)=${info.signEncoded}`,
    `密钥长度=${info.decodedKeyBytes} 字节`,
    `密钥指纹=SHA-256:${info.keyFingerprint}`,
    `订阅 Topic=${topics.subscribe}`,
    `发布 Topic=${topics.publish}`,
    `生成时间=${formatDateTime(info.generatedAtMs)}`,
    `过期时间=${formatDateTime(info.expiresAtMs)}`,
    '',
    'StringForSignature（4 行，以 \\n 分隔）:',
    info.stringForSignature,
  ].join('\n')
}
