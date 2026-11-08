// Shared timeline helpers: finding lanes by name and creating missing ones after the last lane.
import type { LegendKeeper } from '@legendkeeper/sdk'

type Ref = { resourceId: string; documentId: string }

/** Returns a function that maps a lane name to its id, creating the lane when it doesn't exist. */
export async function laneFinder(lk: LegendKeeper, ref: Ref, dryRun = false) {
  const lanes = new Map<string, string>()
  const names = new Map<string, string>()
  let lastRank = 'a0'
  for (const lane of (await lk.timelines.listLanes(ref)).data) {
    lanes.set(lane.name.toLowerCase(), lane.id)
    names.set(lane.id, lane.name)
    if (lane.rank && lane.rank > lastRank) lastRank = lane.rank
  }
  const laneFor = async (name: string) => {
    const existing = lanes.get(name.toLowerCase())
    if (existing) return existing
    if (dryRun) return `(new lane ${name})`
    lastRank = `${lastRank}V`
    const lane = await lk.timelines.createLane(ref, { name, rank: lastRank, size: 'lg' })
    lanes.set(name.toLowerCase(), lane.id)
    return lane.id
  }
  return { laneFor, laneName: (id: string) => names.get(id) }
}
