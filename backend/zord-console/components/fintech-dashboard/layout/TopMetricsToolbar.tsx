'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

type MenuKey = 'primaryRange' | 'compareRange' | 'period' | null
type ToolbarVariant = 'olive' | 'slate' | 'navy' | 'frost' | 'plum'

type ToolbarPalette = {
  base: string
  light: string
  dark: string
  cream: string
  text: string
  muted: string
  active: string
  panelBackground: string
  panelBorder: string
  panelShadow: string
  rangeBackground: string
  rangeBorder: string
  rangeShadow: string
  rangeLabel: string
  caretBackground: string
  caretBorder: string
  compareText: string
  compareShadow: string
  addBackground: string
  addBorder: string
  addShadow: string
  menuBackground: string
  menuBorder: string
  menuShadow: string
  optionActiveBackground: string
  optionActiveShadow: string
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', sans-serif"

const OLIVE_PALETTE: ToolbarPalette = {
  base: '#B2B8A3',
  light: '#CAD1B9',
  dark: '#9A9F8D',
  cream: '#F7F1E3',
  text: '#243225',
  muted: '#6B7360',
  active: '#4A5D4E',
  panelBackground: 'linear-gradient(180deg, #FFFDF8 0%, #F6EEDC 100%)',
  panelBorder: '#E2D7BF',
  panelShadow: '0 18px 34px rgba(154,159,141,0.18), inset 0 1px 0 rgba(255,255,255,0.88)',
  rangeBackground: 'linear-gradient(180deg, #FFFDF8 0%, #F6EEDC 100%)',
  rangeBorder: '#E0D4BB',
  rangeShadow: '0 12px 24px rgba(188,177,147,0.16), inset 0 1px 0 rgba(255,255,255,0.84)',
  rangeLabel: '#8A7B5B',
  caretBackground: '#FBF7EE',
  caretBorder: '#E5D8C1',
  compareText: '#55614E',
  compareShadow: 'inset 7px 7px 14px rgba(142,147,130,0.48), inset -7px -7px 14px rgba(213,220,191,0.74)',
  addBackground: 'linear-gradient(180deg, #FFF9ED 0%, #F2E6D2 100%)',
  addBorder: '#E0D4BB',
  addShadow: '0 12px 24px rgba(188,177,147,0.16), inset 0 1px 0 rgba(255,255,255,0.86)',
  menuBackground: 'linear-gradient(180deg, #FFFDF8 0%, #F6EEDC 100%)',
  menuBorder: '#E0D4BB',
  menuShadow: '18px 18px 32px rgba(188,177,147,0.18), -12px -12px 24px rgba(255,255,255,0.72)',
  optionActiveBackground: '#EEF1E4',
  optionActiveShadow: 'inset 5px 5px 12px rgba(169,176,149,0.3), inset -5px -5px 12px rgba(255,255,255,0.84)',
}

const SLATE_PALETTE: ToolbarPalette = {
  base: '#8FA7B3',
  light: '#A9C3D1',
  dark: '#758B95',
  cream: '#F5F8FB',
  text: '#23343A',
  muted: '#5B6E75',
  active: '#3D5158',
  panelBackground: 'linear-gradient(180deg, #FFFFFF 0%, #F3F7FB 100%)',
  panelBorder: '#D7E2EA',
  panelShadow: '0 18px 34px rgba(126,142,148,0.14), inset 0 1px 0 rgba(255,255,255,0.92)',
  rangeBackground: 'linear-gradient(180deg, #FFFFFF 0%, #F3F7FB 100%)',
  rangeBorder: '#D7E2EA',
  rangeShadow: '0 12px 24px rgba(126,142,148,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
  rangeLabel: '#73808A',
  caretBackground: '#F7FBFD',
  caretBorder: '#D6E2E8',
  compareText: '#F8FBFD',
  compareShadow: 'inset 7px 7px 14px rgba(126,142,148,0.34), inset -7px -7px 14px rgba(170,191,198,0.58)',
  addBackground: 'linear-gradient(180deg, #FFFFFF 0%, #EEF4F7 100%)',
  addBorder: '#D7E2EA',
  addShadow: '0 12px 24px rgba(126,142,148,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
  menuBackground: 'linear-gradient(180deg, #FFFFFF 0%, #F3F7FB 100%)',
  menuBorder: '#D7E2EA',
  menuShadow: '18px 18px 32px rgba(126,142,148,0.14), -12px -12px 24px rgba(255,255,255,0.78)',
  optionActiveBackground: '#EAF2F6',
  optionActiveShadow: 'inset 5px 5px 12px rgba(126,142,148,0.16), inset -5px -5px 12px rgba(255,255,255,0.9)',
}

const NAVY_PALETTE: ToolbarPalette = {
  base: '#AAB9CC',
  light: '#D2DCE9',
  dark: '#8698AF',
  cream: '#F7FAFE',
  text: '#22354D',
  muted: '#61758D',
  active: '#314A69',
  panelBackground: 'linear-gradient(180deg, #FFFFFF 0%, #F4F8FD 100%)',
  panelBorder: '#D8E1EC',
  panelShadow: '0 18px 34px rgba(134,152,175,0.14), inset 0 1px 0 rgba(255,255,255,0.92)',
  rangeBackground: 'linear-gradient(180deg, #FFFFFF 0%, #F4F8FD 100%)',
  rangeBorder: '#D7E1EB',
  rangeShadow: '0 12px 24px rgba(134,152,175,0.12), inset 0 1px 0 rgba(255,255,255,0.92)',
  rangeLabel: '#73849A',
  caretBackground: '#F7FAFE',
  caretBorder: '#D8E1EC',
  compareText: '#23364C',
  compareShadow: 'inset 7px 7px 14px rgba(134,152,175,0.22), inset -7px -7px 14px rgba(210,220,233,0.56)',
  addBackground: 'linear-gradient(180deg, #FFFFFF 0%, #EFF4FA 100%)',
  addBorder: '#D7E1EB',
  addShadow: '0 12px 24px rgba(134,152,175,0.12), inset 0 1px 0 rgba(255,255,255,0.92)',
  menuBackground: 'linear-gradient(180deg, #FFFFFF 0%, #F4F8FD 100%)',
  menuBorder: '#D7E1EB',
  menuShadow: '18px 18px 32px rgba(134,152,175,0.12), -12px -12px 24px rgba(255,255,255,0.8)',
  optionActiveBackground: '#EDF3F9',
  optionActiveShadow: 'inset 5px 5px 12px rgba(134,152,175,0.14), inset -5px -5px 12px rgba(255,255,255,0.92)',
}

const FROST_PALETTE: ToolbarPalette = {
  base: '#B8BBC4',
  light: '#EDF0F4',
  dark: '#ADB0BA',
  cream: '#C2C5CE',
  text: '#0E1016',
  muted: '#52555E',
  active: '#6B6E7A',
  panelBackground: 'linear-gradient(180deg, #C7CAD3 0%, #B8BBC4 100%)',
  panelBorder: '#D8DBE2',
  panelShadow: '14px 14px 28px rgba(100,105,122,0.26), -10px -10px 22px rgba(255,255,255,0.58), inset 1px 1px 0 rgba(255,255,255,0.38)',
  rangeBackground: 'linear-gradient(180deg, #CCD0D8 0%, #C2C5CE 100%)',
  rangeBorder: '#D9DCE3',
  rangeShadow: '6px 6px 14px rgba(100,105,122,0.28), -3px -3px 9px rgba(255,255,255,0.52), inset 0.5px 0.5px 0 rgba(255,255,255,0.36)',
  rangeLabel: '#52555E',
  caretBackground: '#C8CCD5',
  caretBorder: '#D9DCE3',
  compareText: '#0E1016',
  compareShadow: 'inset 5px 5px 12px rgba(100,105,122,0.24), inset -5px -5px 12px rgba(255,255,255,0.54)',
  addBackground: 'linear-gradient(180deg, #CBD0D8 0%, #C2C5CE 100%)',
  addBorder: '#D9DCE3',
  addShadow: '4px 4px 10px rgba(100,105,122,0.22), -3px -3px 8px rgba(255,255,255,0.48), inset 0.5px 0.5px 0 rgba(255,255,255,0.32)',
  menuBackground: 'linear-gradient(180deg, #C8CBD4 0%, #B8BBC4 100%)',
  menuBorder: '#D8DBE2',
  menuShadow: '14px 14px 28px rgba(100,105,122,0.26), -10px -10px 22px rgba(255,255,255,0.58), inset 1px 1px 0 rgba(255,255,255,0.38)',
  optionActiveBackground: '#C4C7D0',
  optionActiveShadow: '4px 4px 10px rgba(100,105,122,0.22), -3px -3px 8px rgba(255,255,255,0.48), inset 0.5px 0.5px 0 rgba(255,255,255,0.32)',
}

const PLUM_PALETTE: ToolbarPalette = {
  base: '#1C1F2E',
  light: '#2A2F45',
  dark: '#141725',
  cream: '#21253A',
  text: '#F0F2F5',
  muted: 'rgba(240,242,245,0.66)',
  active: '#F0F2F5',
  panelBackground: 'linear-gradient(180deg, rgba(33,37,58,0.98) 0%, rgba(28,31,46,0.98) 100%)',
  panelBorder: 'rgba(255,255,255,0.07)',
  panelShadow:
    '0 22px 52px rgba(20,22,38,0.30), 0 2px 8px rgba(20,22,38,0.22), inset 0 0.5px 0 rgba(255,255,255,0.10)',
  rangeBackground: 'linear-gradient(180deg, rgba(42,47,69,0.96) 0%, rgba(33,37,58,0.98) 100%)',
  rangeBorder: 'rgba(255,255,255,0.12)',
  rangeShadow:
    '0 10px 26px rgba(20,22,38,0.26), inset 0 0.5px 0 rgba(255,255,255,0.10), inset -3px -3px 8px rgba(0,0,0,0.16)',
  rangeLabel: 'rgba(240,242,245,0.58)',
  caretBackground: '#1C1F2E',
  caretBorder: 'rgba(255,255,255,0.09)',
  compareText: '#FFFFFF',
  compareShadow:
    '0 12px 28px rgba(99,102,241,0.20), inset 0 0.5px 0 rgba(255,255,255,0.12), inset -3px -3px 8px rgba(0,0,0,0.18)',
  addBackground: 'linear-gradient(180deg, #6366F1 0%, #4F46E5 100%)',
  addBorder: 'rgba(199,210,254,0.26)',
  addShadow: '0 12px 28px rgba(99,102,241,0.22), inset 0 1px 0 rgba(255,255,255,0.16)',
  menuBackground: 'linear-gradient(180deg, rgba(33,37,58,0.99) 0%, rgba(28,31,46,0.99) 100%)',
  menuBorder: 'rgba(255,255,255,0.10)',
  menuShadow:
    '0 20px 44px rgba(20,22,38,0.32), inset 0 0.5px 0 rgba(255,255,255,0.10)',
  optionActiveBackground: 'rgba(99,102,241,0.14)',
  optionActiveShadow: 'inset 0 0 0 1px rgba(99,102,241,0.24)',
}

const PRIMARY_RANGE_OPTIONS = ['Jan 01 - Jul 31', 'Jan 01 - Mar 31', 'Apr 01 - Jun 30', 'Jul 01 - Sep 30']
const COMPARE_RANGE_OPTIONS = ['Aug 01 - Dec 31', 'Aug 01 - Oct 31', 'Nov 01 - Dec 31']
const PERIOD_OPTIONS = ['Daily', 'Weekly', 'Monthly']

function getToolbarStyles(palette: ToolbarPalette) {
  return {
    controlPanel: {
      width: 'min(100%, 1020px)',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'stretch',
      justifyContent: 'stretch',
      gap: 14,
      marginLeft: 'auto',
      padding: 14,
      background: palette.panelBackground,
      border: `1px solid ${palette.panelBorder}`,
      borderRadius: 32,
      boxShadow: palette.panelShadow,
    } satisfies CSSProperties,
    rangeTrigger: {
      minHeight: 78,
      minWidth: 220,
      padding: '14px 18px 14px',
      background: palette.rangeBackground,
      border: `1px solid ${palette.rangeBorder}`,
      borderRadius: 26,
      boxShadow: palette.rangeShadow,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: 8,
      cursor: 'pointer',
      textAlign: 'left',
    } satisfies CSSProperties,
    rangeLabel: {
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: palette.rangeLabel,
    } satisfies CSSProperties,
    rangeValueRow: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    } satisfies CSSProperties,
    rangeValue: {
      flex: 1,
      fontSize: 16,
      fontWeight: 800,
      letterSpacing: '-0.02em',
      color: palette.text,
      whiteSpace: 'nowrap',
    } satisfies CSSProperties,
    caretWrapper: {
      width: 34,
      height: 34,
      borderRadius: 999,
      border: `1px solid ${palette.caretBorder}`,
      background: palette.caretBackground,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.82)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    } satisfies CSSProperties,
    compareBadge: {
      minHeight: 78,
      minWidth: 96,
      padding: '12px 16px',
      borderRadius: 26,
      border: '1px solid rgba(255,255,255,0.24)',
      background: palette.base,
      boxShadow: palette.compareShadow,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      color: palette.compareText,
    } satisfies CSSProperties,
    addButton: {
      width: 78,
      height: 78,
      padding: 0,
      borderRadius: 26,
      border: `1px solid ${palette.addBorder}`,
      background: palette.addBackground,
      boxShadow: palette.addShadow,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      color: palette.active,
      fontSize: 28,
      fontWeight: 700,
      lineHeight: 1,
    } satisfies CSSProperties,
    menu: {
      position: 'absolute',
      top: 'calc(100% + 10px)',
      left: 0,
      width: '100%',
      background: palette.menuBackground,
      border: `1px solid ${palette.menuBorder}`,
      borderRadius: 22,
      boxShadow: palette.menuShadow,
      padding: 8,
      zIndex: 30,
    } satisfies CSSProperties,
  }
}

