import { Card, createDeck, shuffleDeck } from './deck'
import { evaluateBestHand, compareHands, HandResult } from './hand-rankings'
import { calculatePots, distributePots } from './pot-manager'
import { makeBotDecision, BotPersonality, randomPersonality, BOT_NAMES, HumanProfile, defaultHumanProfile } from './bot-ai'

export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended'
export type PlayerAction = 'fold' | 'check' | 'call' | 'raise' | 'all-in'

export interface PlayerConfig {
  isHuman: boolean
  name: string
  personality?: BotPersonality
}

export interface Player {
  id: number
  name: string
  isHuman: boolean
  personality: BotPersonality
  chips: number
  holeCards: [Card, Card] | []
  currentBet: number     // bet in current betting round
  totalBetThisHand: number  // total contributed to pots
  isFolded: boolean
  isAllIn: boolean
  isDealer: boolean
  isSB: boolean
  isBB: boolean
  lastAction?: PlayerAction
  handResult?: HandResult
}

export interface GameConfig {
  smallBlind: number
  bigBlind: number
  buyIn: number
  numPlayers: number // 2–9
}

export interface GameState {
  phase: GamePhase
  players: Player[]
  deck: Card[]
  communityCards: Card[]
  pots: number // total pot (simplified for display)
  currentPlayerIndex: number
  dealerIndex: number
  currentBet: number // highest bet in current round
  minRaise: number
  lastRaiseAmount: number
  log: string[]
  winners: WinnerInfo[]
  roundNumber: number
  config: GameConfig
  handHistory: HandRecord[]
  currentStreetLog: ActionLog[]
  currentStreets: StreetLog[]
  playerStartChips: Record<number, number>
  humanProfile: HumanProfile
}

export interface WinnerInfo {
  playerId: number
  playerName: string
  amount: number
  handDescription: string
  isHuman: boolean
}

export interface ActionLog {
  playerName: string
  playerId: number
  isHuman: boolean
  action: PlayerAction
  amount: number      // chips spent (0 for check/fold)
  chipsBefore: number
}

export interface StreetLog {
  phase: 'preflop' | 'flop' | 'turn' | 'river'
  communityCards: Card[]
  actions: ActionLog[]
}

export interface HandRecord {
  roundNumber: number
  dealerName: string
  config: { smallBlind: number; bigBlind: number }
  playerInfo: { id: number; name: string; isHuman: boolean; holeCards: Card[]; startChips: number }[]
  streets: StreetLog[]
  communityCards: Card[]
  winners: WinnerInfo[]
  totalPot: number
}

export function initGame(config: GameConfig, humanName = 'You'): GameState {
  const { numPlayers, buyIn } = config

  const players: Player[] = []
  // Human is always seat 0
  players.push({
    id: 0,
    name: humanName,
    isHuman: true,
    personality: 'tight-passive',
    chips: buyIn,
    holeCards: [],
    currentBet: 0,
    totalBetThisHand: 0,
    isFolded: false,
    isAllIn: false,
    isDealer: false,
    isSB: false,
    isBB: false,
  })

  const shuffledNames = [...BOT_NAMES].sort(() => Math.random() - 0.5)
  for (let i = 1; i < numPlayers; i++) {
    players.push({
      id: i,
      name: shuffledNames[i - 1],
      isHuman: false,
      personality: randomPersonality(),
      chips: buyIn,
      holeCards: [],
      currentBet: 0,
      totalBetThisHand: 0,
      isFolded: false,
      isAllIn: false,
      isDealer: false,
      isSB: false,
      isBB: false,
    })
  }

  return {
    phase: 'waiting',
    players,
    deck: [],
    communityCards: [],
    pots: 0,
    currentPlayerIndex: 0,
    dealerIndex: 0,
    currentBet: 0,
    minRaise: config.bigBlind,
    lastRaiseAmount: config.bigBlind,
    log: [],
    winners: [],
    roundNumber: 0,
    config,
    handHistory: [],
    currentStreetLog: [],
    currentStreets: [],
    playerStartChips: {},
    humanProfile: defaultHumanProfile(),
  }
}

