import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import EditorRangeSlider from './editor-range-slider'
import { floatingToolbarPopoverClass } from './floating-toolbar-shell'

export type BgValue =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; css: string; stops: GradientStop[]; angle: number }

export type GradientStop = { color: string; offset: number }

/** True for CSS colors that are fully invisible (stroke/fill “none”). */
export function isTransparentCssColor(value: string): boolean {
  const s = value.trim().toLowerCase()
  if (s === 'transparent' || s === 'none') return true
  const m =
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/.exec(
      s,
    )
  if (m && m[4] !== undefined) {
    const a = parseFloat(m[4])
    return Number.isFinite(a) && a === 0
  }
  if (/^#[0-9a-f]{8}$/i.test(s)) return s.slice(7, 9).toLowerCase() === '00'
  return false
}

export function solidPaintColorsEquivalent(a: string, b: string): boolean {
  if (a === b) return true
  return isTransparentCssColor(a) && isTransparentCssColor(b)
}

const TRANSPARENT_SWATCH_STYLE: CSSProperties = {
  background: 'repeating-conic-gradient(#e2e2e2 0% 25%, #fafafa 0% 50%)',
  backgroundSize: '8px 8px',
}

const PRESET_SOLIDS = [
  'transparent',
  '#ffffff',
  '#f8f9fa',
  '#f1f3f5',
  '#e9ecef',
  '#dee2e6',
  '#212529',
  '#0c8ce9',
  '#339af0',
  '#51cf66',
  '#fcc419',
  '#ff922b',
  '#ff6b6b',
  '#cc5de8',
  '#845ef7',
  '#5c7cfa',
  '#22b8cf',
  '#20c997',
  '#94d82d',
]

const PRESET_GRADIENTS: { stops: GradientStop[]; angle: number }[] = [
  {
    stops: [
      { color: '#667eea', offset: 0 },
      { color: '#764ba2', offset: 1 },
    ],
    angle: 135,
  },
  {
    stops: [
      { color: '#f093fb', offset: 0 },
      { color: '#f5576c', offset: 1 },
    ],
    angle: 135,
  },
  {
    stops: [
      { color: '#4facfe', offset: 0 },
      { color: '#00f2fe', offset: 1 },
    ],
    angle: 135,
  },
  {
    stops: [
      { color: '#43e97b', offset: 0 },
      { color: '#38f9d7', offset: 1 },
    ],
    angle: 135,
  },
  {
    stops: [
      { color: '#fa709a', offset: 0 },
      { color: '#fee140', offset: 1 },
    ],
    angle: 135,
  },
  {
    stops: [
      { color: '#a18cd1', offset: 0 },
      { color: '#fbc2eb', offset: 1 },
    ],
    angle: 135,
  },
  {
    stops: [
      { color: '#fccb90', offset: 0 },
      { color: '#d57eeb', offset: 1 },
    ],
    angle: 135,
  },
  {
    stops: [
      { color: '#e0c3fc', offset: 0 },
      { color: '#8ec5fc', offset: 1 },
    ],
    angle: 135,
  },
  {
    stops: [
      { color: '#f5f7fa', offset: 0 },
      { color: '#c3cfe2', offset: 1 },
    ],
    angle: 135,
  },
  {
    stops: [
      { color: '#0c0c0c', offset: 0 },
      { color: '#3a3a3a', offset: 1 },
    ],
    angle: 135,
  },
  {
    stops: [
      { color: '#ff9a9e', offset: 0 },
      { color: '#fecfef', offset: 1 },
    ],
    angle: 135,
  },
  {
    stops: [
      { color: '#96fbc4', offset: 0 },
      { color: '#f9f586', offset: 1 },
    ],
    angle: 90,
  },
]

function gradientCss(stops: GradientStop[], angle: number): string {
  const s = stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')
  return `linear-gradient(${angle}deg, ${s})`
}

const HEX6 = /^#[0-9A-Fa-f]{6}$/

function parseHexInput(raw: string): string | null {
  const t = raw.trim()
  if (HEX6.test(t)) return t
  if (/^[0-9A-Fa-f]{6}$/.test(t)) return `#${t}`
  return null
}

function clampAngle(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(360, Math.max(0, Math.round(n)))
}

type RgbColor = { r: number; g: number; b: number }
type HsvColor = { h: number; s: number; v: number }

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)))
}

