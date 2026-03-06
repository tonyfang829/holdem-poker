import { Card } from './deck'
import { evaluateBestHand } from './hand-rankings'

export type BotPersonality = 'tight-passive' | 'tight-aggressive' | 'loose-passive' | 'loose-aggressive'
export type BotAction = 'fold' | 'check' | 'call' | 'raise' | 'all-in'

export type HumanStreetAction = 'check' | 'call' | 'raise' | 'all-in' | null

export interface BotDecisionInput {
  holeCards: [Card, Card]
  communityCards: Card[]
  position: number // 0 = early, higher = later (BTN = best)
  totalPlayers: number
  callAmount: number // how much to call
  minRaise: number
  potSize: number
  myStack: number
  personality: BotPersonality
  bigBlind: number
  isPreflop: boolean
  raisesThisStreet: number // how many raises have happened this street (re-raise detection)
  humanProfile: HumanProfile   // accumulated cross-hand stats for adaptive play
  humanActionThisStreet: HumanStreetAction
  humanActionLastStreet: HumanStreetAction
}

export interface BotDecision {
  action: BotAction
  raiseAmount?: number
}

// Accumulated stats on the human player, updated after each hand.
// Used by bots to exploit observed tendencies over multiple sessions.
export interface HumanProfile {
  handsDealt: number          // total hands dealt to human
  vpipHands: number           // hands human voluntarily put $ in (not counting BB check)
  pfrHands: number            // hands human raised preflop
  preflopRaises: number       // total preflop raise/all-in actions
  preflopCalls: number        // total preflop calls
  preflopFolds: number        // total preflop folds
  postflopBets: number        // postflop raise/all-in (covers both bet and raise since engine uses 'raise')
  postflopCalls: number       // postflop calls
  postflopFolds: number       // postflop folds when facing aggression
  postflopChecks: number      // postflop checks
  timesRaised: number         // times human faced opponent aggression (bet or raise) before acting
  foldedToRaise: number       // of those times, human folded
  cbetOpportunities: number   // human was preflop raiser and acted on flop
  cbets: number               // of those times, human bet/raised the flop
  showdowns: number           // showdowns reached (not folded at end)
  showdownWins: number        // showdowns won
}

export function defaultHumanProfile(): HumanProfile {
  return {
    handsDealt: 0, vpipHands: 0, pfrHands: 0,
    preflopRaises: 0, preflopCalls: 0, preflopFolds: 0,
    postflopBets: 0, postflopCalls: 0, postflopFolds: 0, postflopChecks: 0,
    timesRaised: 0, foldedToRaise: 0,
    cbetOpportunities: 0, cbets: 0,
    showdowns: 0, showdownWins: 0,
  }
}

// Preflop hand strength categories (simplified Chen formula groups)
const PREMIUM_HANDS = new Set([
  'AA', 'KK', 'QQ', 'JJ', 'AKs', 'AQs', 'AJs', 'KQs', 'AKo',
])
const STRONG_HANDS = new Set([
  'TT', '99', '88', 'ATs', 'AJo', 'AQo', 'KJs', 'KTs', 'QJs', 'JTs', 'KQo',
])
const PLAYABLE_HANDS = new Set([
  '77', '66', '55', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
  'KJo', 'KTo', 'QJo', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s', '65s',
])

function getPreflopKey(cards: [Card, Card]): string {
  const r1 = rankLabel(cards[0].rank)
  const r2 = rankLabel(cards[1].rank)
  const suited = cards[0].suit === cards[1].suit ? 's' : 'o'
  const sorted = [cards[0].rank, cards[1].rank].sort((a, b) => b - a)
  const key = rankLabel(sorted[0] as typeof cards[0]['rank']) + rankLabel(sorted[1] as typeof cards[0]['rank'])
  if (sorted[0] === sorted[1]) return key // pair, no s/o
  return key + suited
}

function rankLabel(rank: number): string {
  if (rank === 14) return 'A'
  if (rank === 13) return 'K'
  if (rank === 12) return 'Q'
  if (rank === 11) return 'J'
  if (rank === 10) return 'T'
  return String(rank)
}

