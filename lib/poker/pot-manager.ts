export interface Pot {
  amount: number
  eligiblePlayerIds: number[] // player indices that can win this pot
}

/**
 * Calculate main pot + side pots from player contributions.
 * contributions: map of playerId → total chips put in this round
 */
export function calculatePots(contributions: Map<number, number>): Pot[] {
  const pots: Pot[] = []
  const entries = Array.from(contributions.entries())
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => a - b)

  let remaining = new Map(contributions)

  while (true) {
    const active = Array.from(remaining.entries()).filter(([, v]) => v > 0)
    if (active.length === 0) break

    // Find the minimum contribution among active players
    const minContrib = Math.min(...active.map(([, v]) => v))
    const potAmount = minContrib * active.length
    const eligible = active.map(([id]) => id)

    pots.push({ amount: potAmount, eligiblePlayerIds: eligible })

    // Subtract from all
    for (const [id, val] of active) {
      remaining.set(id, val - minContrib)
    }
  }

  // Merge pots with same eligible players
  const merged: Pot[] = []
  for (const pot of pots) {
    const existing = merged.find(
      (m) =>
        m.eligiblePlayerIds.length === pot.eligiblePlayerIds.length &&
        m.eligiblePlayerIds.every((id) => pot.eligiblePlayerIds.includes(id))
    )
    if (existing) {
      existing.amount += pot.amount
    } else {
      merged.push({ ...pot })
    }
  }

  return merged
}

/**
 * Distribute pots to winners.
 * Returns map of playerId → chips won
 */
export function distributePots(
  pots: Pot[],
  getWinnerIds: (eligibleIds: number[]) => number[] // returns winner id(s) for a given eligible set
): Map<number, number> {
  const winnings = new Map<number, number>()

  for (const pot of pots) {
    const winners = getWinnerIds(pot.eligiblePlayerIds)
    if (winners.length === 0) continue
    const share = Math.floor(pot.amount / winners.length)
    const remainder = pot.amount - share * winners.length
    for (let i = 0; i < winners.length; i++) {
      const id = winners[i]
      winnings.set(id, (winnings.get(id) ?? 0) + share + (i === 0 ? remainder : 0))
    }
  }

  return winnings
}