function hexToRgb(hex: string): RgbColor | null {
  if (!HEX6.test(hex)) return null
  const s = hex.slice(1)
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  }
}

function rgbToHex(rgb: RgbColor): string {
  const toHex = (n: number) => clampByte(n).toString(16).padStart(2, '0')
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

function rgbToHsv(rgb: RgbColor): HsvColor {
  const r = clamp01(rgb.r / 255)
  const g = clamp01(rgb.g / 255)
  const b = clamp01(rgb.b / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }

  if (h < 0) h += 360
  const s = max === 0 ? 0 : d / max
  const v = max
  return { h, s, v }
}

function hsvToRgb(hsv: HsvColor): RgbColor {
  const h = ((hsv.h % 360) + 360) % 360
  const s = clamp01(hsv.s)
  const v = clamp01(hsv.v)
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r1 = 0
  let g1 = 0
  let b1 = 0

  if (h < 60) {
    r1 = c
    g1 = x
  } else if (h < 120) {
    r1 = x
    g1 = c
  } else if (h < 180) {
    g1 = c
    b1 = x
  } else if (h < 240) {
    g1 = x
    b1 = c
  } else if (h < 300) {
    r1 = x
    b1 = c
  } else {
    r1 = c
    b1 = x
  }

  return {
    r: clampByte((r1 + m) * 255),
    g: clampByte((g1 + m) * 255),
    b: clampByte((b1 + m) * 255),
  }
}

function hexToHsv(hex: string): HsvColor | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return rgbToHsv(rgb)
}

type SolidColorRectPickerProps = {
  value: string
  onChange: (hex: string) => void
}

function SolidColorRectPicker({ value, onChange }: SolidColorRectPickerProps) {
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const [svDragging, setSvDragging] = useState(false)
  const [hueDragging, setHueDragging] = useState(false)
  const hsv = useMemo(() => hexToHsv(value) ?? { h: 0, s: 0, v: 1 }, [value])

  const updateFromSvPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = svRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const s = clamp01((clientX - rect.left) / rect.width)
      const v = clamp01(1 - (clientY - rect.top) / rect.height)
      onChange(rgbToHex(hsvToRgb({ h: hsv.h, s, v })))
    },
    [hsv.h, onChange],
  )

  const updateFromHuePointer = useCallback(
    (clientX: number) => {
      const el = hueRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const h = clamp01((clientX - rect.left) / rect.width) * 360
      onChange(rgbToHex(hsvToRgb({ h, s: hsv.s, v: hsv.v })))
    },
    [hsv.s, hsv.v, onChange],
  )

  const safeHex = HEX6.test(value) ? value : '#ffffff'
  const hueForBg = Math.round(hsv.h)

  return (
    <div className="space-y-3">
     

      <div
        ref={svRef}
        className="relative h-32 w-full rounded-md border border-black/15"
        style={{
          backgroundImage: `linear-gradient(to top, #000 0%, rgba(0,0,0,0) 100%), linear-gradient(to right, #fff 0%, hsl(${hueForBg} 100% 50%) 100%)`,
        }}
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          setSvDragging(true)
          updateFromSvPointer(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (!svDragging) return
          updateFromSvPointer(e.clientX, e.clientY)
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
          setSvDragging(false)
        }}
        onPointerCancel={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
          setSvDragging(false)
        }}
        aria-label="Saturation and brightness"
      >
        <span
          className="pointer-events-none absolute z-[1] h-3.5 w-3.5 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
          aria-hidden
        />
      </div>

      <div
        ref={hueRef}
        className="relative h-3 w-full rounded-full border border-black/15"
        style={{
          background:
            'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
        }}
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          setHueDragging(true)
          updateFromHuePointer(e.clientX)
        }}
        onPointerMove={(e) => {
          if (!hueDragging) return
          updateFromHuePointer(e.clientX)
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
          setHueDragging(false)
        }}
        onPointerCancel={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
          setHueDragging(false)
        }}
        aria-label="Hue"
      >
        <span
          className="pointer-events-none absolute top-1/2 z-[1] h-4 w-4 rounded-full border-2 border-white bg-transparent shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
          aria-hidden
        />
      </div>
    </div>
  )
}