export function startNewRound(state: GameState): GameState {
  const { config } = state

  // Auto-rebuy bots with 0 chips
  const playersWithRebuy = state.players.map((p) =>
    !p.isHuman && p.chips === 0 ? { ...p, chips: config.buyIn } : p
  )

  const activePlayers = playersWithRebuy.filter((p) => p.chips > 0)

  if (activePlayers.length < 2) {
    return { ...state, players: playersWithRebuy, phase: 'ended' }
  }

  // Rotate dealer
  let newDealerIndex = (state.dealerIndex + 1) % playersWithRebuy.length
  // Skip broke players for dealer
  while (playersWithRebuy[newDealerIndex].chips === 0) {
    newDealerIndex = (newDealerIndex + 1) % playersWithRebuy.length
  }

  const deck = shuffleDeck(createDeck())

  // Reset players
  const players: Player[] = playersWithRebuy.map((p) => ({
    ...p,
    holeCards: [],
    currentBet: 0,
    totalBetThisHand: 0,
    isFolded: p.chips === 0,
    isAllIn: false,
    isDealer: false,
    isSB: false,
    isBB: false,
    lastAction: undefined,
    handResult: undefined,
  }))

  // Set dealer, SB, BB
  players[newDealerIndex].isDealer = true

  const activeIds = players.map((p, i) => ({ p, i })).filter(({ p }) => p.chips > 0).map(({ i }) => i)
  const dealerPos = activeIds.indexOf(newDealerIndex)
  const sbPos = activeIds[(dealerPos + 1) % activeIds.length]
  const bbPos = activeIds[(dealerPos + 2) % activeIds.length]

  players[sbPos].isSB = true
  players[bbPos].isBB = true

  // Post blinds
  const sbAmount = Math.min(config.smallBlind, players[sbPos].chips)
  const bbAmount = Math.min(config.bigBlind, players[bbPos].chips)
  players[sbPos].chips -= sbAmount
  players[sbPos].currentBet = sbAmount
  players[sbPos].totalBetThisHand = sbAmount
  if (players[sbPos].chips === 0) players[sbPos].isAllIn = true

  players[bbPos].chips -= bbAmount
  players[bbPos].currentBet = bbAmount
  players[bbPos].totalBetThisHand = bbAmount
  if (players[bbPos].chips === 0) players[bbPos].isAllIn = true

  // Deal hole cards
  const deckAfterDeal = [...deck]
  for (const player of players) {
    if (player.chips > 0 || player.isSB || player.isBB) {
      if (!player.isFolded) {
        player.holeCards = [deckAfterDeal.pop()!, deckAfterDeal.pop()!]
      }
    }
  }

  // First to act preflop: UTG (left of BB)
  const utgPos = activeIds[(dealerPos + 3) % activeIds.length]

  const pots = sbAmount + bbAmount

  // Snapshot chips before blinds were posted (from playersWithRebuy)
  const playerStartChips: Record<number, number> = {}
  for (const p of playersWithRebuy) {
    playerStartChips[p.id] = p.chips
  }

  return {
    ...state,
    phase: 'preflop',
    players,
    deck: deckAfterDeal,
    communityCards: [],
    pots,
    currentPlayerIndex: utgPos,
    dealerIndex: newDealerIndex,
    currentBet: bbAmount,
    minRaise: config.bigBlind,
    lastRaiseAmount: config.bigBlind,
    log: [`第 ${state.roundNumber + 1} 局开始 / Round ${state.roundNumber + 1}`,
          `${players[sbPos].name} 小盲 $${sbAmount}`,
          `${players[bbPos].name} 大盲 $${bbAmount}`],
    winners: [],
    roundNumber: state.roundNumber + 1,
    currentStreetLog: [],
    currentStreets: [],
    playerStartChips,
  }
}

