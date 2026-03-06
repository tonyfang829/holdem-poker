'use client'
import { useState } from 'react'
import { HandRecord } from '@/lib/poker/game-engine'
import { HumanProfile } from '@/lib/poker/bot-ai'
import { rankToString, suitToSymbol } from '@/lib/poker/deck'
import type { Card } from '@/lib/poker/deck'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

function handNet(hand: HandRecord): number {
  const contributed = hand.streets.flatMap(s => s.actions).filter(a => a.isHuman).reduce((s, a) => s + a.amount, 0)
  const won = hand.winners.find(w => w.isHuman)?.amount ?? 0
  return won - contributed
}

function handContributed(hand: HandRecord): number {
  return hand.streets.flatMap(s => s.actions).filter(a => a.isHuman).reduce((s, a) => s + a.amount, 0)
}

function streetCN(phase: string | null): string {
  const m: Record<string, string> = { preflop: '翻前', flop: '翻牌', turn: '转牌', river: '河牌' }
  return phase ? (m[phase] ?? phase) : ''
}

function actionCN(action: string): string {
  const m: Record<string, string> = { fold: '弃牌', check: '过牌', call: '跟注', raise: '加注', 'all-in': '全押' }
  return m[action] ?? action
}

// ─── Score ─────────────────────────────────────────────────────────────────────

interface SessionScore {
  total: number
  grade: string
  gradeColor: string
  gradeLabel: string
  vpipScore: number
  pfrScore: number
  aggScore: number
  ftrScore: number
  showdownScore: number
  profitScore: number
  netChips: number
  netBB: number
}

function computeScore(profile: HumanProfile, handHistory: HandRecord[], bigBlind: number): SessionScore {
  const n = profile.handsDealt
  const netChips = handHistory.reduce((sum, h) => sum + handNet(h), 0)
  const netBB = bigBlind > 0 ? netChips / bigBlind : 0

  if (n < 3) {
    return { total: 0, grade: '-', gradeColor: '#888', gradeLabel: '手数不足（需≥3手）', vpipScore: 0, pfrScore: 0, aggScore: 0, ftrScore: 0, showdownScore: 0, profitScore: 0, netChips, netBB }
  }

  // VPIP /20 — optimal 25–42%
  const vpip = profile.vpipHands / n
  let vpipScore: number
  if (vpip >= 0.25 && vpip <= 0.42) vpipScore = 20
  else if (vpip >= 0.18) vpipScore = vpip <= 0.55 ? 13 : clamp(Math.round(20 - (vpip - 0.55) / 0.30 * 15), 2, 9)
  else vpipScore = clamp(Math.round(vpip / 0.18 * 12), 0, 11)

  // PFR/VPIP Ratio /15 — optimal 50–80%
  let pfrScore = 8
  if (n >= 5 && profile.vpipHands >= 2) {
    const ratio = profile.pfrHands / profile.vpipHands
    if (ratio >= 0.50 && ratio <= 0.80) pfrScore = 15
    else if (ratio >= 0.35) pfrScore = ratio <= 0.95 ? 10 : 6
    else pfrScore = clamp(Math.round(ratio / 0.35 * 8), 0, 7)
  }

  // Aggression Factor /20 — optimal 1.5–3.0
  const af = profile.postflopCalls > 0
    ? profile.postflopBets / profile.postflopCalls
    : (profile.postflopBets > 0 ? 3.5 : 1.0)
  let aggScore: number
  if (af >= 1.5 && af <= 3.0) aggScore = 20
  else if ((af >= 1.0 && af < 1.5) || (af > 3.0 && af <= 4.5)) aggScore = 13
  else if ((af >= 0.5 && af < 1.0) || (af > 4.5 && af <= 6.0)) aggScore = 7
  else aggScore = 2

  // Fold-to-Raise /15 — optimal 40–65%
  let ftrScore = 10
  if (profile.timesRaised >= 4) {
    const ftr = profile.foldedToRaise / profile.timesRaised
    if (ftr >= 0.40 && ftr <= 0.65) ftrScore = 15
    else if ((ftr >= 0.28 && ftr < 0.40) || (ftr > 0.65 && ftr <= 0.78)) ftrScore = 9
    else if ((ftr >= 0.18 && ftr < 0.28) || (ftr > 0.78 && ftr <= 0.88)) ftrScore = 4
    else ftrScore = 0
  }

  // Showdown Win Rate /15
  let showdownScore = 8
  if (profile.showdowns >= 3) {
    showdownScore = clamp(Math.round(profile.showdownWins / profile.showdowns * 22), 0, 15)
  }

  // Net Profit /15
  let profitScore = 8
  if (n >= 5) {
    if (netChips >= 0) profitScore = clamp(8 + Math.round(Math.min(netBB, 100) / 100 * 7), 8, 15)
    else profitScore = clamp(8 + Math.round(Math.max(netBB, -200) / 200 * 8), 0, 7)
  }

  const total = clamp(vpipScore + pfrScore + aggScore + ftrScore + showdownScore + profitScore, 0, 100)

  let grade: string, gradeColor: string, gradeLabel: string
  if (total >= 85) { grade = 'S'; gradeColor = '#f0c040'; gradeLabel = '超神级' }
  else if (total >= 75) { grade = 'A'; gradeColor = '#4caf50'; gradeLabel = '优秀' }
  else if (total >= 65) { grade = 'B'; gradeColor = '#42a5f5'; gradeLabel = '良好' }
  else if (total >= 55) { grade = 'C'; gradeColor = '#ff9800'; gradeLabel = '尚可' }
  else if (total >= 40) { grade = 'D'; gradeColor = '#ef5350'; gradeLabel = '需要改进' }
  else { grade = 'F'; gradeColor = '#b71c1c'; gradeLabel = '需要重新学习' }

  return { total, grade, gradeColor, gradeLabel, vpipScore, pfrScore, aggScore, ftrScore, showdownScore, profitScore, netChips, netBB }
}

