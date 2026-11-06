import { useMemo, useState } from 'react'

import {
  buildDownlinkMessage,
  collectDownlinkIssues,
  DOWNLINK_VALUE_TYPES,
  IDENTIFIER_SUGGESTIONS,
  type DownlinkDraft,
  type DownlinkValueType,
} from '../lib/dataMessages'
import { ArrowRightIcon, AlertTriangleIcon } from './Icons'
import {
  CommAlert,
  CommCode,
  CommCopyButton,
  CommFieldError,
} from './CommUi'

interface DownlinkBuilderProps {
  productId: string
  deviceName: string
  copiedId: string | null
  onCopy: (id: string, text: string, label: string) => void
  onSendToReceiver: (payload: string) => void
}

const INITIAL_DRAFT: DownlinkDraft = {
  id: '123',
  identifier: 'LED',
  type: 'boolean',
  value: 'true',
}

export function DownlinkBuilder({
  productId,
  deviceName,
  copiedId,
  onCopy,
  onSendToReceiver,
}: DownlinkBuilderProps) {
  const [draft, setDraft] = useState<DownlinkDraft>(INITIAL_DRAFT)

  const issues = useMemo(() => collectDownlinkIssues(draft), [draft])
  const message = useMemo(() => {
    try {
      return buildDownlinkMessage(draft, productId, deviceName)
    } catch {
      return null
    }
  }, [draft, productId, deviceName])

  const idIssue = issues.find((issue) => issue.field === 'id')
  const identifierIssue = issues.find((issue) => issue.field === 'identifier')
  const valueIssue = issues.find((issue) => issue.field === 'value')

  function updateField<K extends keyof DownlinkDraft>(key: K, value: DownlinkDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  function changeType(type: DownlinkValueType) {
    setDraft((previous) => ({
      ...previous,
      type,
      value: type === 'boolean' ? 'true' : '1',
    }))
  }

  return (
    <div className="comm-grid">
      <section className="comm-card comm-input-card" aria-labelledby="downlink-title">
        <div className="comm-card-head">
          <div>
            <span className="micro">DOWNLINK / thing/property/set</span>
            <h3 id="downlink-title">平台指令下发</h3>
          </div>
          <span className="comm-source-badge">解析onenet下发的内容.txt</span>
        </div>

        <p className="comm-intro">
          TXT 只给出了下发报文的解析规则，没有给出完整的平台下发样例。这里按解析器实际读取的{' '}
          <code>id</code> 与 <code>params</code> 生成最小测试报文，不额外添加无依据字段。
        </p>

        <div className="comm-field-grid">
          <div className={`comm-field${idIssue ? ' has-error' : ''}`}>
            <label className="comm-label" htmlFor="downlink-id">
              下发指令 id
            </label>
            <input
              id="downlink-id"
              className="input mono"
              value={draft.id}
              onChange={(event) => updateField('id', event.target.value)}
              placeholder="TXT 解析示例为 123"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(idIssue)}
            />
            {idIssue ? (
              <CommFieldError>{idIssue.message}</CommFieldError>
            ) : (
              <p className="comm-hint">TXT 解析器兼容字符串与纯数字 id。</p>
            )}
          </div>

          <div className={`comm-field${identifierIssue ? ' has-error' : ''}`}>
            <label className="comm-label" htmlFor="downlink-ident">
              标识符
            </label>
            <input
              id="downlink-ident"
              className="input mono"
              list="downlink-identifiers"
              value={draft.identifier}
              onChange={(event) => updateField('identifier', event.target.value)}
              placeholder="TXT 解析示例为 LED"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(identifierIssue)}
            />
            <datalist id="downlink-identifiers">
              {IDENTIFIER_SUGGESTIONS.map((identifier) => (
                <option key={identifier} value={identifier} />
              ))}
            </datalist>
            {identifierIssue ? (
              <CommFieldError>{identifierIssue.message}</CommFieldError>
            ) : (
              <p className="comm-hint">params 下的属性名，TXT 示例为 LED。</p>
            )}
          </div>

          <div className="comm-field">
            <label className="comm-label" htmlFor="downlink-type">
              数据类型
            </label>
            <select
              id="downlink-type"
              className="input select"
              value={draft.type}
              onChange={(event) =>
                changeType(event.target.value as DownlinkValueType)
              }
            >
              {DOWNLINK_VALUE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <p className="comm-hint">
              {DOWNLINK_VALUE_TYPES.find((type) => type.value === draft.type)?.hint}
            </p>
          </div>

          <div className={`comm-field${valueIssue ? ' has-error' : ''}`}>
            <label className="comm-label" htmlFor="downlink-value">
              数据值
            </label>
            <select
              id="downlink-value"
              className="input select"
              value={draft.value}
              onChange={(event) => updateField('value', event.target.value)}
              aria-invalid={Boolean(valueIssue)}
            >
              {draft.type === 'boolean' ? (
                <>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </>
              ) : (
                <>
                  <option value="1">1</option>
                  <option value="0">0</option>
                </>
              )}
            </select>
            {valueIssue ? (
              <CommFieldError>{valueIssue.message}</CommFieldError>
            ) : (
              <p className="comm-hint">
                {draft.type === 'boolean'
                  ? 'TXT 业务逻辑通过 strstr 识别 true / false。'
                  : 'TXT 业务逻辑通过 strcmp 识别 1 / 0。'}
              </p>
            )}
          </div>
        </div>

        <div className="comm-callout">
          <AlertTriangleIcon size={15} />
          <p>
            TXT 没有完整下发样例，因此不包含 <code>version</code>；如果实际平台报文包含
            其他字段，请直接粘贴到「设备接收与回复」中按 TXT 规则解析。
          </p>
        </div>
      </section>

      <section className="comm-card comm-output-card" aria-labelledby="downlink-output-title">
        <div className="comm-card-head">
          <div>
            <span className="micro">TEST PAYLOAD</span>
            <h3 id="downlink-output-title">下发测试报文</h3>
          </div>
          <span className={`comm-state${message ? ' is-ready' : ' is-error'}`}>
            {message ? '可解析' : '待修正'}
          </span>
        </div>

        {issues.length > 0 ? (
          <CommAlert
            title="下发字段不完整"
            items={issues.map((issue) => issue.message)}
          />
        ) : null}

        {message ? (
          <>
            <CommCode
              heading="JSON PAYLOAD"
              note="property/set"
              code={message.payload}
              copy={{
                id: 'data-downlink-json',
                label: '下发 JSON',
                copiedId,
                onCopy,
              }}
            />

            <div className="comm-topic">
              <span className="micro">TOPIC</span>
              <code>{message.topic}</code>
              <CommCopyButton
                id="data-downlink-topic"
                text={message.topic}
                label="下发 Topic"
                copiedId={copiedId}
                onCopy={onCopy}
                compact
              />
            </div>

            <div className="comm-actions">
              <button
                type="button"
                className="btn btn-primary comm-send-button"
                onClick={() => onSendToReceiver(message.payload)}
              >
                送入接收与回复
                <ArrowRightIcon size={15} />
              </button>
            </div>

            <p className="comm-note">
              发送到接收页仅用于本地解析演示，不会向 OneNET 或设备发送任何数据。
            </p>
          </>
        ) : (
          <div className="comm-placeholder">
            <AlertTriangleIcon size={18} />
            <p>修正左侧字段后，这里会生成可解析的下发测试报文。</p>
          </div>
        )}
      </section>
    </div>
  )
}