export function bgValueToCss(v: BgValue): string {
  return v.type === 'solid' ? v.color : v.css
}

export function bgValueToSwatch(v: BgValue): CSSProperties {
  if (v.type === 'solid' && isTransparentCssColor(v.color)) {
    return TRANSPARENT_SWATCH_STYLE
  }
  return v.type === 'solid'
    ? { backgroundColor: v.color }
    : { backgroundImage: v.css }
}

type Tab = 'solid' | 'gradient'

type Props = {
  value: BgValue
  onChange: (v: BgValue) => void
}

export default function BackgroundPopover({
  value,
  onChange,
}: Props) {
  const [tab, setTab] = useState<Tab>(value.type === 'gradient' ? 'gradient' : 'solid')
  const [showSolidPicker, setShowSolidPicker] = useState(false)
  const customColorRef = useRef<HTMLInputElement>(null)
  const gradColor1Ref = useRef<HTMLInputElement>(null)
  const gradColor2Ref = useRef<HTMLInputElement>(null)

  const [customColor, setCustomColor] = useState(
    value.type === 'solid' ? value.color : '#ffffff',
  )
  const [gradAngle, setGradAngle] = useState(
    value.type === 'gradient' ? value.angle : 135,
  )
  const [gradStop1, setGradStop1] = useState(
    value.type === 'gradient' ? value.stops[0]?.color ?? '#667eea' : '#667eea',
  )
  const [gradStop2, setGradStop2] = useState(
    value.type === 'gradient' ? value.stops[1]?.color ?? '#764ba2' : '#764ba2',
  )
  const [angleDraft, setAngleDraft] = useState(
    String(value.type === 'gradient' ? value.angle : 135),
  )

  useEffect(() => {
    if (value.type === 'solid') setCustomColor(value.color)
    if (value.type === 'gradient') {
      setGradAngle(value.angle)
      setAngleDraft(String(value.angle))
      setGradStop1(value.stops[0]?.color ?? '#667eea')
      setGradStop2(value.stops[1]?.color ?? '#764ba2')
    }
  }, [value])

  useEffect(() => {
    if (tab !== 'solid') setShowSolidPicker(false)
  }, [tab])

  useEffect(() => {
    if (!showSolidPicker) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSolidPicker(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showSolidPicker])

  function applySolid(hex: string) {
    setCustomColor(hex)
    onChange({ type: 'solid', color: hex })
  }

  function applyGradient(stops: GradientStop[], angle: number) {
    const a = clampAngle(angle)
    setGradAngle(a)
    setAngleDraft(String(a))
    if (stops.length >= 1) setGradStop1(stops[0].color)
    if (stops.length >= 2) setGradStop2(stops[1].color)
    const css = gradientCss(stops, a)
    onChange({ type: 'gradient', css, stops, angle: a })
  }

  function applyCustomGradient(
    s1: string,
    s2: string,
    a: number,
  ) {
    const stops: GradientStop[] = [
      { color: s1, offset: 0 },
      { color: s2, offset: 1 },
    ]
    applyGradient(stops, a)
  }

  const tabBtnCls = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
      active
        ? 'bg-neutral-900 text-white shadow-sm'
        : 'text-neutral-500 hover:text-neutral-700'
    }`

  return (
    <div
      className={[
        'w-[min(380px,calc(100vw-2rem))] p-3.5',
        floatingToolbarPopoverClass,
        '!overflow-visible',
      ].join(' ')}
    >
      <div className="mb-3 flex gap-1 rounded-lg bg-neutral-100 p-0.5">
        <button
          type="button"
          className={tabBtnCls(tab === 'solid')}
          onClick={() => setTab('solid')}
        >
          Solid
        </button>
        <button
          type="button"
          className={tabBtnCls(tab === 'gradient')}
          onClick={() => setTab('gradient')}
        >
          Gradient
        </button>
      </div>

      {tab === 'solid' ? (
        <div>
          <div className="mb-2.5 grid grid-cols-6 gap-2 justify-items-center">
            <button
              type="button"
              className={`relative h-12 w-12 shrink-0 rounded-full border transition-shadow ${
                showSolidPicker
                  ? 'border-neutral-900 ring-2 ring-neutral-900/20'
                  : 'border-black/10 hover:border-black/25'
              }`}
              style={{
                background:
                  'conic-gradient(from 0deg, #ff3b30, #ffcc00, #34c759, #32ade6, #5856d6, #ff2d55, #ff3b30)',
              }}
              onClick={() => setShowSolidPicker((v) => !v)}
              aria-label="Open color picker"
              title="Open color picker"
            >
              <span
                className="pointer-events-none absolute inset-2 rounded-full border border-white/70"
                style={{
                  backgroundColor:
                    value.type === 'solid' && HEX6.test(value.color)
                      ? value.color
                      : '#ffffff',
                }}
                aria-hidden
              />
            </button>
            {PRESET_SOLIDS.map((hex) => (
              <button
                key={hex}
                type="button"
                className={`h-12 w-12 shrink-0 rounded-full border transition-shadow ${
                  value.type === 'solid' &&
                  solidPaintColorsEquivalent(value.color, hex)
                    ? 'border-neutral-900 ring-2 ring-neutral-900/20'
                    : 'border-black/10 hover:border-black/25'
                }`}
                style={
                  hex === 'transparent' || isTransparentCssColor(hex)
                    ? TRANSPARENT_SWATCH_STYLE
                    : { backgroundColor: hex }
                }
                onClick={() => applySolid(hex)}
                aria-label={hex === 'transparent' ? 'Transparent' : hex}
                title={hex === 'transparent' ? 'Transparent' : hex}
              />
            ))}
          </div>

          <div className="flex items-center gap-2.5 rounded-lg border border-black/10 px-2.5 py-2">
            <button
              type="button"
              className="h-8 w-8 shrink-0 rounded-full border border-black/15 shadow-inner outline-none ring-offset-2 transition hover:ring-2 hover:ring-neutral-900/10 focus-visible:ring-2 focus-visible:ring-neutral-900/20"
              style={
                isTransparentCssColor(customColor)
                  ? TRANSPARENT_SWATCH_STYLE
                  : {
                      backgroundColor: HEX6.test(customColor)
                        ? customColor
                        : '#ffffff',
                    }
              }
              onClick={() => customColorRef.current?.click()}
              aria-label="Pick custom color"
            />
            <input
              ref={customColorRef}
              type="color"
              value={HEX6.test(customColor) ? customColor : '#ffffff'}
              onChange={(e) => applySolid(e.target.value)}
              className="sr-only"
              tabIndex={-1}
            />
            <input
              type="text"
              value={customColor}
              onChange={(e) => {
                const v = e.target.value
                setCustomColor(v)
                const hex = parseHexInput(v)
                if (hex) applySolid(hex)
              }}
              onBlur={() => {
                const hex = parseHexInput(customColor)
                if (hex) {
                  setCustomColor(hex)
                  applySolid(hex)
                  return
                }
                const fallback =
                  value.type === 'solid' && typeof value.color === 'string'
                    ? value.color
                    : '#ffffff'
                setCustomColor(fallback)
              }}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono text-[13px] font-medium text-neutral-800 outline-none transition focus:border-black/10"
              spellCheck={false}
              autoComplete="off"
              placeholder="#000000"
              aria-label="Hex color"
            />
          </div>

          {showSolidPicker ? (
            <div
              className="fixed inset-0 z-[21000] flex items-center justify-center bg-black/30 p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Color picker"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setShowSolidPicker(false)
              }}
            >
              <div
                data-avnac-chrome
                className="w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-2xl"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-neutral-800">
                    Color picker
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border border-black/10 bg-neutral-50 px-2 py-1 text-[11px] font-semibold text-neutral-700"
                    onClick={() => setShowSolidPicker(false)}
                  >
                    Done
                  </button>
                </div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-2 py-1">
                  <span
                    className="h-4 w-4 rounded-sm border border-black/15"
                    style={{
                      backgroundColor: HEX6.test(customColor)
                        ? customColor
                        : '#ffffff',
                    }}
                    aria-hidden
                  />
                  <span className="font-mono text-[11px] font-semibold text-neutral-700">
                    {(HEX6.test(customColor) ? customColor : '#ffffff').toUpperCase()}
                  </span>
                </div>
                <SolidColorRectPicker
                  value={HEX6.test(customColor) ? customColor : '#ffffff'}
                  onChange={(hex) => applySolid(hex)}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <div className="mb-2.5 grid grid-cols-4 gap-2 justify-items-center">
            {PRESET_GRADIENTS.map((g, i) => {
              const css = gradientCss(g.stops, g.angle)
              const isActive =
                value.type === 'gradient' &&
                value.stops.length === g.stops.length &&
                value.stops.every(
                  (s, j) =>
                    s.color === g.stops[j].color &&
                    s.offset === g.stops[j].offset,
                ) &&
                value.angle === g.angle
              return (
                <button
                  key={i}
                  type="button"
                  className={`h-12 w-12 shrink-0 rounded-full border transition-shadow ${
                    isActive
                      ? 'border-neutral-900 ring-2 ring-neutral-900/20'
                      : 'border-black/10 hover:border-black/25'
                  }`}
                  style={{ backgroundImage: css }}
                  onClick={() => applyGradient(g.stops, g.angle)}
                  aria-label={`Gradient ${i + 1}`}
                />
              )
            })}
          </div>

          <div className="rounded-lg border border-black/10 p-3">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Custom
            </p>
            <div className="grid gap-3">
              <div className="flex items-center gap-2.5">
                <label
                  htmlFor="bg-grad-start"
                  className="w-[3.25rem] shrink-0 text-[12px] font-medium text-neutral-600"
                >
                  Start
                </label>
                <button
                  type="button"
                  className="h-8 w-8 shrink-0 rounded-full border border-black/12 shadow-inner outline-none ring-offset-2 transition hover:ring-2 hover:ring-neutral-900/15 focus-visible:ring-2 focus-visible:ring-neutral-900/25"
                  style={{ backgroundColor: HEX6.test(gradStop1) ? gradStop1 : '#667eea' }}
                  onClick={() => gradColor1Ref.current?.click()}
                  aria-label="Pick start color"
                />
                <input
                  ref={gradColor1Ref}
                  type="color"
                  value={HEX6.test(gradStop1) ? gradStop1 : '#667eea'}
                  onChange={(e) => {
                    setGradStop1(e.target.value)
                    applyCustomGradient(e.target.value, gradStop2, gradAngle)
                  }}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                />
                <input
                  id="bg-grad-start"
                  type="text"
                  value={gradStop1}
                  onChange={(e) => {
                    const v = e.target.value
                    setGradStop1(v)
                    const hex = parseHexInput(v)
                    if (hex) applyCustomGradient(hex, gradStop2, gradAngle)
                  }}
                  onBlur={() => {
                    const hex = parseHexInput(gradStop1)
                    if (hex) {
                      setGradStop1(hex)
                      applyCustomGradient(hex, gradStop2, gradAngle)
                    } else {
                      const fallback =
                        value.type === 'gradient'
                          ? (value.stops[0]?.color ?? '#667eea')
                          : '#667eea'
                      setGradStop1(fallback)
                      applyCustomGradient(fallback, gradStop2, gradAngle)
                    }
                  }}
                  className="min-w-0 flex-1 rounded-md border border-black/10 bg-neutral-50/80 px-2 py-1.5 font-mono text-[12px] text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-black/20"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="#000000"
                />
              </div>
              <div className="flex items-center gap-2.5">
                <label
                  htmlFor="bg-grad-end"
                  className="w-[3.25rem] shrink-0 text-[12px] font-medium text-neutral-600"
                >
                  End
                </label>
                <button
                  type="button"
                  className="h-8 w-8 shrink-0 rounded-full border border-black/12 shadow-inner outline-none ring-offset-2 transition hover:ring-2 hover:ring-neutral-900/15 focus-visible:ring-2 focus-visible:ring-neutral-900/25"
                  style={{ backgroundColor: HEX6.test(gradStop2) ? gradStop2 : '#764ba2' }}
                  onClick={() => gradColor2Ref.current?.click()}
                  aria-label="Pick end color"
                />
                <input
                  ref={gradColor2Ref}
                  type="color"
                  value={HEX6.test(gradStop2) ? gradStop2 : '#764ba2'}
                  onChange={(e) => {
                    setGradStop2(e.target.value)
                    applyCustomGradient(gradStop1, e.target.value, gradAngle)
                  }}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                />
                <input
                  id="bg-grad-end"
                  type="text"
                  value={gradStop2}
                  onChange={(e) => {
                    const v = e.target.value
                    setGradStop2(v)
                    const hex = parseHexInput(v)
                    if (hex) applyCustomGradient(gradStop1, hex, gradAngle)
                  }}
                  onBlur={() => {
                    const hex = parseHexInput(gradStop2)
                    if (hex) {
                      setGradStop2(hex)
                      applyCustomGradient(gradStop1, hex, gradAngle)
                    } else {
                      const fallback =
                        value.type === 'gradient'
                          ? (value.stops[1]?.color ?? '#764ba2')
                          : '#764ba2'
                      setGradStop2(fallback)
                      applyCustomGradient(gradStop1, fallback, gradAngle)
                    }
                  }}
                  className="min-w-0 flex-1 rounded-md border border-black/10 bg-neutral-50/80 px-2 py-1.5 font-mono text-[12px] text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-black/20"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="#000000"
                />
              </div>
              <div className="grid grid-cols-[3.25rem_minmax(0,1fr)_4.5rem] items-center gap-2">
                <label
                  htmlFor="bg-grad-angle"
                  className="text-[12px] font-medium text-neutral-600"
                >
                  Angle
                </label>
                <EditorRangeSlider
                  min={0}
                  max={360}
                  value={gradAngle}
                  onChange={(n) => {
                    const a = clampAngle(n)
                    setGradAngle(a)
                    setAngleDraft(String(a))
                    applyCustomGradient(gradStop1, gradStop2, a)
                  }}
                  aria-label="Gradient angle"
                  trackClassName="min-w-0 w-full"
                />
                <div className="relative w-full min-w-[4.5rem] shrink-0">
                  <input
                    id="bg-grad-angle"
                    type="text"
                    inputMode="numeric"
                    value={angleDraft}
                    onChange={(e) => {
                      const t = e.target.value
                      setAngleDraft(t)
                      if (t === '' || t === '-') return
                      const n = Number(t)
                      if (Number.isFinite(n)) {
                        const a = clampAngle(n)
                        setGradAngle(a)
                        applyCustomGradient(gradStop1, gradStop2, a)
                      }
                    }}
                    onBlur={() => {
                      const n = Number(angleDraft)
                      const a = Number.isFinite(n)
                        ? clampAngle(n)
                        : gradAngle
                      setGradAngle(a)
                      setAngleDraft(String(a))
                      applyCustomGradient(gradStop1, gradStop2, a)
                    }}
                    className="box-border w-full min-w-0 rounded-md border border-black/10 bg-neutral-50/80 py-1.5 pl-2 pr-6 text-right font-mono text-[12px] tabular-nums text-neutral-900 outline-none focus:border-black/20"
                    aria-label="Angle in degrees"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-neutral-400">
                    °
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
