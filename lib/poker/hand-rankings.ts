import { Card, Rank, Suit } from './deck'

export type HandRank =
  | 'royal-flush'
  | 'straight-flush'
  | 'four-of-a-kind'
  | 'full-house'
  | 'flush'
  | 'straight'
  | 'three-of-a-kind'
  | 'two-pair'
  | 'one-pair'
  | 'high-card'

export interface HandResult {
  rank: HandRank
  rankValue: number // 0–8, higher = better
  tiebreakers: number[] // for comparing same rank hands
  bestFive: Card[]
}

const HAND_RANK_VALUE: Record<HandRank, number> = {
  'royal-flush': 8,
  'straight-flush': 7,
  'four-of-a-kind': 6,
  'full-house': 5,
  flush: 4,
  straight: 3,
  'three-of-a-kind': 2,
  'two-pair': 1,
  'one-pair': 0,
  'high-card': -1,
}

export function evaluateBestHand(cards: Card[]): HandResult {
  // Generate all C(n,5) combinations from given cards
  const combos = getCombinations(cards, 5)
  let best: HandResult | null = null
  for (const combo of combos) {
    const result = evaluateFiveCardHand(combo)
    if (!best || compareHands(result, best) > 0) {
      best = result
    }
  }
  return best!
}

function getCombinations(arr: Card[], k: number): Card[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [first, ...rest] = arr
  const withFirst = getCombinations(rest, k - 1).map((combo) => [first, ...combo])
  const withoutFirst = getCombinations(rest, k)
  return [...withFirst, ...withoutFirst]
}

export function compareHands(a: HandResult, b: HandResult): number {
  if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const av = a.tiebreakers[i] ?? 0
    const bv = b.tiebreakers[i] ?? 0
    if (av !== bv) return av - bv
  }
  return 0
}

function evaluateFiveCardHand(cards: Card[]): HandResult {
  const sorted = [...cards].sort((a, b) => b.rank - a.rank)
  const ranks = sorted.map((c) => c.rank)
  const suits = sorted.map((c) => c.suit)

  const isFlush = suits.every((s) => s === suits[0])
  const isStraight = checkStraight(ranks)
  const rankCounts = countRanks(ranks)
  const counts = Object.values(rankCounts).sort((a, b) => b - a)

  if (isFlush && isStraight && ranks[0] === 14 && ranks[4] === 10) {
    return { rank: 'royal-flush', rankValue: 8, tiebreakers: [], bestFive: sorted }
  }
  if (isFlush && isStraight) {
    const top = isStraight === 'wheel' ? 5 : ranks[0]
    return { rank: 'straight-flush', rankValue: 7, tiebreakers: [top], bestFive: sorted }
  }
  if (counts[0] === 4) {
    const quad = findRanksByCount(rankCounts, 4)[0]
    const kicker = findRanksByCount(rankCounts, 1)[0]
    return { rank: 'four-of-a-kind', rankValue: 6, tiebreakers: [quad, kicker], bestFive: sorted }
  }
  if (counts[0] === 3 && counts[1] === 2) {
    const trips = findRanksByCount(rankCounts, 3)[0]
    const pair = findRanksByCount(rankCounts, 2)[0]
    return { rank: 'full-house', rankValue: 5, tiebreakers: [trips, pair], bestFive: sorted }
  }
  if (isFlush) {
    return { rank: 'flush', rankValue: 4, tiebreakers: ranks, bestFive: sorted }
  }
  if (isStraight) {
    const top = isStraight === 'wheel' ? 5 : ranks[0]
    return { rank: 'straight', rankValue: 3, tiebreakers: [top], bestFive: sorted }
  }
  if (counts[0] === 3) {
    const trips = findRanksByCount(rankCounts, 3)[0]
    const kickers = findRanksByCount(rankCounts, 1).sort((a, b) => b - a)
    return { rank: 'three-of-a-kind', rankValue: 2, tiebreakers: [trips, ...kickers], bestFive: sorted }
  }
  if (counts[0] === 2 && counts[1] === 2) {
    const pairs = findRanksByCount(rankCounts, 2).sort((a, b) => b - a)
    const kicker = findRanksByCount(rankCounts, 1)[0]
    return { rank: 'two-pair', rankValue: 1, tiebreakers: [...pairs, kicker], bestFive: sorted }
  }
  if (counts[0] === 2) {
    const pair = findRanksByCount(rankCounts, 2)[0]
    const kickers = findRanksByCount(rankCounts, 1).sort((a, b) => b - a)
    return { rank: 'one-pair', rankValue: 0, tiebreakers: [pair, ...kickers], bestFive: sorted }
  }
  return { rank: 'high-card', rankValue: -1, tiebreakers: ranks, bestFive: sorted }
}

function checkStraight(sortedRanks: Rank[]): false | 'normal' | 'wheel' {
  // Normal straight
  let isNormal = true
  for (let i = 0; i < sortedRanks.length - 1; i++) {
    if (sortedRanks[i] - sortedRanks[i + 1] !== 1) {
      isNormal = false
      break
    }
  }
  if (isNormal) return 'normal'
  // Wheel: A-2-3-4-5
  const wheel = [14, 5, 4, 3, 2]
  if (sortedRanks.every((r, i) => r === wheel[i])) return 'wheel'
  return false
}

function countRanks(ranks: Rank[]): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const r of ranks) {
    counts[r] = (counts[r] ?? 0) + 1
  }
  return counts
}

function findRanksByCount(rankCounts: Record<number, number>, count: number): number[] {
  return Object.entries(rankCounts)
    .filter(([, c]) => c === count)
    .map(([r]) => Number(r))
    .sort((a, b) => b - a)
}

export const HAND_RANK_NAMES_ZH: Record<HandRank, string> = {
  'royal-flush': '皇家同花顺',
  'straight-flush': '同花顺',
  'four-of-a-kind': '四条',
  'full-house': '葫芦',
  flush: '同花',
  straight: '顺子',
  'three-of-a-kind': '三条',
  'two-pair': '两对',
  'one-pair': '一对',
  'high-card': '高牌',
}

export const HAND_RANK_NAMES_EN: Record<HandRank, string> = {
  'royal-flush': 'Royal Flush',
  'straight-flush': 'Straight Flush',
  'four-of-a-kind': 'Four of a Kind',
  'full-house': 'Full House',
  flush: 'Flush',
  straight: 'Straight',
  'three-of-a-kind': 'Three of a Kind',
  'two-pair': 'Two Pair',
  'one-pair': 'One Pair',
  'high-card': 'High Card',
}
