'use client'
import { useState } from 'react'
import { useGameStore } from '@/lib/store/game-store'
import { strings } from '@/lib/i18n/strings'
import { HandRecord } from '@/lib/poker/game-engine'
import PlayerSeat from './PlayerSeat'
import CommunityCards from './CommunityCards'
import ActionBar from './ActionBar'
import HandHistoryPanel from './HandHistoryPanel'
import SessionReportModal from './SessionReportModal'

function computeVpipMap(handHistory: HandRecord[]): Record<number, string | null> {
  const handsDealt: Record<number, number> = {}
  const vpipHands: Record<number, number> = {}

  for (const hand of handHistory) {
    const preflopStreet = hand.streets.find((s) => s.phase === 'preflop')

    for (const pi of hand.playerInfo) {
      handsDealt[pi.id] = (handsDealt[pi.id] ?? 0) + 1

      if (preflopStreet) {
        // VPIP = voluntarily put $ in: any preflop call/raise/all-in (not BB check)
        const voluntaryAction = preflopStreet.actions.some(
          (a) => a.playerId === pi.id && (a.action === 'call' || a.action === 'raise' || a.action === 'all-in')
        )
        if (voluntaryAction) vpipHands[pi.id] = (vpipHands[pi.id] ?? 0) + 1
      }
    }
  }

  const result: Record<number, string | null> = {}
  for (const id of Object.keys(handsDealt).map(Number)) {
    const n = handsDealt[id]
    result[id] = n >= 2 ? `${Math.round(((vpipHands[id] ?? 0) / n) * 100)}%` : null
  }
  return result
}

// 7 fixed bot seat positions in clockwise order from human (bottom-left first, then left, top-left, top, top-right, right, bottom-right)
const BOT_SEAT_POSITIONS: React.CSSProperties[] = [
  { bottom: '22%', left: '6%' },                               // 0: bottom-left (1st clockwise from human)
  { top: '40%', left: '0%', transform: 'translateY(-50%)' },   // 1: mid-left
  { top: '5%', left: '8%' },                                   // 2: top-left
  { top: '1%', left: '50%', transform: 'translateX(-50%)' },   // 3: top-center
  { top: '5%', right: '8%' },                                  // 4: top-right
  { top: '40%', right: '0%', transform: 'translateY(-50%)' },  // 5: mid-right
  { bottom: '22%', right: '6%' },                              // 6: bottom-right (last before human)
]

// D/SB/BB token positions on felt (scaled ~0.6x toward center from seat)
const BOT_TOKEN_POSITIONS: React.CSSProperties[] = [
  { bottom: '30%', left: '18%' },
  { top: '44%', left: '13%', transform: 'translateY(-50%)' },
  { top: '16%', left: '18%' },
  { top: '14%', left: '50%', transform: 'translateX(-50%)' },
  { top: '16%', right: '18%' },
  { top: '44%', right: '13%', transform: 'translateY(-50%)' },
  { bottom: '30%', right: '18%' },
]

const HUMAN_TOKEN_STYLE: React.CSSProperties = {
  bottom: '17%', left: '50%', transform: 'translateX(-50%)',
}

function EmptySeat() {
  return (
    <div style={{ opacity: 0.18 }}>
      <div className="rounded-xl p-2 flex flex-col items-center gap-1"
        style={{ minWidth: 68, border: '2px dashed #2d6a4f', background: 'transparent' }}>
        <div style={{ fontSize: 18, color: '#3a6a4a' }}>👤</div>
        <div style={{ color: '#3a6a4a', fontSize: 9 }}>Empty</div>
      </div>
    </div>
  )
}

