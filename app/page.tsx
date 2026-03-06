'use client'
import { useEffect } from 'react'
import GameSetup from '@/components/lobby/GameSetup'
import PokerTable from '@/components/game/PokerTable'
import { useGameStore } from '@/lib/store/game-store'

export default function Home() {
  const { state, startRound } = useGameStore()

  const handleStart = () => {
    // startRound is called here after setupGame is called inside GameSetup
    setTimeout(() => startRound(), 50)
  }

  // Show game table if game is in progress
  if (state) {
    return <PokerTable />
  }

  return <GameSetup onStart={handleStart} />
}
