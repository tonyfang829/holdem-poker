'use client'
import { useState } from 'react'
import { HandRecord, StreetLog } from '@/lib/poker/game-engine'
import { rankToString, suitToSymbol } from '@/lib/poker/deck'
import type { Card } from '@/lib/poker/deck'

interface Props {
  history: HandRecord[]
  lang: 'zh' | 'en'
  onClose: () => void
}

const PHASE_LABEL: Record<string, { zh: string; en: string }> = {
  preflop: { zh: '翻前', en: 'Pre-Flop' },
  flop:    { zh: '翻牌', en: 'Flop' },
  turn:    { zh: '转牌', en: 'Turn' },
  river:   { zh: '河牌', en: 'River' },
}

const ACTION_LABEL: Record<string, { zh: string; en: string }> = {
  fold:   { zh: '弃牌', en: 'Fold' },
  check:  { zh: '过牌', en: 'Check' },
  call:   { zh: '跟注', en: 'Call' },
  raise:  { zh: '加注', en: 'Raise' },
  'all-in': { zh: '全押', en: 'All-In' },
}

const ACTION_COLOR: Record<string, string> = {
  fold:     '#888',
  check:    '#7db87d',
  call:     '#5ab8d8',
  raise:    '#f0c040',
  'all-in': '#ff6b6b',
}

function MiniCard({ card }: { card: Card }) {
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds'
  return (
    <span
      className="inline-flex items-center justify-center rounded font-bold select-none"
      style={{
        width: 28, height: 38,
        background: '#fff',
        border: '1px solid #ccc',
        color: isRed ? '#cc2222' : '#111',
        fontSize: 11,
        fontFamily: 'Georgia, serif',
        flexShrink: 0,
        lineHeight: 1.1,
        flexDirection: 'column',
        display: 'inline-flex',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }}
    >
      <span>{rankToString(card.rank)}</span>
      <span style={{ fontSize: 13 }}>{suitToSymbol(card.suit)}</span>
    </span>
  )
}

function CardRow({ cards, faceDown }: { cards: Card[]; faceDown?: boolean }) {
  return (
    <span className="inline-flex gap-1">
      {cards.map((c, i) =>
        faceDown
          ? <span key={i} className="inline-flex items-center justify-center rounded"
              style={{ width: 28, height: 38, background: 'linear-gradient(135deg,#1a3a8a,#0d2060)', border: '1px solid #2a5acc', fontSize: 14 }}>🂠</span>
          : <MiniCard key={i} card={c} />
      )}
    </span>
  )
}

function StreetSection({ street, lang }: { street: StreetLog; lang: 'zh' | 'en' }) {
  const label = PHASE_LABEL[street.phase]?.[lang] ?? street.phase
  return (
    <div style={{ marginBottom: 10 }}>
      {/* Street header with community cards */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold" style={{ color: '#f0c040', minWidth: 40 }}>{label}</span>
        {street.communityCards.length > 0 && <CardRow cards={street.communityCards} />}
      </div>
      {/* Actions */}
      <div className="flex flex-col gap-1 pl-2" style={{ borderLeft: '2px solid #1a4a28' }}>
        {street.actions.length === 0
          ? <span className="text-xs" style={{ color: '#555' }}>—</span>
          : street.actions.map((a, i) => {
              const actionText = ACTION_LABEL[a.action]?.[lang] ?? a.action
              const hasAmount = a.amount > 0
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span style={{ color: a.isHuman ? '#f0c040' : '#c0c0c0', minWidth: 60 }}>{a.playerName}</span>
                  <span style={{ color: ACTION_COLOR[a.action] ?? '#aaa' }}>{actionText}</span>
                  {hasAmount && <span style={{ color: '#aaa' }}>${a.amount.toLocaleString()}</span>}
                  <span style={{ color: '#444', marginLeft: 'auto' }}>
                    ${(a.chipsBefore - a.amount).toLocaleString()} → ${(a.chipsBefore).toLocaleString()}
                  </span>
                </div>
              )
            })
        }
      </div>
    </div>
  )
}