export default function PokerTable() {
  const { state, lang, startRound, resetGame, rebuy } = useGameStore()
  const t = strings[lang]
  const [showHistory, setShowHistory] = useState(false)
  const [showReport, setShowReport] = useState(false)

  const vpipMap = state ? computeVpipMap(state.handHistory) : {}

  if (!state) return null

  const { players, phase, communityCards, pots, currentPlayerIndex, winners } = state
  const humanPlayer = players.find((p) => p.isHuman)!

  const humanBroke = humanPlayer.chips === 0
  const allBotsBroke = players.filter((p) => !p.isHuman).every((p) => p.chips === 0)
  const showGameOver = phase === 'ended' || (phase === 'showdown' && humanBroke)

  const bots = players.filter((p) => !p.isHuman)

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: 'radial-gradient(ellipse at center, #0a2a18 0%, #051209 100%)', maxWidth: 860, margin: '0 auto' }}>

      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid #1a3a28' }}>
        <button
          onClick={resetGame}
          className="text-xs px-2 py-1 rounded"
          style={{ color: '#5a9a6a', background: '#0a2a18', border: '1px solid #1a4a28' }}>
          ← {t.game.backToLobby}
        </button>
        <div className="text-xs font-bold" style={{ color: '#7db87d' }}>
          {t.game.phase[phase] ?? phase}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowHistory(true)}
            className="text-xs px-2 py-1 rounded"
            style={{ color: '#5a9a6a', background: '#0a2a18', border: '1px solid #1a4a28' }}>
            {lang === 'zh' ? '📋 记录' : '📋 History'}
            {state.handHistory.length > 0 && (
              <span className="ml-1" style={{ color: '#f0c040' }}>({state.handHistory.length})</span>
            )}
          </button>
          {state.handHistory.length > 0 && (
            <button
              onClick={() => setShowReport(true)}
              className="text-xs px-2 py-1 rounded font-bold"
              style={{ color: '#f0c040', background: '#1a2a0a', border: '1px solid #4a6a1a' }}>
              {lang === 'zh' ? '📊 结束Session' : '📊 End Session'}
            </button>
          )}
        </div>
      </div>

      {/* Hand history panel */}
      {showHistory && (
        <HandHistoryPanel
          history={state.handHistory}
          lang={lang}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Session report modal */}
      {showReport && (
        <SessionReportModal
          handHistory={state.handHistory}
          humanProfile={state.humanProfile}
          lang={lang}
          bigBlind={state.config.bigBlind}
          onClose={() => setShowReport(false)}
        />
      )}

      {/* Table area - relative positioned for absolute bot placement */}
      <div className="relative flex-1" style={{ minHeight: 620 }}>

        {/* Green felt table background */}
        <div className="absolute"
          style={{
            top: '8%', left: '5%', right: '5%', bottom: '20%',
            background: 'radial-gradient(ellipse, #1a6b3a 0%, #0f4a28 60%, #0a3a1e 100%)',
            borderRadius: '50%',
            border: '3px solid #2d8a4f',
            boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.4), 0 0 30px rgba(0,0,0,0.5)',
          }} />

        {/* Community cards - center of table */}
        <div className="absolute" style={{ top: '42%', left: '50%', transform: 'translate(-50%, -50%)' }}>
          <CommunityCards
            cards={communityCards}
            phase={phase}
            pot={pots}
            lang={lang}
          />
        </div>

        {/* 7 fixed bot seats always rendered (empty placeholder when no player) */}
        {BOT_SEAT_POSITIONS.map((posStyle, i) => {
          const bot = bots[i]
          return (
            <div key={i} className="absolute" style={posStyle}>
              {bot ? (
                <PlayerSeat
                  player={bot}
                  isCurrentTurn={currentPlayerIndex === bot.id}
                  showCards={phase === 'showdown'}
                  isHuman={false}
                  lang={lang}
                  vpip={vpipMap[bot.id]}
                />
              ) : (
                <EmptySeat />
              )}
            </div>
          )
        })}

        {/* D / SB / BB tokens on the felt */}
        {players.map((p) => {
          const botIdx = bots.findIndex((b) => b.id === p.id)
          const tokenStyle = p.isHuman ? HUMAN_TOKEN_STYLE : (botIdx >= 0 ? BOT_TOKEN_POSITIONS[botIdx] : null)
          if (!tokenStyle) return null
          const label = p.isDealer ? 'D' : p.isSB ? 'SB' : p.isBB ? 'BB' : null
          if (!label) return null
          const bg = p.isDealer ? '#f0c040' : p.isSB ? '#3a7a5a' : '#5a3a9a'
          const textColor = p.isDealer ? '#000' : '#fff'
          return (
            <div
              key={`token-${p.id}`}
              className="absolute flex items-center justify-center rounded-full font-bold z-10"
              style={{
                ...tokenStyle,
                width: label === 'SB' || label === 'BB' ? 28 : 24,
                height: 24,
                background: bg,
                color: textColor,
                fontSize: 9,
                border: '2px solid rgba(255,255,255,0.4)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              }}
            >
              {label}
            </div>
          )
        })}

        {/* Human player - bottom center */}
        <div className="absolute" style={{ bottom: '2%', left: '50%', transform: 'translateX(-50%)' }}>
          <PlayerSeat
            player={humanPlayer}
            isCurrentTurn={currentPlayerIndex === humanPlayer.id}
            showCards={true}
            isHuman={true}
            lang={lang}
            vpip={vpipMap[humanPlayer.id]}
          />
        </div>
      </div>

      {/* Action bar / waiting state */}
      <div style={{ borderTop: '1px solid #1a3a28', minHeight: 120 }}>
        {phase === 'waiting' || phase === 'showdown' || phase === 'ended' ? (
          <div className="flex flex-col items-center gap-3 py-4 px-4">
            {/* Round winners */}
            {phase === 'showdown' && winners.length > 0 && (
              <div className="text-center">
                {winners.map((w) => (
                  <div key={w.playerId} className="text-sm" style={{ color: w.isHuman ? '#f0c040' : '#c0c0c0' }}>
                    {w.isHuman ? (lang === 'zh' ? '🏆 你赢了' : '🏆 You Win') : w.playerName} +${w.amount.toLocaleString()}
                    <span className="text-xs ml-1" style={{ color: '#7db87d' }}>({w.handDescription})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Game over / rebuy screen */}
            {showGameOver ? (
              <div className="flex flex-col items-center gap-3 w-full">
                {humanBroke ? (
                  <>
                    <div className="text-center text-lg font-bold" style={{ color: '#ff6b6b' }}>
                      {lang === 'zh' ? '💸 你破产了！' : '💸 Busted!'}
                    </div>
                    <button
                      onClick={rebuy}
                      className="w-full max-w-sm py-3 rounded-xl font-bold text-base transition-all active:scale-95"
                      style={{ background: 'linear-gradient(135deg, #1a8a3a, #0f5a26)', color: '#f0c040', border: '1px solid #2daa4f' }}>
                      {lang === 'zh' ? `重新买入 $${state.config.buyIn.toLocaleString()}` : `Rebuy $${state.config.buyIn.toLocaleString()}`}
                    </button>
                    <button
                      onClick={resetGame}
                      className="w-full max-w-sm py-2 rounded-xl font-bold text-sm"
                      style={{ background: '#2a1a1a', color: '#ff6b6b', border: '1px solid #5a2a2a' }}>
                      {t.game.backToLobby}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-center text-lg font-bold" style={{ color: allBotsBroke ? '#f0c040' : '#c0c0c0' }}>
                      {allBotsBroke
                        ? (lang === 'zh' ? '🏆 你赢得全桌！' : '🏆 You won the table!')
                        : (lang === 'zh' ? '游戏结束' : 'Game Over')}
                    </div>
                    <button
                      onClick={resetGame}
                      className="w-full max-w-sm py-3 rounded-xl font-bold text-base"
                      style={{ background: '#2a1a1a', color: '#ff6b6b', border: '1px solid #5a2a2a' }}>
                      {t.game.backToLobby}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={startRound}
                className="w-full max-w-sm py-3 rounded-xl font-bold text-base transition-all active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #1a8a3a, #0f5a26)',
                  color: '#f0c040',
                  border: '1px solid #2daa4f',
                }}>
                {t.game.newRound} ▶
              </button>
            )}
          </div>
        ) : (
          <ActionBar />
        )}
      </div>
    </div>
  )
}