function getPreflopStrength(cards: [Card, Card]): 'premium' | 'strong' | 'playable' | 'weak' {
  const key = getPreflopKey(cards)
  if (PREMIUM_HANDS.has(key)) return 'premium'
  if (STRONG_HANDS.has(key)) return 'strong'
  if (PLAYABLE_HANDS.has(key)) return 'playable'
  return 'weak'
}

function getHandStrengthPostflop(holeCards: [Card, Card], communityCards: Card[]): number {
  // 0.0 – 1.0 based on hand rank value
  const allCards = [...holeCards, ...communityCards]
  if (allCards.length < 5) {
    // Not enough cards, use hole card strength proxy
    const strength = getPreflopStrength(holeCards)
    const map = { premium: 0.85, strong: 0.65, playable: 0.45, weak: 0.2 }
    return map[strength]
  }
  const result = evaluateBestHand(allCards)
  // rankValue: -1 to 8, normalize to 0–1
  return (result.rankValue + 1) / 9
}

// Each personality perceives their hand strength differently —
// loose bots overestimate, tight bots underestimate, all have noise.
// This prevents bots from making perfectly optimal decisions and makes
// each bot feel independent rather than clairvoyant.
const PERSONALITY_PERCEPTION: Record<BotPersonality, { noise: number; bias: number }> = {
  'tight-passive':     { noise: 0.08, bias: -0.06 }, // underestimates, folds too much
  'tight-aggressive':  { noise: 0.05, bias: -0.01 }, // most accurate
  'loose-passive':     { noise: 0.18, bias:  0.10 }, // overestimates, calls too much
  'loose-aggressive':  { noise: 0.14, bias:  0.06 }, // overestimates, bets too much
}

function applyPerceptionNoise(strength: number, personality: BotPersonality): number {
  const { noise, bias } = PERSONALITY_PERCEPTION[personality]
  const jitter = (Math.random() - 0.5) * 2 * noise
  return Math.max(0, Math.min(1, strength + bias + jitter))
}

function getPotOdds(callAmount: number, potSize: number): number {
  if (callAmount === 0) return 1
  return callAmount / (potSize + callAmount)
}

// Devalue hand strength when the board is dangerous:
// - Monotone board (3+ same suit): one-pair/two-pair become easy to fold (flush likely out there)
// - Paired board: straight and flush are devalued (full house possible)
// - Flush draw on turn/river: moderate devaluation for non-flush hands
function getBoardTexturePenalty(holeCards: [Card, Card], communityCards: Card[]): number {
  if (communityCards.length < 3) return 0
  const allCards = [...holeCards, ...communityCards]
  if (allCards.length < 5) return 0

  const result = evaluateBestHand(allCards)
  const rank = result.rank

  const suitCounts: Record<string, number> = {}
  for (const c of communityCards) suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1
  const maxSuitCount = Math.max(...Object.values(suitCounts))

  const rankCounts: Record<number, number> = {}
  for (const c of communityCards) rankCounts[c.rank] = (rankCounts[c.rank] ?? 0) + 1
  const maxRankCount = Math.max(...Object.values(rankCounts))

  const monotone = maxSuitCount >= 3
  const flushDraw = maxSuitCount === 2 && communityCards.length >= 4 // turn or river flush draw
  const paired = maxRankCount >= 2

  let penalty = 0

  if (monotone) {
    // Opponent could easily have a flush — downgrade hands that don't beat a flush
    if (rank === 'one-pair')             penalty += 0.15
    else if (rank === 'two-pair')        penalty += 0.10
    else if (rank === 'three-of-a-kind') penalty += 0.05
    else if (rank === 'straight')        penalty += 0.10
  } else if (flushDraw) {
    // Flush completing on river is a real threat
    if (rank === 'one-pair')             penalty += 0.05
    else if (rank === 'two-pair')        penalty += 0.03
    else if (rank === 'straight')        penalty += 0.05
  }

  if (paired) {
    // Opponent could have a full house — straight and flush lose their value
    if (rank === 'straight')             penalty += 0.15
    else if (rank === 'flush')           penalty += 0.12
    else if (rank === 'two-pair')        penalty += 0.05
  }

  return -penalty
}