export function applyAction(
  state: GameState,
  playerId: number,
  action: PlayerAction,
  raiseAmount?: number
): GameState {
  const players = state.players.map((p) => ({ ...p }))
  const player = players[playerId]
  let log = [...state.log]
  let currentBet = state.currentBet
  let lastRaiseAmount = state.lastRaiseAmount
  let minRaise = state.minRaise
  let pots = state.pots

  const callAmount = Math.max(0, currentBet - player.currentBet)
  const chipsBefore = player.chips

  switch (action) {
    case 'fold':
      player.isFolded = true
      player.lastAction = 'fold'
      log.push(`${player.name} 弃牌`)
      break

    case 'check':
      player.lastAction = 'check'
      log.push(`${player.name} 过牌`)
      break

    case 'call': {
      const amount = Math.min(callAmount, player.chips)
      player.chips -= amount
      player.currentBet += amount
      player.totalBetThisHand += amount
      pots += amount
      if (player.chips === 0) player.isAllIn = true
      player.lastAction = 'call'
      log.push(`${player.name} 跟注 $${amount}`)
      break
    }

    case 'raise': {
      // raiseAmount is a TOTAL BET LEVEL (e.g. "raise to $100").
      // Default: current bet + minRaise increment.
      const targetBet = raiseAmount ?? currentBet + minRaise
      const toAdd = Math.min(targetBet - player.currentBet, player.chips)
      const raiseIncrement = targetBet - currentBet
      lastRaiseAmount = Math.max(raiseIncrement, lastRaiseAmount)
      player.chips -= toAdd
      player.currentBet += toAdd
      player.totalBetThisHand += toAdd
      pots += toAdd
      currentBet = player.currentBet
      minRaise = lastRaiseAmount
      if (player.chips === 0) player.isAllIn = true
      player.lastAction = 'raise'
      log.push(`${player.name} 加注至 $${player.currentBet}`)
      break
    }

    case 'all-in': {
      const amount = player.chips
      pots += amount
      player.currentBet += amount
      player.totalBetThisHand += amount
      player.chips = 0
      player.isAllIn = true
      if (player.currentBet > currentBet) {
        lastRaiseAmount = Math.max(player.currentBet - currentBet, lastRaiseAmount)
        currentBet = player.currentBet
        minRaise = lastRaiseAmount
      }
      player.lastAction = 'all-in'
      log.push(`${player.name} 全押 $${amount}`)
      break
    }
  }

  const actionLog: ActionLog = {
    playerName: player.name,
    playerId: player.id,
    isHuman: player.isHuman,
    action,
    amount: chipsBefore - player.chips,
    chipsBefore,
  }

  const newState: GameState = {
    ...state,
    players,
    pots,
    currentBet,
    lastRaiseAmount,
    minRaise,
    log,
    currentStreetLog: [...state.currentStreetLog, actionLog],
  }

  return advanceGame(newState)
}

function advanceGame(state: GameState): GameState {
  const activePlayers = state.players.filter((p) => !p.isFolded)

  // Only 1 player left → they win
  if (activePlayers.length === 1) {
    return resolveWinners(state)
  }

  // Check if betting round is complete
  const bettingComplete = isBettingComplete(state)

  if (!bettingComplete) {
    return moveToNextPlayer(state)
  }

  // Advance phase
  return advancePhase(state)
}

function isBettingComplete(state: GameState): boolean {
  const activePlayers = state.players.filter((p) => !p.isFolded && !p.isAllIn)
  if (activePlayers.length === 0) return true

  return activePlayers.every((p) => {
    if (p.lastAction === undefined) return false   // hasn't acted yet
    if (p.currentBet < state.currentBet) return false  // needs to respond to raise
    return true
  })
}

