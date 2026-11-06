import { useEffect, useMemo, useState } from 'react'

import {
  buildReplyMessage,
  parseJsonDownlink,
  parseTxtDownlink,
  SAMPLE_DOWNLINK_PAYLOAD,
  type JsonDownlinkView,
  type TxtDownlinkParsed,
} from '../lib/dataMessages'
import { AlertTriangleIcon, ArrowDownIcon } from './Icons'
import {
  CommAlert,
  CommCode,
  CommCopyButton,
} from './CommUi'

interface ReceiveReplyProps {
  raw: string
  onRawChange: (raw: string) => void
  parseNonce: number
  productId: string
  deviceName: string
  copiedId: string | null
  onCopy: (id: string, text: string, label: string) => void
}

interface ParsedState {
  parsed: TxtDownlinkParsed | null
  view: JsonDownlinkView | null
  error: string | null
}

const SAMPLE_RAW = SAMPLE_DOWNLINK_PAYLOAD

function analyze(raw: string): ParsedState {
  try {
    const parsed = parseTxtDownlink(raw)
    return {
      parsed,
      view: parseJsonDownlink(raw),
      error: null,
    }
  } catch (error) {
    return {
      parsed: null,
      view: null,
      error: error instanceof Error ? error.message : '解析失败',
    }
  }
}

function formatValue(value: unknown): string {
  if (value === undefined) return '—'
  if (typeof value === 'string') return JSON.stringify(value)
  const serialized = JSON.stringify(value)
  return serialized ?? String(value)
}

