'use client'
import { Card } from '@/lib/poker/deck'
import { GamePhase } from '@/lib/poker/game-engine'
import PlayingCard from './PlayingCard'

interface Props {
  cards: Card[]
  phase: GamePhase
  pot: number
  lang: 'zh' | 'en'
}

const PHASE_LABELS = {
  zh: { preflop: '翻前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌', waiting: '', ended: '' },
  en: { preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown', waiting: '', ended: '' },
}

export default function CommunityCards({ cards, phase, pot, lang }: Props) {
  const phaseLabel = PHASE_LABELS[lang][phase] ?? ''

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Phase label */}
      {phaseLabel && (
        <div className="font-semibold px-3 py-1 rounded-full"
          style={{ background: '#0a2a18', color: '#7db87d', border: '1px solid #2d6a4f', letterSpacing: '1px', fontSize: 14 }}>
          {phaseLabel}
        </div>
      )}

      {/* Community cards */}
      <div className="flex gap-1.5 items-center">
        {[0, 1, 2, 3, 4].map((i) => (
          <PlayingCard
            key={i}
            card={cards[i]}
            faceDown={!cards[i]}
            size="xl"
          />
        ))}
      </div>

      {/* Pot */}
      <div className="flex items-center gap-2 px-4 py-1.5 rounded-full"
        style={{ background: '#0a2a18', border: '1px solid #2d6a4f' }}>
        <span className="font-semibold" style={{ color: '#7db87d', fontSize: 14 }}>{lang === 'zh' ? '底池' : 'Pot'}</span>
        <span className="font-bold" style={{ color: '#f0c040', fontSize: 18 }}>${pot.toLocaleString()}</span>
      </div>
    </div>
  )
}
