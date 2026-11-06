import { useState } from 'react'

import { formatDateTime, formatRemaining, formatTtl } from '../lib/format'
import {
  ONENET_BROKER,
  ONENET_MQTT_PORT,
} from '../lib/onenet'
import {
  buildAtCommands,
  buildCSnippet,
  buildDebugText,
  buildMqttParamsText,
} from '../lib/serial'
import type { TokenResult } from '../model'
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  RefreshIcon,
  TerminalIcon,
} from './Icons'

interface ResultPanelProps {
  result: TokenResult | null
  nowMs: number
  isStale: boolean
  copiedId: string | null
  onCopy: (id: string, text: string, label: string) => void
  onRegenerate: () => void
}

interface ParamRowProps {
  id: string
  label: string
  sublabel: string
  value: string
  copied: boolean
  full?: boolean
  onCopy: () => void
}

function ParamRow({ id, label, sublabel, value, copied, full, onCopy }: ParamRowProps) {
  return (
    <div className={`param${full ? ' span-2' : ''}`}>
      <div className="param-head">
        <span className="micro">{label}</span>
        <span className="param-sub">{sublabel}</span>
      </div>
      <div className="param-body">
        <code className="param-value">{value}</code>
        <button
          type="button"
          id={id}
          className={`icon-copy${copied ? ' is-copied' : ''}`}
          onClick={onCopy}
          aria-label={`复制 ${label}`}
          title={`复制 ${label}`}
        >
          {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
        </button>
      </div>
    </div>
  )
}

export function ResultPanel({
  result,
  nowMs,
  isStale,
  copiedId,
  onCopy,
  onRegenerate,
}: ResultPanelProps) {
  const [serialTab, setSerialTab] = useState<'c' | 'at'>('c')

  return (
    <section
      className="panel result-panel"
      id="result-panel"
      aria-labelledby="result-title"
    >
      <div className="panel-head">
        <div>
          <span className="panel-index">02 / OUTPUT</span>
          <h2 id="result-title">生成结果</h2>
          <p>Token、MQTT 连接参数与串口发送格式</p>
        </div>
        <span className="panel-tag">LOCAL SIGN</span>
      </div>

      {!result ? (
        <div className="empty-state">
          <span className="empty-icon">
            <TerminalIcon size={24} />
          </span>
          <h3>尚未生成 Token</h3>
          <p>填写左侧设备参数与签名配置，点击「生成 Token」后，这里会显示完整凭证。</p>
          <ol className="empty-list">
            <li>
              <span>01</span>
              完整 Token、生成时间与剩余有效期
            </li>
            <li>
              <span>02</span>
              MQTT Client ID / Username / Password
            </li>
            <li>
              <span>03</span>
              C 代码片段与 ESP8266 AT 指令
            </li>
          </ol>
          <p className="empty-foot">全部计算在浏览器内完成 · 不连接 OneNET 服务器</p>
        </div>
      ) : (
        <ResultContent
          result={result}
          nowMs={nowMs}
          isStale={isStale}
          copiedId={copiedId}
          onCopy={onCopy}
          onRegenerate={onRegenerate}
          serialTab={serialTab}
          onSerialTabChange={setSerialTab}
        />
      )}
    </section>
  )
}

interface ResultContentProps extends Omit<ResultPanelProps, 'result'> {
  result: TokenResult
  serialTab: 'c' | 'at'
  onSerialTabChange: (tab: 'c' | 'at') => void
}

function ResultContent({
  result,
  nowMs,
  isStale,
  copiedId,
  onCopy,
  onRegenerate,
  serialTab,
  onSerialTabChange,
}: ResultContentProps) {
  const remainingMs = result.expiresAtMs - nowMs
  const expired = remainingMs <= 0
  const serialText = serialTab === 'c' ? buildCSnippet(result) : buildAtCommands(result)

  const statusTone = isStale ? 'warn' : expired ? 'danger' : 'ok'
  const statusLabel = isStale ? '参数已变更' : expired ? '已过期' : 'Token 有效'

  return (
    <div className="panel-body result-body">
      <div className="result-top">
        <div className="status-cluster">
          <span className={`status-pill ${statusTone}`}>
            <span className="status-dot" aria-hidden="true" />
            {statusLabel}
          </span>
          <div className="countdown">
            <span className="countdown-label">{expired ? '有效状态' : '剩余有效'}</span>
            <strong className={`countdown-value${expired ? ' is-expired' : ''}`}>
              {expired ? '已过期' : formatRemaining(remainingMs)}
            </strong>
          </div>
        </div>

        <button type="button" className="copy-inline" onClick={onRegenerate}>
          <RefreshIcon size={14} />
          重新生成
        </button>
      </div>

      {isStale ? (
        <div className="stale-banner" role="status">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>结果已落后于当前输入</strong>
            <p>设备名称、产品 ID、密钥、签名算法或有效期已修改，请重新生成 Token。</p>
          </div>
          <button type="button" className="text-button" onClick={onRegenerate}>
            立即重新生成
          </button>
        </div>
      ) : null}

      <div className={`token-card${isStale ? ' is-stale' : ''}`}>
        <div className="token-head">
          <div className="token-heading">
            <span className="micro">MQTT PASSWORD / TOKEN</span>
            <span className="token-meta">
              {result.token.length} 字符 · {result.methodLabel}
            </span>
          </div>
          <button
            type="button"
            className={`copy-inline on-dark${copiedId === 'token' ? ' is-copied' : ''}`}
            onClick={() => onCopy('token', result.token, '完整 Token')}
          >
            {copiedId === 'token' ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            {copiedId === 'token' ? '已复制' : '复制 Token'}
          </button>
        </div>

        <code className="token-value">{result.token}</code>

        <div className="token-foot">
          <span>et={result.et}</span>
          <span className="token-foot-sep">/</span>
          <span>有效期 {formatTtl(result.ttlSeconds)}</span>
          <span className="token-foot-sep">/</span>
          <span>过期 {formatDateTime(result.expiresAtMs)}</span>
        </div>
      </div>

      <div className="result-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onCopy('token', result.token, '完整 Token')}
        >
          <CopyIcon size={16} />
          复制完整 Token
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            onCopy('mqtt', buildMqttParamsText(result), 'MQTT 连接参数')
          }
        >
          <CopyIcon size={15} />
          复制 MQTT 连接参数
        </button>
      </div>

      <div className="subhead">
        <span className="micro">MQTT CONNECTION</span>
        <h3>连接参数</h3>
      </div>

      <div className="param-grid">
        <ParamRow
          id="copy-client-id"
          label="MQTT CLIENT ID"
          sublabel="设备名称"
          value={result.deviceName}
          copied={copiedId === 'clientId'}
          onCopy={() => onCopy('clientId', result.deviceName, 'Client ID')}
        />
        <ParamRow
          id="copy-username"
          label="MQTT USERNAME"
          sublabel="产品 ID"
          value={result.productId}
          copied={copiedId === 'username'}
          onCopy={() => onCopy('username', result.productId, 'Username')}
        />
        <ParamRow
          id="copy-password"
          label="MQTT PASSWORD"
          sublabel="完整 Token"
          value={result.token}
          copied={copiedId === 'password'}
          full
          onCopy={() => onCopy('password', result.token, 'Password / Token')}
        />
      </div>

      <div className="subhead">
        <span className="micro">TOKEN DETAILS</span>
        <h3>凭证详情</h3>
      </div>

      <dl className="meta-grid">
        <div>
          <dt>设备名称</dt>
          <dd>{result.deviceName}</dd>
        </div>
        <div>
          <dt>产品名称</dt>
          <dd>{result.productName}</dd>
        </div>
        <div>
          <dt>产品 ID</dt>
          <dd className="mono">{result.productId}</dd>
        </div>
        <div>
          <dt>签名算法</dt>
          <dd>
            {result.methodLabel}
            <code>method={result.method}</code>
          </dd>
        </div>
        <div>
          <dt>Token 生成时间</dt>
          <dd>{formatDateTime(result.generatedAtMs)}</dd>
        </div>
        <div>
          <dt>Token 过期时间</dt>
          <dd>
            {formatDateTime(result.expiresAtMs)}
            <code>et={result.et}</code>
          </dd>
        </div>
        <div>
          <dt>剩余有效时长</dt>
          <dd className={expired ? 'text-danger' : ''}>
            {expired ? '已过期，请重新生成' : formatRemaining(remainingMs)}
          </dd>
        </div>
        <div>
          <dt>MQTT 接入点</dt>
          <dd className="mono">
            {ONENET_BROKER}:{ONENET_MQTT_PORT}
          </dd>
        </div>
      </dl>

      <details className="debug" open>
        <summary>
          <span className="debug-title">
            <TerminalIcon size={15} />
            签名原文与计算参数
          </span>
          <span className="debug-flag">DEBUG · 不含密钥</span>
          <ChevronRightIcon size={15} className="chevron" />
        </summary>

        <div className="debug-body">
          <p className="debug-note">
            设备密钥已在本地 Base64 解码为 <b>{result.decodedKeyBytes} 字节</b>参与 HMAC。
            此处仅显示密钥指纹（SHA-256 前 12 位），不显示密钥内容。
          </p>

          <dl className="kv-list">
            <div>
              <dt>version</dt>
              <dd>
                <code>{result.version}</code>
              </dd>
            </div>
            <div>
              <dt>res</dt>
              <dd>
                <code>{result.res}</code>
              </dd>
            </div>
            <div>
              <dt>et</dt>
              <dd>
                <code>{result.et}</code>
                <span className="kv-note">Unix 秒</span>
              </dd>
            </div>
            <div>
              <dt>method</dt>
              <dd>
                <code>{result.method}</code>
              </dd>
            </div>
            <div>
              <dt>sign (Base64)</dt>
              <dd>
                <code>{result.signBase64}</code>
              </dd>
            </div>
            <div>
              <dt>sign (URL 编码)</dt>
              <dd>
                <code>{result.signEncoded}</code>
              </dd>
            </div>
            <div>
              <dt>密钥指纹</dt>
              <dd>
                <code>SHA-256:{result.keyFingerprint}</code>
              </dd>
            </div>
          </dl>

          <div className="signature-block">
            <div className="signature-head">
              <div>
                <span className="micro">STRING FOR SIGNATURE</span>
                <span className="signature-hint">4 行 · 以 \n 分隔 · 顺序固定</span>
              </div>
              <button
                type="button"
                className={`copy-inline${copiedId === 'debug' ? ' is-copied' : ''}`}
                onClick={() => onCopy('debug', buildDebugText(result), '调试信息')}
              >
                {copiedId === 'debug' ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                {copiedId === 'debug' ? '已复制' : '复制调试信息'}
              </button>
            </div>
            <pre className="signature-value">{result.stringForSignature}</pre>
          </div>
        </div>
      </details>

      <section className="serial" aria-labelledby="serial-title">
        <div className="serial-head">
          <div>
            <span className="micro">SERIAL / FIRMWARE</span>
            <h3 id="serial-title">串口发送格式</h3>
          </div>
          <span className="serial-badge">C / AT</span>
        </div>

        <div className="code-switch" role="group" aria-label="选择串口发送格式">
          <button
            type="button"
            className={serialTab === 'c' ? 'is-active' : ''}
            aria-pressed={serialTab === 'c'}
            onClick={() => onSerialTabChange('c')}
          >
            C 代码片段
          </button>
          <button
            type="button"
            className={serialTab === 'at' ? 'is-active' : ''}
            aria-pressed={serialTab === 'at'}
            onClick={() => onSerialTabChange('at')}
          >
            AT 指令
          </button>
        </div>

        <div className="code-wrap">
          <div className="code-bar">
            <span>{serialTab === 'c' ? 'onenet_params.c' : 'esp8266_at.txt'}</span>
            <button
              type="button"
              className={`copy-inline${copiedId === `serial-${serialTab}` ? ' is-copied' : ''}`}
              onClick={() =>
                onCopy(
                  `serial-${serialTab}`,
                  serialText,
                  serialTab === 'c' ? 'C 代码片段' : 'AT 指令',
                )
              }
            >
              {copiedId === `serial-${serialTab}` ? (
                <CheckIcon size={14} />
              ) : (
                <CopyIcon size={14} />
              )}
              {copiedId === `serial-${serialTab}` ? '已复制' : '复制'}
            </button>
          </div>
          <pre className="code-pre">{serialText}</pre>
        </div>

        <p className="serial-note">
          格式与项目内 <code>c语言格式/C语言代码格式.txt</code> 对齐；WiFi 账号为占位符，
          替换后可直接用于 ESP8266 AT 工程。代码块可横向滚动查看完整行。
        </p>
      </section>
    </div>
  )
}
