import { useEffect, useRef } from 'react'
import type { FormEvent, ReactNode } from 'react'

import type { FieldErrors, FormValues, TtlUnit } from '../model'
import { countErrors, TTL_PRESETS, TTL_UNITS } from '../model'
import { formatDateTime } from '../lib/format'
import { HASH_METHODS } from '../lib/onenet'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  LockIcon,
  RefreshIcon,
  XIcon,
} from './Icons'

interface DeviceFormProps {
  form: FormValues
  errors: FieldErrors
  showKey: boolean
  keyAutoCleared: boolean
  generating: boolean
  justGenerated: boolean
  previewEt: number | null
  onChange: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void
  onToggleKey: () => void
  onClearKey: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onReset: () => void
}

interface FieldProps {
  id: string
  label: string
  note?: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: ReactNode
}

function Field({
  id,
  label,
  note,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <div className={`field${className ? ` ${className}` : ''}${error ? ' has-error' : ''}`}>
      <div className="label-row">
        <label className="field-label" htmlFor={id}>
          {label}
          {required ? (
            <span className="req" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {note ? <span className="label-note">{note}</span> : null}
      </div>
      {children}
      {error ? (
        <p className="field-error" id={`error-${id}`} role="alert">
          <AlertTriangleIcon size={13} />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="field-hint" id={`hint-${id}`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function DeviceForm({
  form,
  errors,
  showKey,
  keyAutoCleared,
  generating,
  justGenerated,
  previewEt,
  onChange,
  onToggleKey,
  onClearKey,
  onSubmit,
  onReset,
}: DeviceFormProps) {
  const errorCount = countErrors(errors)
  const keyInputRef = useRef<HTMLInputElement>(null)

  // 密钥输入保持非受控：避免 React 把密钥值写进 DOM 的 value 属性，
  // 只在状态变化（重置 / 切换标签页自动清除）时同步到 DOM。
  useEffect(() => {
    const input = keyInputRef.current
    if (input && form.keyBase64 === '' && input.value !== '') {
      input.value = ''
    }
  }, [form.keyBase64])

  return (
    <form className="panel form-panel" onSubmit={onSubmit} noValidate aria-labelledby="form-title">
      <div className="panel-head">
        <div>
          <span className="panel-index">01 / INPUT</span>
          <h2 id="form-title">设备参数</h2>
          <p>产品与设备身份共同决定签名资源路径 res</p>
        </div>
        <span className="panel-tag">DEVICE PROFILE</span>
      </div>

      <div className="panel-body">
        {errorCount > 0 ? (
          <div className="form-alert" role="alert">
            <AlertTriangleIcon size={17} />
            <div>
              <strong>还有 {errorCount} 项输入需要修正</strong>
              <p>请检查标红的字段后重新生成。</p>
            </div>
          </div>
        ) : null}

        <div className="field-grid">
          <Field
            id="field-productName"
            label="产品名称"
            note="仅展示 · 不参与签名"
            required
            error={errors.productName}
            hint="仅用于页面展示，不进入签名原文。"
          >
            <input
              id="field-productName"
              className="input"
              type="text"
              value={form.productName}
              onChange={(event) => onChange('productName', event.target.value)}
              placeholder="例如 OTA_Test"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(errors.productName)}
              aria-describedby="hint-field-productName error-field-productName"
            />
          </Field>

          <Field
            id="field-productId"
            label="产品 ID"
            note="MQTT Username"
            required
            error={errors.productId}
            hint="OneNET 产品 ID，同时组成 res 路径。"
          >
            <input
              id="field-productId"
              className="input mono"
              type="text"
              value={form.productId}
              onChange={(event) => onChange('productId', event.target.value)}
              placeholder="例如 FRfr9m3Ppg"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={Boolean(errors.productId)}
              aria-describedby="hint-field-productId error-field-productId"
            />
          </Field>

          <Field
            id="field-deviceName"
            label="设备名称"
            note="MQTT Client ID"
            required
            error={errors.deviceName}
            hint="OneNET 设备名称，同时组成 res 路径；带空格或斜杠会被拒绝。"
            className="span-2"
          >
            <input
              id="field-deviceName"
              className="input mono"
              type="text"
              value={form.deviceName}
              onChange={(event) => onChange('deviceName', event.target.value)}
              placeholder="例如 OTA_Test_drive"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={Boolean(errors.deviceName)}
              aria-describedby="hint-field-deviceName error-field-deviceName"
            />
          </Field>

          <div className={`field span-2${errors.keyBase64 ? ' has-error' : ''}`}>
            <div className="label-row">
              <label className="field-label" htmlFor="field-keyBase64">
                设备密钥
                <span className="req" aria-hidden="true">
                  *
                </span>
              </label>
              <span className="label-note">Base64 · 仅当前页面内存</span>
            </div>

            <div className="secret-shell">
              <span className="secret-prefix">
                <KeyIcon size={15} />
              </span>
              <input
                id="field-keyBase64"
                ref={keyInputRef}
                className="secret-input"
                type={showKey ? 'text' : 'password'}
                defaultValue=""
                onChange={(event) => onChange('keyBase64', event.target.value)}
                placeholder="粘贴 OneNET 控制台中的设备密钥"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                aria-invalid={Boolean(errors.keyBase64)}
                aria-describedby="hint-field-keyBase64 error-field-keyBase64"
              />
              <button
                type="button"
                className="secret-action"
                onClick={onToggleKey}
                aria-label={showKey ? '隐藏设备密钥' : '显示设备密钥'}
                aria-pressed={showKey}
              >
                {showKey ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
                <span>{showKey ? '隐藏' : '显示'}</span>
              </button>
              {form.keyBase64 ? (
                <button
                  type="button"
                  className="secret-clear"
                  onClick={onClearKey}
                  aria-label="清空设备密钥"
                >
                  <XIcon size={14} />
                </button>
              ) : null}
            </div>

            {keyAutoCleared ? (
              <p className="field-hint hint-warn">
                页面切换后已自动清空密钥输入；重新生成前请再次粘贴。
              </p>
            ) : null}
            {errors.keyBase64 ? (
              <p className="field-error" id="error-field-keyBase64" role="alert">
                <AlertTriangleIcon size={13} />
                <span>{errors.keyBase64}</span>
              </p>
            ) : (
              <p className="field-hint" id="hint-field-keyBase64">
                密钥只在浏览器内做 Base64 解码与 HMAC，不写入 localStorage / Cookie，也不会出现在日志或 URL 中。
              </p>
            )}
          </div>

          <fieldset className={`field fieldset span-2${errors.ttl ? ' has-error' : ''}`}>
            <legend className="legend-row">
              <span className="field-label">
                Token 有效期
                <span className="req" aria-hidden="true">
                  *
                </span>
              </span>
              <span className="label-note">默认 24 小时</span>
            </legend>

            <div className="segmented">
              {TTL_PRESETS.map((preset) => (
                <label
                  key={preset.value}
                  className={`segment${form.preset === preset.value ? ' is-active' : ''}`}
                >
                  <input
                    type="radio"
                    name="ttl-preset"
                    value={preset.value}
                    checked={form.preset === preset.value}
                    onChange={() => onChange('preset', preset.value)}
                  />
                  <span className="segment-label">{preset.label}</span>
                  <span className="segment-short">{preset.short}</span>
                </label>
              ))}
            </div>

            {form.preset === 'custom' ? (
              <div className="custom-ttl">
                <input
                  id="field-customTtl"
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={form.customValue}
                  onChange={(event) => onChange('customValue', event.target.value)}
                  aria-label="自定义有效期数值"
                  aria-invalid={Boolean(errors.ttl)}
                  aria-describedby={errors.ttl ? 'error-field-ttl' : undefined}
                />
                <div className="select-wrap">
                  <select
                    className="input select"
                    value={form.customUnit}
                    onChange={(event) => onChange('customUnit', event.target.value as TtlUnit)}
                    aria-label="自定义有效期单位"
                  >
                    {TTL_UNITS.map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="custom-range">1 分钟 – 365 天</span>
              </div>
            ) : null}

            <div className="ttl-preview">
              <ClockIcon size={14} />
              <span>预计过期</span>
              <b>{previewEt != null ? formatDateTime(previewEt * 1000) : '—'}</b>
              {previewEt != null ? <code>et={previewEt}</code> : null}
            </div>

            {errors.ttl ? (
              <p className="field-error" id="error-field-ttl" role="alert">
                <AlertTriangleIcon size={13} />
                <span>{errors.ttl}</span>
              </p>
            ) : null}
          </fieldset>

          <fieldset className="field fieldset span-2">
            <legend className="legend-row">
              <span className="field-label">
                签名算法
                <span className="req" aria-hidden="true">
                  *
                </span>
              </span>
              <span className="label-note">method=sha1 / sha256 / md5</span>
            </legend>

            <div className="algorithm-grid">
              {HASH_METHODS.map((option) => (
                <label
                  key={option.value}
                  className={`algorithm${form.method === option.value ? ' is-active' : ''}`}
                >
                  <input
                    type="radio"
                    name="hash-method"
                    value={option.value}
                    checked={form.method === option.value}
                    onChange={() => onChange('method', option.value)}
                  />
                  <span className="algorithm-name">{option.label}</span>
                  <code className="algorithm-code">method={option.value}</code>
                  <span className="algorithm-desc">{option.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="version-lock">
          <span className="version-icon">
            <LockIcon size={16} />
          </span>
          <div className="version-copy">
            <span className="version-label">协议版本</span>
            <code>2018-10-31</code>
          </div>
          <span className="version-note">官方固定值 · 不可修改</span>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className={`btn btn-primary${justGenerated ? ' is-success' : ''}`}
            disabled={generating}
          >
            {generating ? (
              <>
                <span className="spinner" aria-hidden="true" />
                正在签名…
              </>
            ) : justGenerated ? (
              <>
                <CheckIcon size={16} />
                已生成
              </>
            ) : (
              <>
                生成 Token
                <ArrowRightIcon size={16} />
              </>
            )}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onReset}
            disabled={generating}
          >
            <RefreshIcon size={15} />
            重置
          </button>
          <p className="actions-note">
            使用当前 Unix 时间（秒）计算 et；生成过程不会发起任何网络请求。
          </p>
        </div>
      </div>
    </form>
  )
}