function moveToNextPlayer(state: GameState): GameState {
  const players = state.players
  let next = (state.currentPlayerIndex + 1) % players.length
  let iterations = 0
  while (iterations < players.length) {
    const p = players[next]
    if (!p.isFolded && !p.isAllIn) {
      // Check if this player needs to act
      const needsToAct =
        p.lastAction === undefined ||
        p.currentBet < state.currentBet
      if (needsToAct) {
        return { ...state, currentPlayerIndex: next }
      }
    }
    next = (next + 1) % players.length
    iterations++
  }
  // All done
  return advancePhase(state)
}

function advancePhase(state: GameState): GameState {
  // Flush the current street's actions before transitioning
  const completedStreet: StreetLog = {
    phase: state.phase as 'preflop' | 'flop' | 'turn' | 'river',
    communityCards: [...state.communityCards],
    actions: state.currentStreetLog,
  }
  const flushedState: GameState = {
    ...state,
    currentStreets: [...state.currentStreets, completedStreet],
    currentStreetLog: [],
  }

  const players = flushedState.players.map((p) => ({
    ...p,
    currentBet: 0,
    lastAction: p.isFolded || p.isAllIn ? p.lastAction : undefined,
  }))

  let newPhase: GamePhase
  let communityCards = [...flushedState.communityCards]
  let deck = [...flushedState.deck]
  let log = [...flushedState.log]

  switch (state.phase) {
    case 'preflop':
      newPhase = 'flop'
      communityCards = [deck.pop()!, deck.pop()!, deck.pop()!]
      log.push(`翻牌 Flop: ${communityCards.map(c => `${c.rank}${c.suit}`).join(' ')}`)
      break
    case 'flop':
      newPhase = 'turn'
      communityCards = [...communityCards, deck.pop()!]
      log.push(`转牌 Turn: ${communityCards[3].rank}${communityCards[3].suit}`)
      break
    case 'turn':
      newPhase = 'river'
      communityCards = [...communityCards, deck.pop()!]
      log.push(`河牌 River: ${communityCards[4].rank}${communityCards[4].suit}`)
      break
    case 'river':
      return resolveWinners({ ...flushedState, players, deck, communityCards })
    default:
      return flushedState
  }

  // Find first player to act (left of dealer)
  const activeIds = players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.isFolded && !p.isAllIn)
    .map(({ i }) => i)

  if (activeIds.length === 0) {
    // Everyone is all-in — run out the remaining board cards (turn + river) before resolving.
    // Recurse through advancePhase until we hit the river switch case which calls resolveWinners.
    return advancePhase({ ...flushedState, players, deck, communityCards, phase: newPhase, log })
  }

  if (activeIds.length === 1) {
    // One active player remaining. If anyone is all-in, the board must still be
    // run out before resolving (e.g. human all-in, bot called but has chips left).
    // Only skip to resolveWinners when everyone else folded (no all-ins).
    const hasAllIn = players.some((p) => p.isAllIn && !p.isFolded)
    if (hasAllIn) {
      return advancePhase({ ...flushedState, players, deck, communityCards, phase: newPhase, log })
    }
    return resolveWinners({ ...flushedState, players, deck, communityCards, phase: newPhase, log })
  }

  // First to act post-flop: first active player left of dealer
  let firstActor = (flushedState.dealerIndex + 1) % players.length
  let iters = 0
  while (iters < players.length) {
    if (!players[firstActor].isFolded && !players[firstActor].isAllIn) break
    firstActor = (firstActor + 1) % players.length
    iters++
  }

  return {
    ...flushedState,
    phase: newPhase,
    players,
    deck,
    communityCards,
    currentBet: 0,
    lastRaiseAmount: flushedState.config.bigBlind,
    minRaise: flushedState.config.bigBlind,
    currentPlayerIndex: firstActor,
    log,
  }
}

