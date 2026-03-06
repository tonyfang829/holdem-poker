'use client'
import { Player } from '@/lib/poker/game-engine'
import PlayingCard from './PlayingCard'

interface Props {
  player: Player
  isCurrentTurn: boolean
  showCards?: boolean
  isHuman?: boolean
  lang: 'zh' | 'en'
  compact?: boolean
  vpip?: string | null
}

const AVATAR_EMOJIS = ['🎩', '🤠', '😎', '🦊', '🐯', '🦅', '🐻', '🦁', '🐺']

export default function PlayerSeat({ player, isCurrentTurn, showCards, isHuman, lang, compact, vpip }: Props) {
  const chipColor = isHuman ? '#f0c040' : '#c0c0c0'
  const borderColor = isCurrentTurn ? '#f0c040' : player.isFolded ? '#333' : '#2d6a4f'
  const opacity = player.isFolded ? 0.4 : 1

  const displayBet = player.currentBet > 0 ? player.currentBet : null
  const avatarEmoji = isHuman ? '😊' : AVATAR_EMOJIS[player.id % AVATAR_EMOJIS.length]

  return (
    <div className="flex flex-col items-center gap-1" style={{ opacity }}>
      {/* Bet chip above player */}
      {displayBet && (
        <div className="font-bold px-2 py-0.5 rounded-full"
          style={{ background: '#1a3a28', color: '#f0c040', border: '1px solid #2d6a4f', fontSize: compact ? 14 : 19 }}>
          ${displayBet}
        </div>
      )}

      {/* Player box */}
      <div
        className="rounded-xl p-2 flex flex-col items-center gap-1 transition-all"
        style={{
          background: isCurrentTurn
            ? 'linear-gradient(145deg, #1a4a2a, #0f2d1a)'
            : 'linear-gradient(145deg, #0f2a1a, #081810)',
          border: `2px solid ${borderColor}`,
          boxShadow: isCurrentTurn ? '0 0 12px rgba(240,192,64,0.4)' : 'none',
          minWidth: compact ? 68 : isHuman ? 116 : 90,
        }}
      >
        {/* Avatar */}
        <div className="text-3xl">{avatarEmoji}</div>

        {/* Name */}
        <div className="font-semibold text-center truncate max-w-[90px]"
          style={{ color: isHuman ? '#f0c040' : '#c0d0c0', fontSize: compact ? 12 : 16 }}>
          {isHuman ? (lang === 'zh' ? '你' : 'You') : player.name}
        </div>

        {/* Chips */}
        <div className="font-bold" style={{ color: chipColor, fontSize: compact ? 12 : 16 }}>
          ${player.chips.toLocaleString()}
        </div>

        {/* VPIP stat */}
        {vpip && (
          <div style={{ color: '#6a9a7a', fontSize: 13 }}>
            VPIP {vpip}
          </div>
        )}

        {/* Status badges */}
        <div className="flex gap-1">
          {player.isDealer && (
            <span className="px-1 rounded font-bold"
              style={{ background: '#f0c040', color: '#000', fontSize: 13 }}>D</span>
          )}
          {player.isSB && (
            <span className="px-1 rounded font-bold"
              style={{ background: '#3a7a5a', color: '#fff', fontSize: 13 }}>SB</span>
          )}
          {player.isBB && (
            <span className="px-1 rounded font-bold"
              style={{ background: '#5a3a9a', color: '#fff', fontSize: 13 }}>BB</span>
          )}
          {player.isAllIn && (
            <span className="px-1 rounded font-bold"
              style={{ background: '#cc3333', color: '#fff', fontSize: 13 }}>ALL IN</span>
          )}
          {player.isFolded && (
            <span className="px-1 rounded font-bold"
              style={{ background: '#333', color: '#888', fontSize: 13 }}>
              {lang === 'zh' ? '弃牌' : 'FOLD'}
            </span>
          )}
        </div>
      </div>

      {/* Hole cards */}
      {player.holeCards.length === 2 && (
        <div className="flex gap-0.5 mt-1">
          <PlayingCard
            card={showCards ? player.holeCards[0] : undefined}
            faceDown={!showCards}
            size={compact ? 'sm' : isHuman ? 'xl' : 'md'}
          />
          <PlayingCard
            card={showCards ? player.holeCards[1] : undefined}
            faceDown={!showCards}
            size={compact ? 'sm' : isHuman ? 'xl' : 'md'}
          />
        </div>
      )}

      {/* Last action label */}
      {player.lastAction && !player.isFolded && (() => {
        const action = player.lastAction!
        const styleMap: Record<string, { bg: string; color: string; label: string }> = {
          fold:  { bg: '#3a1a1a', color: '#ff6666', label: lang === 'zh' ? '弃牌' : 'FOLD' },
          check: { bg: '#1a2a3a', color: '#6ab0ff', label: lang === 'zh' ? '过牌' : 'CHECK' },
          call:  { bg: '#1a3a1a', color: '#66dd88', label: lang === 'zh' ? '跟注' : 'CALL' },
          raise: { bg: '#3a2a00', color: '#ffcc00', label: lang === 'zh' ? '加注' : 'RAISE' },
          allin: { bg: '#4a0000', color: '#ff4444', label: 'ALL IN' },
          bet:   { bg: '#2a1a3a', color: '#cc88ff', label: lang === 'zh' ? '下注' : 'BET' },
        }
        const key = action.toLowerCase().replace(/\s+/g, '')
        const s = styleMap[key] ?? { bg: '#1a3a28', color: '#aaddbb', label: action.toUpperCase() }
        return (
          <div className="px-2 py-1 rounded-md font-bold tracking-wide text-center"
            style={{
              background: s.bg,
              color: s.color,
              fontSize: compact ? 14 : 19,
              border: `1px solid ${s.color}44`,
              minWidth: 56,
              textShadow: `0 0 6px ${s.color}88`,
            }}>
            {s.label}
          </div>
        )
      })()}
    </div>
  )
}
