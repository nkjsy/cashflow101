import { useEffect, useRef, useState } from 'react'
import { BOARD, FAST_TRACK_BOARD } from './game-core/data'
import type { PlayerState } from './game-core/types'

export type PieceSpot = { phase: PlayerState['phase']; position: number }
export type RollFlash = { playerIndex: number; steps: number; key: number }

// Two dice move at most 12 spaces; anything farther is a load or a teleport, not a walk.
const MAX_WALK = 12

const boardLength = (phase: PlayerState['phase']) => phase === 'fast-track' ? FAST_TRACK_BOARD.length : BOARD.length

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches }
  catch { return false }
}

const spotOf = (player: PlayerState): PieceSpot => ({ phase: player.phase, position: player.position })

const spotsKey = (players: PlayerState[]) => players.map((player) => `${player.phase}:${player.position}`).join('|')

const parseSpots = (key: string) => key.split('|').map((entry): PieceSpot => {
  const [phase, position] = entry.split(':')
  return { phase: phase as PieceSpot['phase'], position: Number(position) }
})

const walkDistance = (from: PieceSpot, to: PieceSpot) => {
  if (from.phase !== to.phase) return Infinity
  const length = boardLength(to.phase)
  return (to.position - from.position + length) % length
}

// Shows each piece walking space by space toward its engine position instead of jumping there.
// The engine state is already final; this only delays what the board draws.
export function useWalkingPieces(players: PlayerState[], stepMs: number) {
  const [spots, setSpots] = useState<PieceSpot[]>(() => players.map(spotOf))
  const [roll, setRoll] = useState<RollFlash | null>(null)
  const previousTargets = useRef<PieceSpot[]>(players.map(spotOf))
  const rollKey = useRef(0)
  const targetKey = spotsKey(players)

  useEffect(() => {
    const targets = parseSpots(targetKey)
    const moved = targets.findIndex((target, index) => {
      const previous = previousTargets.current[index]
      return previous && walkDistance(previous, target) > 0 && walkDistance(previous, target) <= MAX_WALK
    })
    if (moved >= 0) {
      rollKey.current += 1
      setRoll({ playerIndex: moved, steps: walkDistance(previousTargets.current[moved], targets[moved]), key: rollKey.current })
    }
    previousTargets.current = targets
    const reduced = prefersReducedMotion()
    setSpots((current) => targets.map((target, index) => {
      const spot = current[index]
      if (!spot || reduced || walkDistance(spot, target) > MAX_WALK) return target
      return spot
    }))
  }, [targetKey])

  useEffect(() => {
    const targets = parseSpots(targetKey)
    if (spots.every((spot, index) => walkDistance(spot, targets[index]) === 0)) return
    const timer = window.setTimeout(() => setSpots((current) => current.map((spot, index) => {
      const target = targets[index]
      const distance = walkDistance(spot, target)
      if (distance === 0) return spot
      if (distance > MAX_WALK) return target
      return { phase: spot.phase, position: (spot.position + 1) % boardLength(spot.phase) }
    })), stepMs)
    return () => window.clearTimeout(timer)
  }, [spots, targetKey, stepMs])

  const walking = spots.map((spot, index) => players[index] ? walkDistance(spot, spotOf(players[index])) !== 0 : false)
  return { spots, walking, roll }
}