function CaretIcon({ stroke }: { stroke: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 6l4 4 4-4"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RangeTrigger({
  label,
  value,
  onClick,
  minWidth = 220,
  palette,
  styles,
}: {
  label: string
  value: string
  onClick: () => void
  minWidth?: number
  palette: ToolbarPalette
  styles: ReturnType<typeof getToolbarStyles>
}) {
  return (
    <button type="button" style={{ ...styles.rangeTrigger, minWidth }} onClick={onClick}>
      <span style={styles.rangeLabel}>{label}</span>
      <span style={styles.rangeValueRow}>
        <span style={styles.rangeValue}>{value}</span>
        <span style={styles.caretWrapper}>
          <CaretIcon stroke={palette.muted} />
        </span>
      </span>
    </button>
  )
}

export function TopMetricsToolbar({ variant = 'frost' }: { variant?: ToolbarVariant }) {
  const palette =
    variant === 'frost'
      ? FROST_PALETTE
      : variant === 'plum'
      ? PLUM_PALETTE
      : variant === 'navy'
      ? NAVY_PALETTE
      : variant === 'slate'
      ? SLATE_PALETTE
      : OLIVE_PALETTE
  const styles = getToolbarStyles(palette)
  const [primaryRange, setPrimaryRange] = useState(PRIMARY_RANGE_OPTIONS[0])
  const [compareRange, setCompareRange] = useState(COMPARE_RANGE_OPTIONS[0])
  const [period, setPeriod] = useState(PERIOD_OPTIONS[0])
  const [openMenu, setOpenMenu] = useState<MenuKey>(null)
  const toolbarRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (toolbarRef.current && !toolbarRef.current.contains(target)) {
        setOpenMenu(null)
      }
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onEscape)
    }
  }, [])

  const menuOptionStyle = (active: boolean): CSSProperties => ({
    width: '100%',
    border: 'none',
    background: active ? palette.optionActiveBackground : 'transparent',
    boxShadow: active ? palette.optionActiveShadow : 'none',
    borderRadius: 14,
    textAlign: 'left',
    padding: '11px 12px',
    fontSize: 13,
    fontWeight: 700,
    color: active ? palette.text : palette.muted,
    cursor: 'pointer',
  })

  return (
    <div
      ref={toolbarRef}
      style={{
        width: '100%',
        marginBottom: 18,
        display: 'flex',
        justifyContent: 'flex-end',
        fontFamily: FONT_STACK,
      }}
    >
      <div style={styles.controlPanel}>
        <div style={{ position: 'relative', flex: '1 1 250px' }}>
          <RangeTrigger
            label="Primary Window"
            value={primaryRange}
            onClick={() => setOpenMenu((menu) => (menu === 'primaryRange' ? null : 'primaryRange'))}
            palette={palette}
            styles={styles}
          />
          {openMenu === 'primaryRange' && (
            <div style={{ ...styles.menu, minWidth: 220 }}>
              {PRIMARY_RANGE_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => {
                    setPrimaryRange(option)
                    setOpenMenu(null)
                  }}
                  style={menuOptionStyle(option === primaryRange)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={styles.compareBadge}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            Compare
          </span>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em' }}>vs</span>
        </div>

        <div style={{ position: 'relative', flex: '1 1 250px' }}>
          <RangeTrigger
            label="Comparison Window"
            value={compareRange}
            onClick={() => setOpenMenu((menu) => (menu === 'compareRange' ? null : 'compareRange'))}
            palette={palette}
            styles={styles}
          />
          {openMenu === 'compareRange' && (
            <div style={{ ...styles.menu, minWidth: 220 }}>
              {COMPARE_RANGE_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => {
                    setCompareRange(option)
                    setOpenMenu(null)
                  }}
                  style={menuOptionStyle(option === compareRange)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'stretch', gap: 14, marginLeft: 'auto' }}>
          <div style={{ position: 'relative' }}>
            <RangeTrigger
              label="Granularity"
              value={period}
              minWidth={150}
              onClick={() => setOpenMenu((menu) => (menu === 'period' ? null : 'period'))}
              palette={palette}
              styles={styles}
            />
            {openMenu === 'period' && (
              <div style={{ ...styles.menu, minWidth: 150 }}>
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option}
                    onClick={() => {
                      setPeriod(option)
                      setOpenMenu(null)
                    }}
                    style={menuOptionStyle(option === period)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" aria-label="Add" style={styles.addButton}>
            +
          </button>
        </div>
      </div>
    </div>
  )
}
