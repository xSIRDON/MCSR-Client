export const MSA_CLIENT_ID = '00000000402b5328'

export function prismAccounts(account: { uuid: string; name: string; refreshToken: string }) {
  return { formatVersion: 3, accounts: [{
    type: 'MSA', active: true, 'msa-client-id': MSA_CLIENT_ID,
    msa: { refresh_token: account.refreshToken },
    profile: {
      id: account.uuid, name: account.name,
      skin: { id: '', url: '', variant: 'classic' }, capes: []
    }
  }] }
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

export function readPrismRefresh(value: unknown): { uuid: string; refreshToken: string } | null {
  const root = object(value)
  if (root?.formatVersion !== 3 || !Array.isArray(root.accounts)) return null
  const account = object(root.accounts[0])
  if (account?.type !== 'MSA' || account['msa-client-id'] !== MSA_CLIENT_ID) return null
  const profile = object(account.profile)
  const msa = object(account.msa)
  if (typeof profile?.id !== 'string' || typeof msa?.refresh_token !== 'string' || !msa.refresh_token) return null
  return { uuid: profile.id, refreshToken: msa.refresh_token }
}

export function readPrismSecrets(value: unknown): string[] {
  const root = object(value)
  if (!readPrismRefresh(value) || !Array.isArray(root?.accounts)) return []
  const account = object(root.accounts[0])
  const ygg = object(account?.ygg)
  const msa = object(account?.msa)
  return [ygg?.token, msa?.token, msa?.refresh_token].filter((token): token is string => typeof token === 'string' && token.length > 0)
}
