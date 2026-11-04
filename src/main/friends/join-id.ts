import { createHash } from 'node:crypto'

export function friendsJoinId(serverId: string): string {
  return createHash('sha1').update(`mcsr-friends-v1:${serverId}`).digest('hex')
}