// ─── Leaks & Strengths ─────────────────────────────────────────────────────────

function detectLeaks(profile: HumanProfile): string[] {
  const leaks: string[] = []
  const n = profile.handsDealt
  if (n < 3) return leaks
  const vpip = profile.vpipHands / n
  const af = profile.postflopCalls > 0 ? profile.postflopBets / profile.postflopCalls : 0
  const postTotal = profile.postflopBets + profile.postflopCalls + profile.postflopFolds + profile.postflopChecks

  if (vpip < 0.18) leaks.push('🔴 过度保守（Nit）：VPIP ' + pct(vpip) + '，弃牌太多，错失了大量利润机会。')
  if (vpip > 0.58) leaks.push('🔴 玩牌过松：VPIP ' + pct(vpip) + '，参与了太多底池，起手牌选择过于随意。')
  if (profile.timesRaised >= 4) {
    const ftr = profile.foldedToRaise / profile.timesRaised
    if (ftr > 0.75) leaks.push('🔴 面对加注过度弃牌：FTR ' + pct(ftr) + '，对手会频繁用加注来逼你弃牌。')
    if (ftr < 0.25) leaks.push('🔴 跟注站倾向：FTR ' + pct(ftr) + '，你面对加注跟注过多，承担了不必要的风险。')
  }
  if (postTotal >= 5 && af < 0.8) leaks.push('🔴 翻后过于被动：攻击系数（AF）仅 ' + af.toFixed(2) + '，过牌和跟注过多，失去了主动权。')
  if (postTotal >= 5 && af > 5.5) leaks.push('🔴 翻后过于激进：AF ' + af.toFixed(2) + '，下注频率过高，容易被对手针对性跟注。')
  if (profile.vpipHands >= 3 && profile.pfrHands / profile.vpipHands < 0.30) leaks.push('🔴 翻前被动：PFR/VPIP=' + pct(profile.pfrHands / profile.vpipHands) + '，入局多以跟注为主，缺乏主动性。')
  if (profile.cbetOpportunities >= 3 && profile.cbets / profile.cbetOpportunities < 0.35) leaks.push('🔴 C-bet不足：翻前加注后翻牌圈持续注频率仅 ' + pct(profile.cbets / profile.cbetOpportunities) + '，错失了底池主导机会。')
  if (profile.cbetOpportunities >= 3 && profile.cbets / profile.cbetOpportunities > 0.92) leaks.push('🟡 C-bet过于频繁：' + pct(profile.cbets / profile.cbetOpportunities) + '，对手会针对性地跟注或加注反制。')
  if (profile.showdowns >= 3 && profile.showdownWins / profile.showdowns < 0.35) leaks.push('🔴 摊牌质量差：摊牌胜率 ' + pct(profile.showdownWins / profile.showdowns) + '，到达河牌圈时手牌强度不足。')
  return leaks
}

