'use client'
import { Card } from '@/lib/poker/deck'
import { GamePhase } from '@/lib/poker/game-engine'
import PlayingCard from './PlayingCard'

interface Props {
  cards: Card[]
  phase: GamePhase
  pot: number
  lang: 'zh' | 'en'
  compact?: boolean
}

const PHASE_LABELS = {
  zh: { preflop: '翻前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌', waiting: '', ended: '' },
  en: { preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown', waiting: '', ended: '' },
}

export default function CommunityCards({ cards, phase, pot, lang, compact }: Props) {
  const phaseLabel = PHASE_LABELS[lang][phase] ?? ''

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Phase label */}
      {phaseLabel && (
        <div className="font-semibold px-3 py-1 rounded-full"
          style={{ background: '#0a2a18', color: '#7db87d', border: '1px solid #2d6a4f', letterSpacing: '1px', fontSize: compact ? 11 : 14 }}>
          {phaseLabel}
        </div>
      )}

      {/* Community cards */}
      <div className={`flex items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <PlayingCard
            key={i}
            card={cards[i]}
            faceDown={!cards[i]}
            size={compact ? 'md' : 'xl'}
          />
        ))}
      </div>

      {/* Pot */}
      <div className="flex items-center gap-2 px-4 py-1.5 rounded-full"
        style={{ background: '#0a2a18', border: '1px solid #2d6a4f' }}>
        <span className="font-semibold" style={{ color: '#7db87d', fontSize: compact ? 12 : 14 }}>{lang === 'zh' ? '底池' : 'Pot'}</span>
        <span className="font-bold" style={{ color: '#f0c040', fontSize: compact ? 14 : 18 }}>${pot.toLocaleString()}</span>
      </div>
    </div>
  )
}