function updateHumanProfile(profile: HumanProfile, humanId: number, streets: StreetLog[], winners: WinnerInfo[], phase: GamePhase): HumanProfile {
  const p = { ...profile }
  p.handsDealt++

  let humanRaisedPreflop = false
  let vpip = false

  for (const street of streets) {
    const isPreflop = street.phase === 'preflop'
    let opponentActedAggressively = false

    for (const log of street.actions) {
      if (log.playerId !== humanId) {
        if (log.action === 'raise' || log.action === 'all-in') {
          opponentActedAggressively = true
        }
        continue
      }

      // Human's action
      if (isPreflop) {
        if (log.action === 'raise' || log.action === 'all-in') {
          p.preflopRaises++
          humanRaisedPreflop = true
          vpip = true
        } else if (log.action === 'call') {
          p.preflopCalls++
          vpip = true
        } else if (log.action === 'fold') {
          p.preflopFolds++
        }
        if (opponentActedAggressively) {
          p.timesRaised++
          if (log.action === 'fold') p.foldedToRaise++
        }
      } else {
        // Postflop
        if (log.action === 'raise' || log.action === 'all-in') {
          p.postflopBets++
        } else if (log.action === 'call') {
          p.postflopCalls++
        } else if (log.action === 'fold') {
          p.postflopFolds++
          if (opponentActedAggressively) p.foldedToRaise++
        } else if (log.action === 'check') {
          p.postflopChecks++
        }
        if (opponentActedAggressively) p.timesRaised++
      }

      // Reset after human acts so next opponent aggression is counted fresh
      opponentActedAggressively = false
    }

    // C-bet tracking: flop + human raised preflop + human had an action on flop
    if (street.phase === 'flop' && humanRaisedPreflop) {
      const humanFlopAction = street.actions.find((a) => a.playerId === humanId)
      if (humanFlopAction) {
        p.cbetOpportunities++
        if (humanFlopAction.action === 'raise' || humanFlopAction.action === 'all-in') {
          p.cbets++
        }
      }
    }
  }

  if (vpip) p.vpipHands++
  if (humanRaisedPreflop) p.pfrHands++

  // Showdown tracking
  const humanWon = winners.some((w) => w.playerId === humanId)
  const humanInShowdown = phase === 'showdown'
  if (humanInShowdown) {
    p.showdowns++
    if (humanWon) p.showdownWins++
  }

  return p
}

function resolveWinners(state: GameState): GameState {
  const players = state.players.map((p) => ({ ...p }))

  // Evaluate hands
  for (const p of players) {
    if (!p.isFolded && p.holeCards.length === 2) {
      const allCards = [...(p.holeCards as Card[]), ...state.communityCards]
      if (allCards.length >= 5) {
        p.handResult = evaluateBestHand(allCards)
      }
    }
  }

  // Calculate contributions map
  const contributions = new Map<number, number>()
  for (const p of players) {
    contributions.set(p.id, p.totalBetThisHand)
  }

  const pots = calculatePots(contributions)

  const getWinners = (eligibleIds: number[]): number[] => {
    const eligible = players.filter((p) => eligibleIds.includes(p.id) && !p.isFolded)
    if (eligible.length === 0) return []
    if (eligible.length === 1) return [eligible[0].id]

    let best: Player[] = [eligible[0]]
    for (const p of eligible.slice(1)) {
      if (!best[0].handResult || !p.handResult) continue
      const cmp = compareHands(p.handResult, best[0].handResult)
      if (cmp > 0) best = [p]
      else if (cmp === 0) best.push(p)
    }
    return best.map((p) => p.id)
  }

  const winnings = distributePots(pots, getWinners)
  const winners: WinnerInfo[] = []
  const log = [...state.log]

  for (const [id, amount] of winnings) {
    const p = players.find((pl) => pl.id === id)!
    p.chips += amount
    const handName = p.handResult?.rank ?? 'n/a'
    winners.push({
      playerId: id,
      playerName: p.name,
      amount,
      handDescription: handName,
      isHuman: p.isHuman,
    })
    log.push(`${p.name} 赢得 $${amount} (${handName})`)
  }

  // Flush any remaining current street (e.g. early fold-out before river)
  let streets = state.currentStreets
  if (state.currentStreetLog.length > 0) {
    streets = [...streets, {
      phase: state.phase as 'preflop' | 'flop' | 'turn' | 'river',
      communityCards: [...state.communityCards],
      actions: state.currentStreetLog,
    }]
  }

  // Build hand record and save to history
  const handRecord: HandRecord = {
    roundNumber: state.roundNumber,
    dealerName: state.players.find((p) => p.isDealer)?.name ?? '',
    config: { smallBlind: state.config.smallBlind, bigBlind: state.config.bigBlind },
    playerInfo: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHuman: p.isHuman,
      holeCards: p.holeCards as Card[],
      startChips: state.playerStartChips[p.id] ?? 0,
    })),
    streets,
    communityCards: [...state.communityCards],
    winners,
    totalPot: state.pots,
  }

  const human = state.players.find((p) => p.isHuman)
  const humanProfile = human
    ? updateHumanProfile(state.humanProfile, human.id, streets, winners, 'showdown')
    : state.humanProfile

  return {
    ...state,
    phase: 'showdown',
    players,
    winners,
    log,
    currentStreets: [],
    currentStreetLog: [],
    handHistory: [...state.handHistory, handRecord],
    humanProfile,
  }
}

