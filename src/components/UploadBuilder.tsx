import { useMemo, useState } from 'react'

import {
  buildUploadMessage,
  collectUploadIssues,
  IDENTIFIER_SUGGESTIONS,
  PARAM_VALUE_TYPES,
  UPLOAD_PRESETS,
  type ParamValueType,
  type UploadMessageDraft,
  type UploadParamDraft,
} from '../lib/dataMessages'
import { AlertTriangleIcon, XIcon } from './Icons'
import {
  CommAlert,
  CommCode,
  CommCopyButton,
  CommFieldError,
} from './CommUi'

interface UploadBuilderProps {
  productId: string
  deviceName: string
  copiedId: string | null
  onCopy: (id: string, text: string, label: string) => void
}

const INITIAL_DRAFT: UploadMessageDraft = {
  id: '123',
  version: '1.0',
  params: [{ identifier: 'LED', type: 'boolean', value: 'true' }],
}

function defaultValueForType(type: ParamValueType): string {
  if (type === 'boolean') return 'true'
  if (type === 'float') return '0.00'
  return '0'
}

export function UploadBuilder({
  productId,
  deviceName,
  copiedId,
  onCopy,
}: UploadBuilderProps) {
  const [draft, setDraft] = useState<UploadMessageDraft>(INITIAL_DRAFT)
  const [presetNote, setPresetNote] = useState<string | null>(null)

  const issues = useMemo(() => collectUploadIssues(draft), [draft])
  const message = useMemo(() => {
    try {
      return buildUploadMessage(draft, productId, deviceName)
    } catch {
      return null
    }
  }, [draft, productId, deviceName])

  const idIssue = issues.find((issue) => issue.field === 'id')
  const versionIssue = issues.find((issue) => issue.field === 'version')
  const issueMessages = issues.map((issue) =>
    issue.rowIndex == null
      ? issue.message
      : `参数 ${issue.rowIndex + 1}：${issue.message}`,
  )

  function updateField<K extends keyof UploadMessageDraft>(
    key: K,
    value: UploadMessageDraft[K],
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  function updateParam(index: number, patch: Partial<UploadParamDraft>) {
    setDraft((previous) => ({
      ...previous,
      params: previous.params.map((param, paramIndex) =>
        paramIndex === index ? { ...param, ...patch } : param,
      ),
    }))
  }

  function changeParamType(index: number, type: ParamValueType) {
    updateParam(index, { type, value: defaultValueForType(type) })
  }

  function addParam() {
    setDraft((previous) => ({
      ...previous,
      params: [
        ...previous.params,
        { identifier: '', type: 'integer', value: '0' },
      ],
    }))
  }

  function removeParam(index: number) {
    setDraft((previous) => ({
      ...previous,
      params: previous.params.filter((_, paramIndex) => paramIndex !== index),
    }))
  }

  function loadPreset(preset: (typeof UPLOAD_PRESETS)[number]) {
    setDraft({
      id: preset.draft.id,
      version: preset.draft.version,
      params: preset.draft.params.map((param) => ({ ...param })),
    })
    setPresetNote(`${preset.source}：${preset.note}`)
  }

  return (
    <div className="comm-grid">
      <section className="comm-card comm-input-card" aria-labelledby="upload-title">
        <div className="comm-card-head">
          <div>
            <span className="micro">UPLINK / thing/property/post</span>
            <h3 id="upload-title">设备数据上报</h3>
          </div>
          <span className="comm-source-badge">上发.txt</span>
        </div>

        <p className="comm-intro">
          按 TXT 的 <code>property/post</code> 结构填写 id、version 与 params。
          参数可添加多个，字段顺序保持 id → version → params。
        </p>

        <div className="comm-presets">
          <span className="micro">TXT 示例</span>
          {UPLOAD_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className="comm-preset"
              onClick={() => loadPreset(preset)}
            >
              <span>{preset.label}</span>
              <small>{preset.source}</small>
            </button>
          ))}
        </div>
        {presetNote ? <p className="comm-preset-note">{presetNote}</p> : null}

        <div className="comm-field-grid">
          <div className={`comm-field${idIssue ? ' has-error' : ''}`}>
            <label className="comm-label" htmlFor="upload-id">
              报文 id
            </label>
            <input
              id="upload-id"
              className="input mono"
              value={draft.id}
              onChange={(event) => updateField('id', event.target.value)}
              placeholder="TXT 示例为 123"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(idIssue)}
              aria-describedby={idIssue ? 'upload-id-error' : undefined}
            />
            {idIssue ? (
              <CommFieldError id="upload-id-error">{idIssue.message}</CommFieldError>
            ) : (
              <p className="comm-hint">TXT 上传示例固定使用字符串 "123"。</p>
            )}
          </div>

          <div className={`comm-field${versionIssue ? ' has-error' : ''}`}>
            <label className="comm-label" htmlFor="upload-version">
              version
            </label>
            <input
              id="upload-version"
              className="input mono"
              value={draft.version}
              onChange={(event) => updateField('version', event.target.value)}
              placeholder="TXT 示例为 1.0"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(versionIssue)}
              aria-describedby={versionIssue ? 'upload-version-error' : undefined}
            />
            {versionIssue ? (
              <CommFieldError id="upload-version-error">
                {versionIssue.message}
              </CommFieldError>
            ) : (
              <p className="comm-hint">TXT 上传示例固定为 "1.0"。</p>
            )}
          </div>
        </div>

        <div className="comm-params">
          <div className="comm-params-head">
            <span className="micro">PARAMS</span>
            <span>{draft.params.length} 个参数</span>
          </div>

          <datalist id="upload-identifiers">
            {IDENTIFIER_SUGGESTIONS.map((identifier) => (
              <option key={identifier} value={identifier} />
            ))}
          </datalist>

          {draft.params.map((param, index) => {
            const rowIssues = issues.filter((issue) => issue.rowIndex === index)
            const identifierIssue = rowIssues.find(
              (issue) => issue.field === 'identifier',
            )
            const valueIssue = rowIssues.find((issue) => issue.field === 'value')

            return (
              <div className="comm-param-wrap" key={index}>
                <div className="comm-param-row">
                  <span className="comm-param-no">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <div
                    className={`comm-param-cell${identifierIssue ? ' has-error' : ''}`}
                  >
                    <label
                      className="comm-mini-label"
                      htmlFor={`upload-ident-${index}`}
                    >
                      标识符
                    </label>
                    <input
                      id={`upload-ident-${index}`}
                      className="input mono"
                      list="upload-identifiers"
                      value={param.identifier}
                      onChange={(event) =>
                        updateParam(index, { identifier: event.target.value })
                      }
                      placeholder="例如 CO2"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={Boolean(identifierIssue)}
                    />
                  </div>

                  <div className="comm-param-cell">
                    <label
                      className="comm-mini-label"
                      htmlFor={`upload-type-${index}`}
                    >
                      数据类型
                    </label>
                    <select
                      id={`upload-type-${index}`}
                      className="input select"
                      value={param.type}
                      onChange={(event) =>
                        changeParamType(index, event.target.value as ParamValueType)
                      }
                    >
                      {PARAM_VALUE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div
                    className={`comm-param-cell${valueIssue ? ' has-error' : ''}`}
                  >
                    <label
                      className="comm-mini-label"
                      htmlFor={`upload-value-${index}`}
                    >
                      数据值
                    </label>
                    {param.type === 'boolean' ? (
                      <select
                        id={`upload-value-${index}`}
                        className="input select"
                        value={param.value}
                        onChange={(event) =>
                          updateParam(index, { value: event.target.value })
                        }
                        aria-invalid={Boolean(valueIssue)}
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        id={`upload-value-${index}`}
                        className="input mono"
                        type="number"
                        inputMode={param.type === 'integer' ? 'numeric' : 'decimal'}
                        step={param.type === 'integer' ? '1' : '0.01'}
                        value={param.value}
                        onChange={(event) =>
                          updateParam(index, { value: event.target.value })
                        }
                        aria-invalid={Boolean(valueIssue)}
                      />
                    )}
                  </div>

                  <button
                    type="button"
                    className="comm-remove"
                    onClick={() => removeParam(index)}
                    disabled={draft.params.length === 1}
                    aria-label={`删除参数 ${index + 1}`}
                    title={
                      draft.params.length === 1
                        ? '至少保留一个参数'
                        : '删除此参数'
                    }
                  >
                    <XIcon size={15} />
                  </button>
                </div>

                {rowIssues.length > 0 ? (
                  <ul className="comm-row-errors">
                    {rowIssues.map((issue) => (
                      <li key={`${issue.field}-${issue.message}`}>
                        <AlertTriangleIcon size={12} />
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          })}

          <button type="button" className="comm-add" onClick={addParam}>
            + 添加参数
          </button>
        </div>

        <p className="comm-note">
          类型依据：最新 <code>上发.txt</code> 的 LED 为布尔值、count 为整数；
          <code>C语言代码格式.txt</code> 的 count / DHT11 使用 <code>%d</code>，
          CO2 使用 <code>%.2f</code>。字符串与十六进制类型在这些 TXT 中没有示例，
          因此未提供。
        </p>
      </section>

      <section className="comm-card comm-output-card" aria-labelledby="upload-output-title">
        <div className="comm-card-head">
          <div>
            <span className="micro">GENERATED PAYLOAD</span>
            <h3 id="upload-output-title">上报报文</h3>
          </div>
          <span className={`comm-state${message ? ' is-ready' : ' is-error'}`}>
            {message ? '已同步' : '待修正'}
          </span>
        </div>

        {issues.length > 0 ? (
          <CommAlert
            title={`有 ${issues.length} 处需要修正`}
            items={issueMessages}
          />
        ) : null}

        {message ? (
          <>
            <CommCode
              heading="JSON PAYLOAD"
              note="property/post"
              code={message.payload}
              copy={{
                id: 'data-upload-json',
                label: '上报 JSON',
                copiedId,
                onCopy,
              }}
            />
            <CommCode
              heading="AT 指令"
              note="单行 · CRLF"
              code={message.atCommand}
              copy={{
                id: 'data-upload-at',
                label: '上报 AT 指令',
                copiedId,
                onCopy,
              }}
            />
            <p className="comm-wrap-note">
              代码块为阅读自动换行；复制内容仍是完整单行指令。
            </p>

            <div className="comm-topic">
              <span className="micro">TOPIC</span>
              <code>{message.topic}</code>
              <CommCopyButton
                id="data-upload-topic"
                text={message.topic}
                label="上报 Topic"
                copiedId={copiedId}
                onCopy={onCopy}
                compact
              />
            </div>

            <p className="comm-note">
              网页只构造报文，不会真正发送。AT 指令中的 <code>\"</code> 与{' '}
              <code>\,</code> 按 TXT 的写法转义；JSON 字段类型已按布尔 / 整数 /
              浮点数序列化。
            </p>
          </>
        ) : (
          <div className="comm-placeholder">
            <AlertTriangleIcon size={18} />
            <p>修正左侧参数后，这里会自动生成 JSON 与 AT 指令。</p>
          </div>
        )}
      </section>
    </div>
  )
}