function detectStrengths(profile: HumanProfile): string[] {
  const strengths: string[] = []
  const n = profile.handsDealt
  if (n < 3) return strengths
  const vpip = profile.vpipHands / n
  const af = profile.postflopCalls > 0 ? profile.postflopBets / profile.postflopCalls : 0

  if (vpip >= 0.25 && vpip <= 0.42) strengths.push('✅ 起手牌选择合理：VPIP ' + pct(vpip) + '，参与手数健康。')
  if (profile.timesRaised >= 4) {
    const ftr = profile.foldedToRaise / profile.timesRaised
    if (ftr >= 0.40 && ftr <= 0.65) strengths.push('✅ 面对加注判断合理：FTR ' + pct(ftr) + '，既不过度弃牌也不盲目跟注。')
  }
  if (af >= 1.5 && af <= 3.0) strengths.push('✅ 翻后攻击性良好：AF ' + af.toFixed(2) + '，主动下注/加注比例适当。')
  if (profile.cbetOpportunities >= 3) {
    const cb = profile.cbets / profile.cbetOpportunities
    if (cb >= 0.45 && cb <= 0.75) strengths.push('✅ C-bet频率健康：' + pct(cb) + '，有效维持翻牌圈主导权。')
  }
  if (profile.showdowns >= 3 && profile.showdownWins / profile.showdowns >= 0.55) strengths.push('✅ 摊牌胜率优秀：' + pct(profile.showdownWins / profile.showdowns) + '，到达河牌圈时手牌质量高。')
  if (profile.vpipHands >= 2 && profile.pfrHands / profile.vpipHands >= 0.50) strengths.push('✅ 翻前主动性好：以加注而非跟注入局的比例健康（PFR/VPIP=' + pct(profile.pfrHands / profile.vpipHands) + '）。')
  return strengths
}

// ─── Action Plan ───────────────────────────────────────────────────────────────

function generateActionPlan(profile: HumanProfile): string[] {
  const plan: string[] = []
  const n = profile.handsDealt
  if (n < 5) { plan.push('继续积累手数，获得更精确的统计分析。建议至少完成20手后查看报告。'); return plan }

  const vpip = profile.vpipHands / n
  const af = profile.postflopCalls > 0 ? profile.postflopBets / profile.postflopCalls : 0

  if (vpip < 0.22) plan.push('📌 扩大起手牌范围：在按钮位（BTN）和截断位（CO）尝试加注 AXs、KJs+、QTs+、J9s+、T9s、98s 等同花连牌。')
  else if (vpip > 0.55) plan.push('📌 收紧起手牌选择：早期位置（UTG/MP）只打 TT+、AQ+；按钮位加入 77+、AJ+、KQ。')

  if (profile.vpipHands >= 3 && profile.pfrHands / profile.vpipHands < 0.40) plan.push('📌 增加翻前加注频率：持有好手牌时优先选择加注到 3BB，而不是跟注。主动加注可以获得位置优势和底池主动权。')

  if (profile.cbetOpportunities >= 2 && profile.cbets / profile.cbetOpportunities < 0.40) plan.push('📌 练习持续注（C-bet）：翻前加注后，在翻牌圈用底池的50–66%下注。即使没有击中公共牌，也可以通过C-bet赢得底池。')

  if (af < 1.0) plan.push('📌 减少被动跟注：每次准备跟注时先问自己"为什么不加注？"。加注可以赢得底池（对手弃牌）或获取更多筹码（强牌时）。')

  if (profile.timesRaised >= 4) {
    const ftr = profile.foldedToRaise / profile.timesRaised
    if (ftr > 0.70) plan.push('📌 减少面对加注时的弃牌：持有中等强度手牌（如中对、同花听牌）时，尝试跟注并在后续街道根据公共牌决策。')
    if (ftr < 0.30) plan.push('📌 学会在面对加注时弃牌：底池赔率不合适时果断弃牌。不要因"已投入筹码"而继续（沉没成本谬误）。')
  }

  plan.push('📌 每次Session后回顾：选出你认为操作有误的2–3手牌，逐街分析最优决策，这是提升最快的方法。')

  return plan.slice(0, 5)
}