export function ReceiveReply({
  raw,
  onRawChange,
  parseNonce,
  productId,
  deviceName,
  copiedId,
  onCopy,
}: ReceiveReplyProps) {
  const [state, setState] = useState<ParsedState>(() => analyze(raw))
  const [dirty, setDirty] = useState(false)
  const [parsedAt, setParsedAt] = useState<Date | null>(null)

  useEffect(() => {
    if (parseNonce === 0) return
    setState(analyze(raw))
    setDirty(false)
    setParsedAt(new Date())
    // 仅在“送入接收”产生新的 nonce 时解析；普通输入由按钮触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parseNonce])

  const reply = useMemo(() => {
    if (!state.parsed) return null
    try {
      return buildReplyMessage(state.parsed.id, productId, deviceName)
    } catch {
      return null
    }
  }, [state.parsed, productId, deviceName])

  function handleRawChange(value: string) {
    onRawChange(value)
    setDirty(true)
  }

  function parseNow() {
    setState(analyze(raw))
    setDirty(false)
    setParsedAt(new Date())
  }

  function loadSample() {
    onRawChange(SAMPLE_RAW)
    setState(analyze(SAMPLE_RAW))
    setDirty(false)
    setParsedAt(new Date())
  }

  return (
    <div className="comm-grid">
      <section className="comm-card comm-input-card" aria-labelledby="receive-title">
        <div className="comm-card-head">
          <div>
            <span className="micro">RECEIVE / +MQTTSUBRECV</span>
            <h3 id="receive-title">设备接收与回复</h3>
          </div>
          <span className="comm-source-badge">解析onenet下发的内容.txt</span>
        </div>

        <p className="comm-intro">
          粘贴平台下发到设备的 JSON 报文，或带转义引号的{' '}
          <code>+MQTTSUBRECV</code> 行。解析规则与 TXT 的{' '}
          <code>extract_mqtt_info()</code> 一致，回复格式来自{' '}
          <code>回复的格式.txt</code>。
        </p>

        <label className="comm-label" htmlFor="receive-raw">
          收到的下发报文
        </label>
        <textarea
          id="receive-raw"
          className="input comm-textarea"
          rows={7}
          value={raw}
          onChange={(event) => handleRawChange(event.target.value)}
          spellCheck={false}
          aria-describedby="receive-raw-hint"
        />
        <p className="comm-hint" id="receive-raw-hint">
          示例结构：<code>{SAMPLE_RAW}</code>
        </p>

        <div className="comm-actions">
          <button type="button" className="btn btn-primary" onClick={parseNow}>
            <ArrowDownIcon size={15} />
            解析并生成回复
          </button>
          <button type="button" className="btn btn-ghost" onClick={loadSample}>
            载入示例
          </button>
        </div>

        {dirty ? (
          <div className="comm-dirty">
            <AlertTriangleIcon size={15} />
            <p>
              报文已修改，下面显示的是上一次解析结果。请点击「解析并生成回复」刷新。
            </p>
          </div>
        ) : null}

        <div className="comm-callout">
          <AlertTriangleIcon size={15} />
          <p>
            TXT 的解析器只读取 <code>params</code> 下的第一个字段，value 截取到第一个{' '}
            <code>,</code> 或 <code>{'}'}</code>；它不是完整的 JSON 解析器。页面同时提供
            JSON 结构化视图，仅用于调试，不代表固件行为。
          </p>
        </div>
      </section>

      <section className="comm-card comm-output-card" aria-labelledby="receive-output-title">
        <div className="comm-card-head">
          <div>
            <span className="micro">PARSED & REPLY</span>
            <h3 id="receive-output-title">解析结果与设备回复</h3>
          </div>
          {parsedAt ? (
            <span className="comm-state is-ready">
              已解析 {parsedAt.toLocaleTimeString('zh-CN', { hour12: false })}
            </span>
          ) : (
            <span className="comm-state">示例</span>
          )}
        </div>

        {state.error ? (
          <CommAlert
            title="下发报文解析失败"
            items={[state.error, '请检查 id、params 与 value 是否符合 TXT 结构。']}
          />
        ) : null}

        {state.parsed ? (
          <>
            <div className="comm-parse-grid">
              <div>
                <span className="micro">MESSAGE ID</span>
                <code>{state.parsed.id}</code>
              </div>
              <div>
                <span className="micro">IDENTIFIER</span>
                <code>{state.parsed.identifier}</code>
              </div>
              <div className="span-2">
                <span className="micro">TXT VALUE (RAW)</span>
                <code>{state.parsed.rawValue}</code>
              </div>
            </div>

            <div className="comm-badges">
              {state.parsed.normalized ? (
                <span className="comm-badge">AT URC 转义已还原</span>
              ) : null}
              {state.parsed.idTruncated ? (
                <span className="comm-badge is-warn">id 已按 TXT 截断至 63 字符</span>
              ) : null}
              {state.parsed.identifierTruncated ? (
                <span className="comm-badge is-warn">标识符已截断至 31 字符</span>
              ) : null}
              {state.parsed.valueTruncated ? (
                <span className="comm-badge is-warn">value 已截断至 31 字符</span>
              ) : null}
            </div>

            <CommCode
              heading="TXT VALUE 原始片段"
              note="extract_mqtt_info 的输出"
              code={state.parsed.rawValue}
              copy={{
                id: 'data-received-value',
                label: 'TXT value',
                copiedId,
                onCopy,
              }}
            />

            <div className="comm-structured">
              <div className="comm-structured-head">
                <span className="micro">JSON STRUCTURED VIEW</span>
                <span className="comm-badge">调试辅助</span>
              </div>
              {state.view ? (
                <dl className="comm-kv">
                  <div>
                    <dt>标识符</dt>
                    <dd>
                      <code>{state.view.identifier ?? '—'}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>结构化 value</dt>
                    <dd>
                      <code>{formatValue(state.view.value)}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>JSON 类型</dt>
                    <dd>{state.view.valueType}</dd>
                  </div>
                  <div>
                    <dt>params 数量</dt>
                    <dd>
                      {state.view.paramsCount}
                      <span className="comm-kv-note">
                        {' '}
                        （TXT 仅处理第一个）
                      </span>
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="comm-note">
                  当前内容无法按 JSON 解析；请以上方 TXT 原始片段为准。
                </p>
              )}
            </div>

            <div className="comm-reply">
              <div className="comm-card-head">
                <div>
                  <span className="micro">DEVICE REPLY / thing/property/set_reply</span>
                  <h3>设备回复</h3>
                </div>
                <span className="comm-source-badge">回复的格式.txt</span>
              </div>

              <p className="comm-note">
                TXT 要求先回复、再执行业务逻辑；<code>code</code> 固定为 200，
                <code>msg</code> 固定为 <code>success</code>，id 取自下发报文。
                TXT 在发送回复前有 <code>HAL_Delay(60)</code>，并同时打印到调试串口；
                页面只生成报文，不执行延时或串口输出。
              </p>

              {reply ? (
                <>
                  <CommCode
                    heading="REPLY JSON"
                    note="set_reply"
                    code={reply.payload}
                    copy={{
                      id: 'data-reply-json',
                      label: '回复 JSON',
                      copiedId,
                      onCopy,
                    }}
                  />
                  <CommCode
                    heading="REPLY AT 指令"
                    note="单行 · CRLF"
                    code={reply.atCommand}
                    copy={{
                      id: 'data-reply-at',
                      label: '回复 AT 指令',
                      copiedId,
                      onCopy,
                    }}
                  />
                  <p className="comm-wrap-note">
                    代码块为阅读自动换行；复制内容仍是完整单行指令。
                  </p>
                  <div className="comm-topic">
                    <span className="micro">REPLY TOPIC</span>
                    <code>{reply.topic}</code>
                    <CommCopyButton
                      id="data-reply-topic"
                      text={reply.topic}
                      label="回复 Topic"
                      copiedId={copiedId}
                      onCopy={onCopy}
                      compact
                    />
                  </div>
                </>
              ) : (
                <CommAlert
                  title="无法生成回复"
                  items={['下发 id 不符合回复字段要求，TXT 无法拼出 set_reply。']}
                />
              )}
            </div>
          </>
        ) : state.error ? null : (
          <div className="comm-placeholder">
            <AlertTriangleIcon size={18} />
            <p>在左侧粘贴下发报文，然后点击「解析并生成回复」。</p>
          </div>
        )}
      </section>
    </div>
  )
}
