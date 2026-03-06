'use client'
import { useState } from 'react'
import { useGameStore } from '@/lib/store/game-store'
import { GameConfig } from '@/lib/poker/game-engine'
import { strings } from '@/lib/i18n/strings'

const BLIND_PRESETS = [
  { sb: 1, bb: 2 },
  { sb: 5, bb: 10 },
  { sb: 25, bb: 50 },
  { sb: 50, bb: 100 },
  { sb: 100, bb: 200 },
  { sb: 500, bb: 1000 },
]

const BUYIN_MULTIPLIERS = [20, 50, 100, 200]
const PLAYER_OPTIONS = [2, 3, 4, 5, 6, 7, 8]

interface Props {
  onStart: () => void
}

export default function GameSetup({ onStart }: Props) {
  const { setupGame, lang, setLang } = useGameStore()
  const t = strings[lang]
  const [sbIndex, setSbIndex] = useState(1) // default 5/10
  const [buyInMultiplier, setBuyInMultiplier] = useState(100)
  const [numPlayers, setNumPlayers] = useState(5)

  const { sb, bb } = BLIND_PRESETS[sbIndex]
  const buyIn = bb * buyInMultiplier

  const handleStart = () => {
    const config: GameConfig = {
      smallBlind: sb,
      bigBlind: bb,
      buyIn,
      numPlayers,
    }
    setupGame(config)
    onStart()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse at center, #0a2a18 0%, #051209 100%)' }}>
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-1" style={{ color: '#f0c040', fontFamily: 'Georgia, serif', letterSpacing: '2px' }}>
          ♠ {t.title} ♦
        </h1>
        <p className="text-sm" style={{ color: '#7db87d' }}>{t.subtitle}</p>
      </div>

      {/* Lang toggle */}
      <button
        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        className="absolute top-4 right-4 px-3 py-1 rounded-full text-sm font-medium transition-all"
        style={{ background: '#1a3a28', color: '#7db87d', border: '1px solid #2d6a4f' }}
      >
        {lang === 'zh' ? 'EN' : '中文'}
      </button>

      {/* Setup Card */}
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-6"
        style={{ background: 'linear-gradient(145deg, #0f2d1e, #0a1f14)', border: '1px solid #2d6a4f', boxShadow: '0 0 40px rgba(0,0,0,0.6)' }}>

        {/* Blinds */}
        <div>
          <label className="block text-xs font-semibold mb-2 uppercase tracking-widest" style={{ color: '#7db87d' }}>
            {t.setup.smallBlind} / {t.setup.bigBlind}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {BLIND_PRESETS.map((preset, i) => (
              <button
                key={i}
                onClick={() => setSbIndex(i)}
                className="py-2 px-1 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: sbIndex === i ? '#1a6b3a' : '#0a2a18',
                  color: sbIndex === i ? '#f0c040' : '#7db87d',
                  border: sbIndex === i ? '1px solid #f0c040' : '1px solid #2d6a4f',
                }}
              >
                {preset.sb}/{preset.bb}
              </button>
            ))}
          </div>
          <p className="text-center text-xs mt-2" style={{ color: '#5a9a6a' }}>
            SB ${sb} / BB ${bb}
          </p>
        </div>

        {/* Buy-in */}
        <div>
          <label className="block text-xs font-semibold mb-2 uppercase tracking-widest" style={{ color: '#7db87d' }}>
            {t.setup.buyIn}: <span style={{ color: '#f0c040' }}>${buyIn.toLocaleString()}</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {BUYIN_MULTIPLIERS.map((mult) => (
              <button
                key={mult}
                onClick={() => setBuyInMultiplier(mult)}
                className="py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: buyInMultiplier === mult ? '#1a6b3a' : '#0a2a18',
                  color: buyInMultiplier === mult ? '#f0c040' : '#7db87d',
                  border: buyInMultiplier === mult ? '1px solid #f0c040' : '1px solid #2d6a4f',
                }}
              >
                {mult}BB
              </button>
            ))}
          </div>
        </div>

        {/* Player count */}
        <div>
          <label className="block text-xs font-semibold mb-2 uppercase tracking-widest" style={{ color: '#7db87d' }}>
            {t.setup.players}: <span style={{ color: '#f0c040' }}>{t.setup.playersLabel(numPlayers)}</span>
          </label>
          <div className="flex gap-2 flex-wrap">
            {PLAYER_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setNumPlayers(n)}
                className="w-10 h-10 rounded-full text-sm font-bold transition-all"
                style={{
                  background: numPlayers === n ? '#1a6b3a' : '#0a2a18',
                  color: numPlayers === n ? '#f0c040' : '#7db87d',
                  border: numPlayers === n ? '1px solid #f0c040' : '1px solid #2d6a4f',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-xl p-3 text-xs" style={{ background: '#051209', border: '1px solid #1a3a28' }}>
          <div className="flex justify-between py-0.5" style={{ color: '#7db87d' }}>
            <span>{t.setup.smallBlind}</span><span style={{ color: '#f0c040' }}>${sb}</span>
          </div>
          <div className="flex justify-between py-0.5" style={{ color: '#7db87d' }}>
            <span>{t.setup.bigBlind}</span><span style={{ color: '#f0c040' }}>${bb}</span>
          </div>
          <div className="flex justify-between py-0.5" style={{ color: '#7db87d' }}>
            <span>{t.setup.buyIn}</span><span style={{ color: '#f0c040' }}>${buyIn.toLocaleString()}</span>
          </div>
          <div className="flex justify-between py-0.5" style={{ color: '#7db87d' }}>
            <span>{t.setup.players}</span><span style={{ color: '#f0c040' }}>{numPlayers}</span>
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={handleStart}
          className="w-full py-4 rounded-xl text-lg font-bold tracking-wider transition-all active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #1a8a3a, #0f5a26)',
            color: '#f0c040',
            border: '1px solid #2daa4f',
            boxShadow: '0 4px 20px rgba(26,138,58,0.4)',
          }}
        >
          {t.setup.startGame} ▶
        </button>
      </div>
    </div>
  )
}
