'use client'
import { create } from 'zustand'
import {
  GameState,
  GameConfig,
  PlayerAction,
  initGame,
  startNewRound,
  applyAction,
  processBotTurn,
  getCallAmount,
  getMinRaise,
  getMaxRaise,
} from '../poker/game-engine'

interface GameStore {
  state: GameState | null
  isAnimating: boolean
  lang: 'zh' | 'en'

  // Actions
  setupGame: (config: GameConfig) => void
  startRound: () => void
  playerAction: (action: PlayerAction, raiseAmount?: number) => void
  processNextBot: () => void
  setLang: (lang: 'zh' | 'en') => void
  resetGame: () => void
  rebuy: () => void

  // Derived helpers
  getCallAmt: () => number
  getMinRaiseAmt: () => number
  getMaxRaiseAmt: () => number
  isMyTurn: () => boolean
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  isAnimating: false,
  lang: 'zh',

  setupGame: (config) => {
    const state = initGame(config)
    // Rehydrate human profile from previous session
    try {
      const saved = localStorage.getItem('humanProfile')
      if (saved) state.humanProfile = JSON.parse(saved)
    } catch { /* ignore parse errors */ }
    set({ state })
  },

  startRound: () => {
    const { state } = get()
    if (!state) return
    const newState = startNewRound(state)
    set({ state: newState })
    // If first player to act is a bot, trigger bot processing
    if (!newState.players[newState.currentPlayerIndex]?.isHuman) {
      setTimeout(() => get().processNextBot(), 800)
    }
  },

  playerAction: (action, raiseAmount) => {
    const { state } = get()
    if (!state) return
    const humanPlayer = state.players.find((p) => p.isHuman)
    if (!humanPlayer) return
    const newState = applyAction(state, humanPlayer.id, action, raiseAmount)
    set({ state: newState })
    if (newState.phase === 'showdown') {
      try { localStorage.setItem('humanProfile', JSON.stringify(newState.humanProfile)) } catch { /* ignore */ }
    }

    const humanFolded = action === 'fold'
    const botDelay = humanFolded ? 200 : 800

    // After player acts, process bots
    if (newState.phase !== 'showdown' && newState.phase !== 'ended') {
      if (!newState.players[newState.currentPlayerIndex]?.isHuman) {
        setTimeout(() => get().processNextBot(), botDelay)
      }
    }

    // If hand ended immediately after fold (e.g. everyone else already folded), auto-advance
    if (humanFolded && (newState.phase === 'showdown' || newState.phase === 'ended')) {
      const humanAfter = newState.players.find((p) => p.isHuman)
      if (humanAfter && humanAfter.chips > 0) {
        setTimeout(() => get().startRound(), 1500)
      }
    }
  },

  processNextBot: () => {
    const { state } = get()
    if (!state) return
    if (state.phase === 'showdown' || state.phase === 'ended') return

    const humanPlayer = state.players.find((p) => p.isHuman)
    const isHumanFolded = humanPlayer?.isFolded === true
    const botDelay = isHumanFolded ? 200 : 800

    const currentPlayer = state.players[state.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.isHuman) return

    const newState = processBotTurn(state)
    set({ state: newState })
    if (newState.phase === 'showdown') {
      try { localStorage.setItem('humanProfile', JSON.stringify(newState.humanProfile)) } catch { /* ignore */ }
    }

    if (newState.phase === 'showdown' || newState.phase === 'ended') {
      // Auto-start next round after brief results display, unless human is broke
      if (isHumanFolded) {
        const humanAfter = newState.players.find((p) => p.isHuman)
        if (humanAfter && humanAfter.chips > 0) {
          setTimeout(() => get().startRound(), 1500)
        }
      }
      return
    }

    // Continue processing bots
    if (!newState.players[newState.currentPlayerIndex]?.isHuman) {
      setTimeout(() => get().processNextBot(), botDelay)
    }
  },

  setLang: (lang) => set({ lang }),

  resetGame: () => set({ state: null }),

  rebuy: () => {
    const { state } = get()
    if (!state) return
    const players = state.players.map((p) =>
      p.isHuman ? { ...p, chips: state.config.buyIn } : p
    )
    set({ state: { ...state, players, phase: 'waiting' } })
  },

  getCallAmt: () => {
    const { state } = get()
    if (!state) return 0
    const human = state.players.find((p) => p.isHuman)
    if (!human) return 0
    return getCallAmount(state, human.id)
  },

  getMinRaiseAmt: () => {
    const { state } = get()
    if (!state) return 0
    return getMinRaise(state)
  },

  getMaxRaiseAmt: () => {
    const { state } = get()
    if (!state) return 0
    const human = state.players.find((p) => p.isHuman)
    if (!human) return 0
    return getMaxRaise(state, human.id)
  },

  isMyTurn: () => {
    const { state } = get()
    if (!state) return false
    if (state.phase === 'showdown' || state.phase === 'ended' || state.phase === 'waiting') return false
    const currentPlayer = state.players[state.currentPlayerIndex]
    return currentPlayer?.isHuman === true
  },
}))