// ─── Hand Analysis ─────────────────────────────────────────────────────────────

interface HandAnalysis {
  hand: HandRecord
  net: number
  contributed: number
  won: number
  didFold: boolean
  foldStreet: string | null
  tip: string
  tipType: 'good' | 'info' | 'warn'
  improvement: string
  label: string
}

function analyzeHand(hand: HandRecord): HandAnalysis {
  const contributed = handContributed(hand)
  const won = hand.winners.find(w => w.isHuman)?.amount ?? 0
  const net = won - contributed
  const humanWon = won > 0

  let didFold = false
  let foldStreet: string | null = null
  for (const street of hand.streets) {
    if (street.actions.some(a => a.isHuman && a.action === 'fold')) {
      didFold = true; foldStreet = street.phase; break
    }
  }

  const pfStreet = hand.streets.find(s => s.phase === 'preflop')
  const humanRaisedPF = pfStreet?.actions.some(a => a.isHuman && (a.action === 'raise' || a.action === 'all-in')) ?? false

  const humanCheckedRiver = hand.streets.find(s => s.phase === 'river')?.actions.some(a => a.isHuman && a.action === 'check') ?? false
  const humanBetRiver = hand.streets.find(s => s.phase === 'river')?.actions.some(a => a.isHuman && (a.action === 'raise' || a.action === 'all-in')) ?? false
  const humanCalledRiver = hand.streets.find(s => s.phase === 'river')?.actions.some(a => a.isHuman && a.action === 'call') ?? false
  const opponentWinner = hand.winners.find(w => !w.isHuman)
  const streetsPlayed = hand.streets.filter(s => s.actions.some(a => a.isHuman)).length

  let tip = '', improvement = '', tipType: 'good' | 'info' | 'warn' = 'info', label = ''

  if (humanWon) {
    label = net >= hand.config.bigBlind * 8 ? '🏆 大赢' : '✅ 赢牌'
    tip = `赢得底池 $${won.toLocaleString()}，净赚 $${net.toLocaleString()}（共投入 $${contributed.toLocaleString()}）。`
    tipType = 'good'
    if (humanCheckedRiver && streetsPlayed >= 3) {
      improvement = '赢了这手，但河牌圈选择了过牌。如果持有强牌（两对以上），对手可能有更弱的手牌会跟注，下一次考虑河牌薄价值下注（约底池50%）以最大化利润。'
    } else if (!humanRaisedPF) {
      improvement = '赢了这手。注意：未来面对此类情况，翻前考虑主动加注来建立范围优势，而不是跟注入局。'
    } else {
      improvement = '本手操作流畅，主动性强。继续保持这种主动的游戏风格。'
    }
  } else if (didFold) {
    if (foldStreet === 'preflop' && contributed <= hand.config.bigBlind) {
      label = 'ℹ️ 翻前弃牌'
      tip = `翻前弃牌，损失 $${contributed}（${contributed === 0 ? '未投入' : 'BB/SB'}）。`
      tipType = 'info'
      improvement = '翻前弃牌是正常操作，损失最小化。注意观察弃牌后公共牌，判断若跟注是否有胜算，以此校准自己的弃牌标准。'
    } else {
      label = '⚠️ 中途弃牌'
      tip = `在${streetCN(foldStreet)}弃牌，已投入 $${contributed}，本手损失 $${contributed}。`
      tipType = 'warn'
      const potAtFold = hand.totalPot
      improvement = `已投入 $${contributed} 后选择弃牌。关键问题：面对的跟注额相对底池（$${potAtFold}）的赔率是否合理？如果底池赔率 > 3:1 且手牌有听牌潜力，通常值得继续；如果是纯粹的高牌且无改进空间，弃牌正确。`
    }
  } else {
    // Lost at showdown
    if (humanCalledRiver && opponentWinner) {
      label = '💸 河牌跟注失利'
      tip = `河牌跟注后摊牌失败，对手持有 ${opponentWinner.handDescription}，本手净损失 $${Math.abs(net).toLocaleString()}。`
      tipType = 'warn'
      improvement = `河牌跟注后输掉了底池。分析对手的下注范围：他在河牌的下注是价值还是诈唬？如果对手在这条线路上很少诈唬，未来考虑在河牌弃牌来节省筹码。`
    } else if (humanBetRiver && !humanWon) {
      label = '💸 河牌下注失利'
      tip = `河牌主动下注但输掉了底池，净损失 $${Math.abs(net).toLocaleString()}。`
      tipType = 'warn'
      improvement = '河牌下注（价值或诈唬）后输牌。评估：这次下注是价值下注还是诈唬？如果是诈唬，确认对手的跟注范围是否合理（对手会以什么手牌跟注你？）。如果是价值下注，思考是否高估了自己手牌的相对强度。'
    } else {
      label = '💸 摊牌失利'
      tip = `摊牌失败${opponentWinner ? `，对手持有 ${opponentWinner.handDescription}` : ''}，净损失 $${Math.abs(net).toLocaleString()}。`
      tipType = 'warn'
      improvement = opponentWinner
        ? `对手最终持有 ${opponentWinner.handDescription}。回顾各街道：是否有公共牌出现时，对手的范围已经明显强于你的手牌？那个时候是弃牌的最佳时机。`
        : '回顾各街道决策，寻找更早止损的关键决策点，避免在手牌明显落后时继续投入筹码。'
    }
  }

  return { hand, net, contributed, won, didFold, foldStreet, tip, tipType, improvement, label }
}