// Infer human's tendencies from accumulated profile stats + current street signals.
//   bluffBonus    — added to bot's bluff probability (positive = bluff more, negative = bluff less)
//   foldPressure  — subtracted from effectiveStrength (positive = tighten calling range vs human)
function getHumanRangeAdjustment(
  profile: HumanProfile,
  thisStreet: HumanStreetAction,
  lastStreet: HumanStreetAction,
): { bluffBonus: number; foldPressure: number } {
  let bluffBonus = 0
  let foldPressure = 0

  // ── Profile-derived rates ──────────────────────────────────────────────────
  // Use fallback population averages when sample is too small to trust.

  // VPIP: % of hands human voluntarily entered. Avg recreational = ~45%.
  const vpip = profile.handsDealt >= 5
    ? profile.vpipHands / profile.handsDealt
    : 0.45

  // FTR: fold-to-raise rate. Avg = ~50%.
  const ftr = profile.timesRaised >= 4
    ? profile.foldedToRaise / profile.timesRaised
    : 0.50

  // Aggression factor: (bets + raises) / calls. Avg = ~1.0.
  const aggFactor = profile.postflopCalls > 0
    ? (profile.postflopBets + profile.postflopCalls) / profile.postflopCalls
    : 1.0

  // C-bet frequency: how often human bets flop as preflop raiser. Avg = ~60%.
  const cbetFreq = profile.cbetOpportunities >= 3
    ? profile.cbets / profile.cbetOpportunities
    : 0.60

  // ── Profile-driven adjustments ─────────────────────────────────────────────

  // VPIP exploit: tight human (low VPIP) → bluff more often to steal pots.
  // Loose human (high VPIP) → stop bluffing, they call everything.
  bluffBonus += (vpip - 0.45) * -0.35    // tight → +bluffBonus; loose → −bluffBonus

  // FTR exploit: high fold-to-raise → 3-bet / c-bet more aggressively.
  bluffBonus += (ftr - 0.50) * 0.30      // high FTR → more bluffs; low FTR → stop bluffing

  // Postflop aggression: aggressive human → respect their bets, fold more.
  foldPressure += Math.min(0.15, (aggFactor - 1.0) * 0.08)

  // C-bet frequency exploit: human always cbets → float more, don't fold flop.
  if (cbetFreq > 0.75) foldPressure -= 0.05

  // ── In-hand signals ────────────────────────────────────────────────────────
  // Weight decreases as profile builds — trust accumulated stats more over time.
  const streetWeight = profile.handsDealt >= 10 ? 0.6 : 1.0

  if (thisStreet === 'check') {
    bluffBonus += 0.07 * streetWeight
  } else if (thisStreet === 'call') {
    bluffBonus += 0.03 * streetWeight
  } else if (thisStreet === 'raise' || thisStreet === 'all-in') {
    bluffBonus -= 0.10 * streetWeight
    foldPressure += 0.08 * streetWeight
  }

  if (lastStreet === 'raise' || lastStreet === 'all-in') {
    foldPressure += 0.04 * streetWeight
  } else if (lastStreet === 'check') {
    bluffBonus += 0.04 * streetWeight
  }

  return {
    bluffBonus: Math.max(-0.25, Math.min(0.25, bluffBonus)),
    foldPressure: Math.max(0, Math.min(0.35, foldPressure)),
  }
}

