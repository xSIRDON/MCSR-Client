import { fetchPack, type ModrinthIndex } from '../instances/mrpack'

let cachedIndex: ModrinthIndex | null = null

export async function getIndex(): Promise<ModrinthIndex> {
  if (!cachedIndex) cachedIndex = await fetchPack()
  return cachedIndex
}

export async function refreshIndex(): Promise<ModrinthIndex> {
  cachedIndex = await fetchPack()
  return cachedIndex
}

