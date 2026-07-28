import { describe, it, expect } from 'vitest'
import { isSafeExternalUrl, isSameOrigin } from './url-safety'

describe('isSafeExternalUrl', () => {
  it('allows absolute http(s) urls', () => {
    expect(isSafeExternalUrl('https://twitch.tv/someone')).toBe(true)
    expect(isSafeExternalUrl('http://example.com/x?y=1')).toBe(true)
  })

  it('refuses schemes the OS shell would act on', () => {
    expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isSafeExternalUrl('file://attacker.host/share/payload.exe')).toBe(false)
    expect(isSafeExternalUrl('smb://attacker.host/share')).toBe(false)
    expect(isSafeExternalUrl('ms-msdt:/id PCWDiagnostic')).toBe(false)
    expect(isSafeExternalUrl('search-ms:query=x')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
  })

  it('refuses relative, empty, and non-string input', () => {
    expect(isSafeExternalUrl('/local/path')).toBe(false)
    expect(isSafeExternalUrl('')).toBe(false)
    expect(isSafeExternalUrl(undefined)).toBe(false)
    expect(isSafeExternalUrl(null)).toBe(false)
    expect(isSafeExternalUrl(42)).toBe(false)
  })
})

describe('isSameOrigin', () => {
  it('allows the dev server navigating within its own origin', () => {
    expect(isSameOrigin('http://localhost:5173/#/play', 'http://localhost:5173/')).toBe(true)
  })

  it('blocks a jump to another origin', () => {
    expect(isSameOrigin('https://evil.example/', 'http://localhost:5173/')).toBe(false)
    expect(isSameOrigin('http://localhost:5174/', 'http://localhost:5173/')).toBe(false)
  })

  it('allows the packaged renderer to stay in its own directory', () => {
    const cur = 'file:///C:/app/resources/renderer/index.html'
    expect(isSameOrigin('file:///C:/app/resources/renderer/index.html#/play', cur)).toBe(true)
  })

  it('blocks a file:// jump to another directory', () => {
    const cur = 'file:///C:/app/resources/renderer/index.html'
    expect(isSameOrigin('file:///C:/Users/Noah/evil.html', cur)).toBe(false)
  })

  it('blocks a protocol switch and bad input', () => {
    expect(isSameOrigin('file:///C:/x.html', 'http://localhost:5173/')).toBe(false)
    expect(isSameOrigin('not a url', 'http://localhost:5173/')).toBe(false)
    expect(isSameOrigin(undefined, 'http://localhost:5173/')).toBe(false)
  })
})