export function makeBotDecision(input: BotDecisionInput): BotDecision {
  const {
    holeCards, communityCards, position, totalPlayers,
    callAmount, minRaise, potSize, myStack,
    personality, bigBlind, isPreflop, raisesThisStreet,
    humanProfile, humanActionThisStreet, humanActionLastStreet,
  } = input

  const rand = Math.random()
  const potOdds = getPotOdds(callAmount, potSize)
  const rawStrength = isPreflop
    ? (() => {
        const s = getPreflopStrength(holeCards)
        return { premium: 0.9, strong: 0.7, playable: 0.5, weak: 0.2 }[s]
      })()
    : getHandStrengthPostflop(holeCards, communityCards)

  // Board texture penalty: devalue hands when board is dangerous (monotone/paired).
  // Applied before perception noise so each personality still perceives the board differently.
  const boardPenalty = !isPreflop ? getBoardTexturePenalty(holeCards, communityCards) : 0
  const contextualStrength = Math.max(0, Math.min(1, rawStrength + boardPenalty))

  // Apply per-personality perception noise so each bot misjudges their hand
  // differently — loose bots overestimate, tight bots underestimate.
  const handStrength = applyPerceptionNoise(contextualStrength, personality)

  // Position bonus: late position = more aggressive
  const positionBonus = (position / (totalPlayers - 1)) * 0.1

  // Personality modifiers
  const aggressionBonus = personality.includes('aggressive') ? 0.1 : -0.05
  const tightnessThreshold = personality.includes('tight') ? 0.55 : 0.35

  // Re-raise pressure: in 3-bet+ pots weak hands must fold more.
  // Tight bots feel this more than loose bots.
  const reraiseDiscount = raisesThisStreet >= 2
    ? (personality.includes('tight') ? 0.12 : 0.07)
    : 0

  // Opponent modeling: adjust bluff frequency and fold pressure based on human's actions.
  // Only applied post-flop — preflop ranges are wide enough that per-street signals matter less.
  const { bluffBonus, foldPressure } = !isPreflop
    ? getHumanRangeAdjustment(humanProfile, humanActionThisStreet, humanActionLastStreet)
    : { bluffBonus: 0, foldPressure: 0 }

  const effectiveStrength = handStrength + positionBonus + aggressionBonus - reraiseDiscount - foldPressure

  // All-in if very short stacked — use contextualStrength so board texture matters,
  // but not personality noise. Require three-of-a-kind (0.33) or better.
  if (myStack <= callAmount && callAmount > 0) {
    if (contextualStrength >= 0.33) return { action: 'all-in' }
    return { action: 'fold' }
  }

  // Postflop high-card guard: perception noise can inflate contextualStrength=0 to
  // effectiveStrength≈0.3+, fooling the bot into calling with nothing. Use the
  // noise-free contextualStrength to catch this — high card never calls a bet postflop.
  if (!isPreflop && contextualStrength < 0.111 && callAmount > 0) {
    return { action: 'fold' }
  }

  // =========================================================================
  // PREFLOP RANGE DISCIPLINE
  // Generic effectiveStrength logic breaks preflop because perception noise +
  // position/aggression bonuses push even weak hands above raiseThreshold,
  // causing bots to 3-bet / 4-bet with trash. Instead, use explicit hand
  // category gates based on raisesThisStreet (open / 3-bet / 4-bet+).
  // =========================================================================
  if (isPreflop) {
    const category    = getPreflopStrength(holeCards)
    const normalizedPos = totalPlayers > 1 ? position / (totalPlayers - 1) : 1
    const isLatePos    = normalizedPos >= 0.65   // CO / BTN equivalent
    const isMidPos     = normalizedPos >= 0.35   // HJ / MP onwards
    const isAggressive = personality.includes('aggressive')
    const isTight      = personality.includes('tight')

    // Size helpers: ±15% jitter rounded to 1 BB so bet sizes don't always
    // come out as exact multiples — obscures hand strength without straying far.
    const j = () => 0.85 + Math.random() * 0.30                          // 0.85–1.15
    const openIncrement    = Math.max(Math.round(bigBlind * 2 * j()), bigBlind)
    // 3-bet to ~3× the open: increment above the open = 2× callAmount
    const threeBetIncrement = Math.max(Math.round(callAmount * 2 * j()), bigBlind)
    // 4-bet to ~2.5× the 3-bet: increment above the 3-bet = 1.5× callAmount
    const fourBetIncrement  = Math.max(Math.round(callAmount * 1.5 * j()), bigBlind)

    // ----- 4-bet+ situation (raisesThisStreet >= 2) -------------------------
    // Real NL ranges: only premium hands continue vs a 3-bet (QQ+, AKs, AKo).
    // JJ/TT are mixed (sometimes 4-bet bluff, sometimes fold vs tighter players).
    if (raisesThisStreet >= 2) {
      if (category === 'premium') {
        // AA / KK / QQ / AKs / AKo: always 4-bet for value
        return { action: 'raise', raiseAmount: fourBetIncrement }
      }
      if (category === 'strong' && !isTight && rand < 0.25) {
        // JJ / TT / AQs: loose players can call a 4-bet (have equity, good pot odds)
        return { action: 'call' }
      }
      if (category === 'playable' && personality === 'loose-aggressive' && rand < 0.08) {
        // Rare polarised 4-bet bluff with blockers (A5s, A4s etc.) — only LA personality
        return { action: 'raise', raiseAmount: fourBetIncrement }
      }
      return { action: 'fold' }
    }

    // ----- 3-bet situation (raisesThisStreet === 1) --------------------------
    // Facing one open-raise. Tighten calling/3-betting vs the open.
    if (raisesThisStreet === 1) {
      if (category === 'premium') {
        // Premium hands always 3-bet — never flat-call AA/KK/AKs preflop
        return { action: 'raise', raiseAmount: threeBetIncrement }
      }
      if (category === 'strong') {
        // Tight-passive: always flat-call strong hands (KQs, JJ, TT, AJs, etc.)
        if (personality === 'tight-passive') return { action: 'call' }
        // Tight-aggressive: value 3-bet from late position with strong hands
        if (personality === 'tight-aggressive' && isLatePos && rand < 0.40) {
          return { action: 'raise', raiseAmount: threeBetIncrement }
        }
        // Loose-aggressive: 3-bets strong hands liberally as standard value play
        if (personality === 'loose-aggressive' && rand < 0.55) {
          return { action: 'raise', raiseAmount: threeBetIncrement }
        }
        // Default: call with strong hands (set-mine pairs, suited broadways)
        return { action: 'call' }
      }
      if (category === 'playable') {
        // Semi-bluff 3-bet from position — suited connectors / suited aces have
        // blocker value and strong equity vs calling range. LA only, late position.
        if (personality === 'loose-aggressive' && isLatePos && rand < 0.22) {
          return { action: 'raise', raiseAmount: threeBetIncrement }
        }
        // Fold if the call is too expensive relative to stack (> 15% of stack)
        if (callAmount > myStack * 0.15) return { action: 'fold' }
        // Otherwise call for implied odds (small pairs, suited connectors)
        return { action: 'call' }
      }
      // Weak hands: fold to any raise — never call or 3-bet trash preflop
      return { action: 'fold' }
    }

    // ----- Open / limp situation (raisesThisStreet === 0) -------------------
    if (callAmount === 0) {
      // BB check option or first to act into an empty pot
      if (category === 'premium' || category === 'strong') {
        return { action: 'raise', raiseAmount: openIncrement }
      }
      if (category === 'playable') {
        // Open from late/mid position; tight personalities restrict to late only
        if (isLatePos || (isMidPos && !isTight)) return { action: 'raise', raiseAmount: openIncrement }
        // Loose personalities open playable hands from any position ~35% of the time
        if (!isTight && rand < 0.35) return { action: 'raise', raiseAmount: openIncrement }
        return { action: 'check' }
      }
      // Weak hand — steal bluff from BTN/CO for aggressive personalities only
      if (isLatePos && isAggressive && rand < 0.18) {
        return { action: 'raise', raiseAmount: openIncrement }
      }
      return { action: 'check' }
    }

    // Facing a limp (raisesThisStreet === 0 but callAmount > 0 = someone just called BB)
    if (category === 'premium' || category === 'strong') {
      // Iso-raise to isolate the limper: ~4x BB over one limp (openIncrement + callAmount)
      const isoIncrement = Math.max(Math.round((bigBlind * 2 + callAmount) * j()), bigBlind)
      return { action: 'raise', raiseAmount: isoIncrement }
    }
    if (category === 'playable') {
      // Aggressive players iso-raise playable hands in position; others overlimp
      if (isAggressive && isLatePos && rand < 0.45) {
        const isoIncrement = Math.max(Math.round((bigBlind * 2 + callAmount) * j()), bigBlind)
        return { action: 'raise', raiseAmount: isoIncrement }
      }
      return { action: 'call' }
    }
    // Weak: fold facing a limp (occasionally a loose player overlimps)
    if (!isTight && rand < 0.15) return { action: 'call' }
    return { action: 'fold' }
  }
  // =========================================================================
  // END PREFLOP — postflop logic continues below
  // =========================================================================

  if (callAmount === 0) {
    const betThreshold = personality.includes('aggressive') ? 0.15 : 0.25
    if (
      contextualStrength >= 0.56 ||
      effectiveStrength > betThreshold ||
      (effectiveStrength > betThreshold - 0.08 && rand < 0.5)
    ) {
      const raiseAmount = calculateRaiseAmount(effectiveStrength, potSize, minRaise, myStack, bigBlind)
      return { action: 'raise', raiseAmount }
    }
    if (rand < getBluffProbability(personality, effectiveStrength) + bluffBonus) {
      const raiseAmount = calculateRaiseAmount(0.3, potSize, minRaise, myStack, bigBlind)
      return { action: 'raise', raiseAmount }
    }
    return { action: 'check' }
  }

  // Must call, raise, or fold

  // Guard 1 — standard fold: hand too weak for this personality AND pot odds are
  // unfavorable. Only fires when bet is meaningful (potOdds > 15%) — tiny bets into
  // a big pot (e.g. $90 into $1800) should never fold a made hand due to noise.
  if (potOdds > 0.15 && effectiveStrength < tightnessThreshold && potOdds > effectiveStrength) {
    return { action: 'fold' }
  }

  // Guard 2 — overbet/all-in protection: fold when the bet size requires equity
  // the bot doesn't have. Loose bots credit more implied odds than tight bots.
  // Example: potOdds=0.75 (3x-pot shove) vs effectiveStrength=0.40 → 0.75>0.52 → fold.
  const impliedOddsSlack = personality.includes('loose') ? 0.12 : 0.05
  if (potOdds > effectiveStrength + impliedOddsSlack) {
    return { action: 'fold' }
  }

  const raiseThreshold = personality.includes('aggressive') ? 0.35 : 0.45
  if (effectiveStrength > raiseThreshold || (effectiveStrength > raiseThreshold - 0.1 && rand < 0.5)) {
    const raiseAmount = calculateRaiseAmount(effectiveStrength, potSize, minRaise, myStack, bigBlind)
    if (raiseAmount > callAmount) {
      return { action: 'raise', raiseAmount }
    }
  }

  return { action: 'call' }
}