// Call this to get bot decision and apply it
export function processBotTurn(state: GameState): GameState {
  const player = state.players[state.currentPlayerIndex]
  if (!player || player.isHuman || player.isFolded || player.isAllIn) {
    return state
  }

  const callAmount = Math.max(0, state.currentBet - player.currentBet)
  const raisesThisStreet = state.currentStreetLog.filter(
    (a) => a.action === 'raise' || a.action === 'all-in'
  ).length

  // Extract human's most recent action this street and last street for opponent modeling
  const humanThisStreetActions = state.currentStreetLog.filter((a) => a.isHuman)
  const humanActionThisStreet = humanThisStreetActions.length > 0
    ? humanThisStreetActions[humanThisStreetActions.length - 1].action as import('./bot-ai').HumanStreetAction
    : null
  const lastStreetLog = state.currentStreets.length > 0
    ? state.currentStreets[state.currentStreets.length - 1].actions.filter((a) => a.isHuman)
    : []
  const humanActionLastStreet = lastStreetLog.length > 0
    ? lastStreetLog[lastStreetLog.length - 1].action as import('./bot-ai').HumanStreetAction
    : null

  const decision = makeBotDecision({
    holeCards: player.holeCards as [import('./deck').Card, import('./deck').Card],
    communityCards: state.communityCards,
    position: state.currentPlayerIndex,
    totalPlayers: state.players.filter((p) => !p.isFolded).length,
    callAmount,
    minRaise: state.minRaise,
    potSize: state.pots,
    myStack: player.chips,
    personality: player.personality,
    bigBlind: state.config.bigBlind,
    isPreflop: state.phase === 'preflop',
    raisesThisStreet,
    humanProfile: state.humanProfile,
    humanActionThisStreet,
    humanActionLastStreet,
  })

  // decision.raiseAmount from calculateRaiseAmount() is a raise SIZE (pot fraction).
  // applyAction expects a TOTAL BET LEVEL. Convert: targetBet = currentBet + raiseSize.
  let raiseAmount: number | undefined = undefined
  if (decision.action === 'raise' && decision.raiseAmount !== undefined) {
    const targetBet = state.currentBet + decision.raiseAmount
    raiseAmount = Math.min(targetBet, player.chips + player.currentBet)
  }

  return applyAction(state, player.id, decision.action, raiseAmount)
}

export function getCallAmount(state: GameState, playerId: number): number {
  const player = state.players[playerId]
  return Math.min(Math.max(0, state.currentBet - player.currentBet), player.chips)
}

export function getMinRaise(state: GameState): number {
  return state.currentBet + state.minRaise
}

export function getMaxRaise(state: GameState, playerId: number): number {
  return state.players[playerId].chips + state.players[playerId].currentBet
}