function selectHighlightHands(handHistory: HandRecord[]): HandRecord[] {
  if (handHistory.length === 0) return []
  const seen = new Set<number>()
  const picks: HandRecord[] = []

  const withNet = handHistory.map(h => ({ hand: h, net: handNet(h) }))

  const bestWin = withNet.filter(h => h.net > 0).sort((a, b) => b.net - a.net)[0]
  if (bestWin) { picks.push(bestWin.hand); seen.add(bestWin.hand.roundNumber) }

  const worstLoss = withNet.filter(h => h.net < 0).sort((a, b) => a.net - b.net)[0]
  if (worstLoss && !seen.has(worstLoss.hand.roundNumber)) { picks.push(worstLoss.hand); seen.add(worstLoss.hand.roundNumber) }

  // Most complex (most streets human was involved)
  const mostComplex = [...handHistory]
    .filter(h => !seen.has(h.roundNumber))
    .sort((a, b) => {
      const aS = a.streets.filter(s => s.actions.some(a => a.isHuman)).length
      const bS = b.streets.filter(s => s.actions.some(b => b.isHuman)).length
      return bS - aS
    })[0]
  if (mostComplex) { picks.push(mostComplex); seen.add(mostComplex.roundNumber) }

  // Fill up to 5 by impact
  for (const h of withNet.sort((a, b) => Math.abs(b.net) - Math.abs(a.net))) {
    if (picks.length >= 5) break
    if (!seen.has(h.hand.roundNumber)) { picks.push(h.hand); seen.add(h.hand.roundNumber) }
  }

  return picks.slice(0, 5)
}

// ─── Formatting ────────────────────────────────────────────────────────────────

function pct(v: number) { return Math.round(v * 100) + '%' }

function CardChip({ card }: { card: Card }) {
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds'
  return (
    <span className="inline-flex items-center justify-center rounded font-bold"
      style={{ background: '#0f1f0f', border: '1px solid #2a4a2a', color: isRed ? '#ff7070' : '#d0d0d0', fontSize: 14, padding: '2px 6px', minWidth: 30, letterSpacing: -0.5 }}>
      {rankToString(card.rank)}{suitToSymbol(card.suit)}
    </span>
  )
}