function HandDetail({ hand, lang }: { hand: HandRecord; lang: 'zh' | 'en' }) {
  return (
    <div style={{ padding: '12px 0' }}>
      {/* Player hole cards */}
      <div className="flex flex-wrap gap-2 mb-3">
        {hand.playerInfo.map((p) => (
          <div key={p.id} className="flex flex-col items-center gap-1">
            <span className="text-xs" style={{ color: p.isHuman ? '#f0c040' : '#aaa' }}>{p.name}</span>
            {p.holeCards.length === 2
              ? <CardRow cards={p.holeCards} />
              : <CardRow cards={[]} faceDown />
            }
            <span className="text-xs" style={{ color: '#555' }}>${p.startChips.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Streets */}
      {hand.streets.map((s, i) => <StreetSection key={i} street={s} lang={lang} />)}

      {/* Result */}
      <div style={{ borderTop: '1px solid #1a3a28', paddingTop: 8, marginTop: 4 }}>
        <div className="text-xs font-bold mb-1" style={{ color: '#7db87d' }}>
          {lang === 'zh' ? '结果' : 'Result'} · {lang === 'zh' ? '底池' : 'Pot'} ${hand.totalPot.toLocaleString()}
        </div>
        {hand.winners.map((w, i) => (
          <div key={i} className="text-xs flex items-center gap-2">
            <span style={{ color: w.isHuman ? '#f0c040' : '#c0c0c0' }}>{w.playerName}</span>
            <span style={{ color: '#5ab8d8' }}>+${w.amount.toLocaleString()}</span>
            <span style={{ color: '#7db87d' }}>({w.handDescription})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HandHistoryPanel({ history, lang, onClose }: Props) {
  const [expandedRound, setExpandedRound] = useState<number | null>(null)

  const reversed = [...history].reverse()

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(0,0,0,0.85)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: '#0a2a18', borderBottom: '1px solid #1a4a28' }}
      >
        <span className="font-bold text-sm" style={{ color: '#f0c040' }}>
          {lang === 'zh' ? '牌局记录' : 'Hand History'}
        </span>
        <span className="text-xs" style={{ color: '#5a9a6a' }}>
          {history.length} {lang === 'zh' ? '局' : 'hands'}
        </span>
        <button
          onClick={onClose}
          className="text-sm px-3 py-1 rounded"
          style={{ color: '#7db87d', background: '#0f3a20', border: '1px solid #1a5a30' }}
        >
          ✕
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '0 0 24px' }}>
        {reversed.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: '#3a6a4a' }}>
            {lang === 'zh' ? '暂无记录' : 'No hands played yet'}
          </div>
        ) : (
          reversed.map((hand) => {
            const isOpen = expandedRound === hand.roundNumber
            const humanWon = hand.winners.some((w) => w.isHuman)
            const humanResult = hand.winners.find((w) => w.isHuman)
            return (
              <div
                key={hand.roundNumber}
                style={{ borderBottom: '1px solid #0f2a1a' }}
              >
                {/* Summary row */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  style={{ background: isOpen ? '#0f2a1a' : 'transparent' }}
                  onClick={() => setExpandedRound(isOpen ? null : hand.roundNumber)}
                >
                  <span className="text-xs font-bold" style={{ color: '#5a9a6a', minWidth: 52 }}>
                    #{hand.roundNumber}
                  </span>
                  <span className="flex gap-1">
                    {hand.communityCards.slice(0, 5).map((c, i) => <MiniCard key={i} card={c} />)}
                    {hand.communityCards.length === 0 && (
                      <span className="text-xs" style={{ color: '#3a5a48' }}>—</span>
                    )}
                  </span>
                  <span className="ml-auto text-xs font-bold" style={{ color: humanWon ? '#f0c040' : '#888' }}>
                    {humanResult
                      ? `+$${humanResult.amount.toLocaleString()}`
                      : (lang === 'zh' ? '未获胜' : 'Lost')}
                  </span>
                  <span style={{ color: '#3a6a4a', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-4" style={{ background: '#061510' }}>
                    <HandDetail hand={hand} lang={lang} />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