function calculateRaiseAmount(
  strength: number,
  potSize: number,
  minRaise: number,
  myStack: number,
  bigBlind: number
): number {
  // Base sizing anchored to hand strength, then randomised ±20% so bet size
  // doesn't leak hand strength information.
  //   weak  (< 0.25): ~1/3 pot
  //   medium(< 0.45): ~1/2 pot
  //   strong(< 0.65): ~2/3 pot
  //   very  (< 0.80): ~1x pot
  //   nuts  (>= 0.80): ~1.5x pot
  const anchors = [
    { threshold: 0.25, base: 1 / 3 },
    { threshold: 0.45, base: 1 / 2 },
    { threshold: 0.65, base: 2 / 3 },
    { threshold: 0.80, base: 1.0   },
    { threshold: Infinity, base: 1.5 },
  ]
  const base = anchors.find(a => strength < a.threshold)!.base
  // ±20% jitter — enough to obscure sizing tells without straying too far
  const jitter = 1 + (Math.random() - 0.5) * 0.4
  const raw = Math.max(potSize * base * jitter, bigBlind)
  const rounded = Math.round(raw / bigBlind) * bigBlind
  return Math.min(Math.max(rounded, bigBlind), myStack)
}

function getBluffProbability(personality: BotPersonality, strength: number): number {
  if (strength > 0.5) return 0 // don't bluff with decent hand
  // Aggressive bots bluff often; passive bots bluff occasionally
  const base = personality.includes('aggressive') ? 0.30 : 0.14
  return base * (1 - strength * 2) // higher bluff chance with weaker hands
}

export const BOT_NAMES = [
  'Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan',
  'Casey', 'Riley', 'Quinn', 'Drew', 'Blake',
]

export const BOT_PERSONALITIES: BotPersonality[] = [
  'tight-passive',
  'tight-aggressive',
  'loose-passive',
  'loose-aggressive',
]

export function randomPersonality(): BotPersonality {
  return BOT_PERSONALITIES[Math.floor(Math.random() * BOT_PERSONALITIES.length)]
}