function ScoreBar({ label, score, max, color }: { label: string; score: number; max: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between" style={{ fontSize: 12 }}>
        <span style={{ color: '#9abaaa' }}>{label}</span>
        <span style={{ color }}>{score}/{max}</span>
      </div>
      <div style={{ height: 5, background: '#0f2a1a', borderRadius: 3 }}>
        <div style={{ height: '100%', width: `${(score / max) * 100}%`, background: color, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
    </div>
  )
}

// ─── Hand Card Component ────────────────────────────────────────────────────────

function HighlightHandCard({ analysis, index }: { analysis: HandAnalysis; index: number }) {
  const [open, setOpen] = useState(index === 0)
  const { hand, net, tip, tipType, improvement, label } = analysis
  const humanInfo = hand.playerInfo.find(p => p.isHuman)
  const tipBg = tipType === 'good' ? '#0a2a0a' : tipType === 'warn' ? '#2a1a0a' : '#0a1a2a'
  const tipBorder = tipType === 'good' ? '#2a6a2a' : tipType === 'warn' ? '#6a3a0a' : '#0a3a6a'
  const netColor = net >= 0 ? '#4caf50' : '#ef5350'

  return (
    <div style={{ background: '#081810', border: '1px solid #1a3a28', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
        style={{ background: 'transparent', cursor: 'pointer' }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 13, color: '#7db87d' }}>第 {hand.roundNumber} 手</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#c0c0c0' }}>{label}</span>
          {humanInfo && humanInfo.holeCards.length === 2 && (
            <div className="flex gap-1">
              {humanInfo.holeCards.map((c, i) => <CardChip key={i} card={c} />)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold" style={{ color: netColor, fontSize: 14 }}>
            {net >= 0 ? '+' : ''}{net.toLocaleString()}
          </span>
          <span style={{ color: '#5a9a6a', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {/* Community cards */}
          {hand.communityCards.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span style={{ fontSize: 11, color: '#6a9a7a', minWidth: 50 }}>公共牌</span>
              {hand.communityCards.map((c, i) => <CardChip key={i} card={c} />)}
            </div>
          )}

          {/* Street replay */}
          <div className="flex flex-col gap-1.5">
            {hand.streets.map((street, si) => {
              const humanActs = street.actions.filter(a => a.isHuman)
              const oppActs = street.actions.filter(a => !a.isHuman)
              if (street.actions.length === 0) return null
              return (
                <div key={si} style={{ background: '#0a1f12', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#5a9a6a', marginBottom: 4 }}>
                    {streetCN(street.phase).toUpperCase()}
                    {street.communityCards.length > 0 && (
                      <span className="ml-2">
                        {street.communityCards.map((c, i) => (
                          <span key={i} className="ml-1">
                            <CardChip card={c} />
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  {street.actions.map((a, ai) => (
                    <div key={ai} className="flex items-center gap-2" style={{ fontSize: 12, marginBottom: 2 }}>
                      <span style={{ minWidth: 6, height: 6, borderRadius: '50%', background: a.isHuman ? '#f0c040' : '#5a7a6a', display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ color: a.isHuman ? '#f0c040' : '#8ab09a', fontWeight: a.isHuman ? 700 : 400 }}>
                        {a.isHuman ? '你' : a.playerName}
                      </span>
                      <span style={{ color: a.action === 'fold' ? '#ef5350' : a.action === 'raise' || a.action === 'all-in' ? '#ffcc00' : a.action === 'call' ? '#66dd88' : '#aaaaaa' }}>
                        {actionCN(a.action)}{a.amount > 0 ? ` $${a.amount}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* Result */}
          {hand.winners.length > 0 && (
            <div style={{ fontSize: 12, color: '#7db87d' }}>
              <span style={{ color: '#5a9a6a' }}>结果：</span>
              {hand.winners.map((w, i) => (
                <span key={i} style={{ color: w.isHuman ? '#f0c040' : '#c0c0c0', marginRight: 8 }}>
                  {w.isHuman ? '你' : w.playerName} 赢得 ${w.amount.toLocaleString()}（{w.handDescription}）
                </span>
              ))}
            </div>
          )}

          {/* Summary tip */}
          <div style={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, color: '#b0c0b0', marginBottom: 6 }}>{tip}</div>
            <div style={{ fontSize: 12, color: '#e0e0c0', fontWeight: 500 }}>
              <span style={{ color: '#f0c040' }}>💡 改善建议：</span>{improvement}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Modal ────────────────────────────────────────────────────────────────

interface Props {
  handHistory: HandRecord[]
  humanProfile: HumanProfile
  lang: 'zh' | 'en'
  bigBlind: number
  onClose: () => void
}

export default function SessionReportModal({ handHistory, humanProfile, lang, bigBlind, onClose }: Props) {
  const score = computeScore(humanProfile, handHistory, bigBlind)
  const leaks = detectLeaks(humanProfile)
  const strengths = detectStrengths(humanProfile)
  const plan = generateActionPlan(humanProfile)
  const highlights = selectHighlightHands(handHistory)
  const analyses = highlights.map(analyzeHand)

  const n = humanProfile.handsDealt
  const vpip = n > 0 ? pct(humanProfile.vpipHands / n) : '—'
  const pfr = n > 0 ? pct(humanProfile.pfrHands / n) : '—'
  const ftr = humanProfile.timesRaised >= 4 ? pct(humanProfile.foldedToRaise / humanProfile.timesRaised) : '—'
  const af = humanProfile.postflopCalls > 0
    ? (humanProfile.postflopBets / humanProfile.postflopCalls).toFixed(2) : '—'
  const cbet = humanProfile.cbetOpportunities >= 2 ? pct(humanProfile.cbets / humanProfile.cbetOpportunities) : '—'
  const wtsd = humanProfile.showdowns >= 2 ? pct(humanProfile.showdownWins / humanProfile.showdowns) : '—'

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.85)', padding: '20px 12px 40px' }}>
      <div
        className="w-full max-w-2xl rounded-2xl"
        style={{ background: '#050f08', border: '1px solid #1a3a28', boxShadow: '0 8px 60px rgba(0,0,0,0.8)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #1a3a28' }}>
          <div>
            <div className="text-lg font-bold" style={{ color: '#f0c040' }}>📊 Session 分析报告</div>
            <div style={{ fontSize: 12, color: '#5a9a6a' }}>{handHistory.length} 手牌 · 本次游戏</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#0a2a1a', border: '1px solid #1a4a28', color: '#5a9a6a', borderRadius: 8, padding: '6px 14px', fontSize: 13 }}>
            关闭 ✕
          </button>
        </div>

        <div className="flex flex-col gap-5 p-6">

          {/* ── Score Section ── */}
          <div className="flex gap-5 items-start" style={{ background: '#081810', border: '1px solid #1a3a28', borderRadius: 12, padding: '20px' }}>
            {/* Big grade */}
            <div className="flex flex-col items-center" style={{ minWidth: 90 }}>
              <div style={{ fontSize: 72, fontWeight: 900, color: score.gradeColor, lineHeight: 1, textShadow: `0 0 30px ${score.gradeColor}66` }}>
                {score.grade}
              </div>
              <div style={{ fontSize: 13, color: score.gradeColor, fontWeight: 700, marginTop: 2 }}>{score.gradeLabel}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#e0e0e0', marginTop: 6 }}>{score.total}<span style={{ fontSize: 14, color: '#7db87d' }}>/100</span></div>
            </div>

            {/* Score breakdown */}
            <div className="flex-1 flex flex-col gap-2.5">
              <ScoreBar label="起手牌选择（VPIP）" score={score.vpipScore} max={20} color="#42a5f5" />
              <ScoreBar label="翻前攻击性（PFR）" score={score.pfrScore} max={15} color="#ab47bc" />
              <ScoreBar label="翻后攻击系数（AF）" score={score.aggScore} max={20} color="#ff9800" />
              <ScoreBar label="面对加注应对（FTR）" score={score.ftrScore} max={15} color="#26c6da" />
              <ScoreBar label="摊牌胜率（WTSD%）" score={score.showdownScore} max={15} color="#66bb6a" />
              <ScoreBar label="盈亏表现" score={score.profitScore} max={15} color={score.netChips >= 0 ? '#4caf50' : '#ef5350'} />
            </div>
          </div>

          {/* ── Session Stats ── */}
          <div>
            <div className="text-sm font-bold mb-3" style={{ color: '#7db87d' }}>📈 本局统计</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {[
                { label: '参与手数', value: n.toString() },
                { label: 'VPIP', value: vpip, note: '入池频率' },
                { label: 'PFR', value: pfr, note: '翻前加注' },
                { label: 'AF', value: af, note: '攻击系数' },
                { label: 'FTR', value: ftr, note: '面对加注弃牌率' },
                { label: 'C-bet%', value: cbet, note: '持续注频率' },
                { label: 'WTSD%', value: wtsd, note: '摊牌胜率' },
                { label: '净盈亏', value: (score.netChips >= 0 ? '+' : '') + score.netChips.toLocaleString(), note: score.netBB !== 0 ? `${score.netBB.toFixed(1)} BB` : '' },
              ].map(({ label, value, note }) => (
                <div key={label} style={{ background: '#081810', border: '1px solid #1a3a28', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: '#5a9a6a', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: label === '净盈亏' ? (score.netChips >= 0 ? '#4caf50' : '#ef5350') : '#e0e0e0' }}>{value}</div>
                  {note && <div style={{ fontSize: 10, color: '#3a7a4a' }}>{note}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* ── Strengths & Leaks ── */}
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {strengths.length > 0 && (
              <div style={{ background: '#081810', border: '1px solid #1a4a1a', borderRadius: 10, padding: '14px' }}>
                <div className="font-bold mb-2" style={{ fontSize: 13, color: '#4caf50' }}>💪 优势</div>
                <ul className="flex flex-col gap-2">
                  {strengths.map((s, i) => <li key={i} style={{ fontSize: 12, color: '#9aba9a', lineHeight: 1.5 }}>{s}</li>)}
                </ul>
              </div>
            )}
            {leaks.length > 0 && (
              <div style={{ background: '#081810', border: '1px solid #4a1a1a', borderRadius: 10, padding: '14px' }}>
                <div className="font-bold mb-2" style={{ fontSize: 13, color: '#ef5350' }}>⚠️ 漏洞</div>
                <ul className="flex flex-col gap-2">
                  {leaks.map((l, i) => <li key={i} style={{ fontSize: 12, color: '#ba9a9a', lineHeight: 1.5 }}>{l}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* ── Highlight Hands ── */}
          {analyses.length > 0 && (
            <div>
              <div className="text-sm font-bold mb-3" style={{ color: '#7db87d' }}>🔍 重点手牌分析（点击展开）</div>
              {analyses.map((a, i) => <HighlightHandCard key={a.hand.roundNumber} analysis={a} index={i} />)}
            </div>
          )}

          {/* ── Action Plan ── */}
          <div style={{ background: '#081810', border: '1px solid #2a3a1a', borderRadius: 10, padding: '16px' }}>
            <div className="font-bold mb-3" style={{ fontSize: 13, color: '#f0c040' }}>🎯 改进行动计划</div>
            <ol className="flex flex-col gap-3">
              {plan.map((item, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center rounded-full font-bold"
                    style={{ width: 22, height: 22, background: '#1a3a08', border: '1px solid #2d6a10', color: '#8aba5a', fontSize: 11 }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 13, color: '#c0d0b0', lineHeight: 1.6 }}>{item}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* ── Footer note ── */}
          <div style={{ fontSize: 11, color: '#3a6a4a', textAlign: 'center', lineHeight: 1.6 }}>
            统计数据基于本次 Session 的 {n} 手牌。样本量较小时数据仅供参考，建议积累 30+ 手后再综合评估。
          </div>
        </div>
      </div>
    </div>
  )
}
