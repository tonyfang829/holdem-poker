'use client'
import { useState } from 'react'
import { useGameStore } from '@/lib/store/game-store'
import { strings } from '@/lib/i18n/strings'

export default function ActionBar() {
  const { state, playerAction, lang, getCallAmt, getMinRaiseAmt, getMaxRaiseAmt, isMyTurn } = useGameStore()
  const t = strings[lang].game
  const [showRaise, setShowRaise] = useState(false)
  const [raiseValue, setRaiseValue] = useState(0)

  if (!state || !isMyTurn()) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="text-sm animate-pulse" style={{ color: '#5a9a6a' }}>
          {t.waitingForBots}
        </div>
      </div>
    )
  }

  const human = state.players.find((p) => p.isHuman)
  if (!human || human.isFolded || human.isAllIn) return null

  const callAmt = getCallAmt()
  const minRaise = getMinRaiseAmt()
  const maxRaise = getMaxRaiseAmt()
  const canCheck = callAmt === 0

  // Raise is only meaningful when at least one opponent can respond.
  // If every non-human player is folded or all-in, hide the raise button.
  const canRaise = state.players.some((p) => !p.isHuman && !p.isFolded && !p.isAllIn)

  const handleRaiseConfirm = () => {
    const amount = raiseValue || minRaise
    playerAction('raise', amount)
    setShowRaise(false)
  }

  const handleRaiseClick = () => {
    setRaiseValue(minRaise)
    setShowRaise(true)
  }

  return (
    <div className="w-full" style={{ background: 'linear-gradient(to top, #051209, transparent)', paddingTop: 8 }}>
      {/* Raise slider panel */}
      {canRaise && showRaise && (
        <div className="px-4 py-3 mb-2 rounded-xl mx-2"
          style={{ background: '#0a2a18', border: '1px solid #2d6a4f' }}>
          <div className="flex justify-between text-xs mb-2" style={{ color: '#7db87d' }}>
            <span>{lang === 'zh' ? '加注金额' : 'Raise to'}</span>
            <span style={{ color: '#f0c040', fontWeight: 'bold' }}>${raiseValue.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min={minRaise}
            max={maxRaise}
            value={raiseValue}
            step={state.config.bigBlind}
            onChange={(e) => setRaiseValue(Number(e.target.value))}
            className="w-full accent-yellow-400"
            style={{ accentColor: '#f0c040' }}
          />
          <div className="flex justify-between text-xs mt-1" style={{ color: '#5a7a6a' }}>
            <span>${minRaise.toLocaleString()}</span>
            <span>All-in ${maxRaise.toLocaleString()}</span>
          </div>
          {/* Quick raise buttons */}
          <div className="flex gap-2 mt-2">
            {[0.5, 1, 2].map((mult) => {
              const v = Math.min(Math.round(state.pots * mult / state.config.bigBlind) * state.config.bigBlind, maxRaise)
              if (v < minRaise) return null
              return (
                <button key={mult}
                  onClick={() => setRaiseValue(v)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: '#1a3a28', color: '#7db87d', border: '1px solid #2d6a4f' }}>
                  {mult === 0.5 ? '½' : mult === 1 ? '1x' : '2x'} Pot
                </button>
              )
            })}
            <button
              onClick={() => setRaiseValue(maxRaise)}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: '#2a1a1a', color: '#ff6b6b', border: '1px solid #5a2a2a' }}>
              All-in
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 px-2 pb-2">
        {/* Fold */}
        <button
          onClick={() => { playerAction('fold'); setShowRaise(false) }}
          className="flex-1 py-4 rounded-xl font-bold text-base transition-all active:scale-95"
          style={{ background: '#2a1a1a', color: '#ff6b6b', border: '1px solid #5a2a2a', minHeight: 52 }}>
          {t.fold}
        </button>

        {/* Check / Call */}
        <button
          onClick={() => { playerAction(canCheck ? 'check' : 'call'); setShowRaise(false) }}
          className="flex-1 py-4 rounded-xl font-bold text-base transition-all active:scale-95"
          style={{
            background: canCheck ? '#1a4a2a' : '#1a3a6a',
            color: canCheck ? '#7de87d' : '#7db8f0',
            border: `1px solid ${canCheck ? '#2d8a4f' : '#2d5aaa'}`,
            minHeight: 52,
          }}>
          {canCheck ? t.check : `${t.call} $${callAmt.toLocaleString()}`}
        </button>

        {/* Raise — hidden when all opponents are all-in (no one can respond) */}
        {canRaise && (showRaise ? (
          <button
            onClick={handleRaiseConfirm}
            className="flex-1 py-4 rounded-xl font-bold text-base transition-all active:scale-95"
            style={{ background: '#3a2a0a', color: '#f0c040', border: '1px solid #8a6a10', minHeight: 52 }}>
            {t.confirm}
          </button>
        ) : (
          <button
            onClick={handleRaiseClick}
            className="flex-1 py-4 rounded-xl font-bold text-base transition-all active:scale-95"
            style={{ background: '#1a3a28', color: '#f0c040', border: '1px solid #2d6a3f', minHeight: 52 }}
            disabled={human.chips === 0}>
            {t.raise} ▲
          </button>
        ))}
      </div>
    </div>
  )
}
