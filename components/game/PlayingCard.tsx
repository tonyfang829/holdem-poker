'use client'
import { Card, rankToString, suitToSymbol } from '@/lib/poker/deck'

interface Props {
  card?: Card
  faceDown?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZE_STYLES = {
  sm: { width: 48,  height: 67,  fontSize: 16, suitSize: 20 },
  md: { width: 66,  height: 94,  fontSize: 22, suitSize: 28 },
  lg: { width: 90,  height: 130, fontSize: 29, suitSize: 38 },
  xl: { width: 110, height: 158, fontSize: 35, suitSize: 46 },
}

export default function PlayingCard({ card, faceDown = false, size = 'md', className = '' }: Props) {
  const dims = SIZE_STYLES[size]

  if (faceDown || !card) {
    return (
      <div
        className={`rounded-lg flex items-center justify-center select-none ${className}`}
        style={{
          width: dims.width,
          height: dims.height,
          background: 'linear-gradient(135deg, #1a3a8a, #0d2060)',
          border: '1px solid #2a5acc',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}
      >
        <span style={{ fontSize: dims.suitSize, opacity: 0.5 }}>🂠</span>
      </div>
    )
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds'
  const color = isRed ? '#cc2222' : '#111'
  const rank = rankToString(card.rank)
  const suit = suitToSymbol(card.suit)

  return (
    <div
      className={`rounded-lg flex flex-col justify-between select-none ${className}`}
      style={{
        width: dims.width,
        height: dims.height,
        background: '#fff',
        border: '1px solid #ddd',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        padding: '2px 3px',
        fontFamily: 'Georgia, serif',
        fontWeight: 'bold',
      }}
    >
      <div style={{ fontSize: dims.fontSize, color, lineHeight: 1 }}>
        <div>{rank}</div>
        <div style={{ fontSize: dims.suitSize - 4 }}>{suit}</div>
      </div>
      <div style={{ fontSize: dims.fontSize, color, lineHeight: 1, transform: 'rotate(180deg)', alignSelf: 'flex-end' }}>
        <div>{rank}</div>
        <div style={{ fontSize: dims.suitSize - 4 }}>{suit}</div>
      </div>
    </div>
  )
}
