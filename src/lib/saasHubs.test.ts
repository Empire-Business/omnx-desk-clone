import { describe, expect, it } from 'vitest'
import { buildSaasHubUrl, mapSaasHubs } from './saasHubs'

describe('saas hub catalog', () => {
  it('keeps only known products and always keeps Desk current', () => {
    const hubs = mapSaasHubs({
      hubs: [
        { skill_slug: 'omnx-sell', platform_name: 'OMNX Sell' },
        { skill_slug: 'unknown-product', platform_name: 'Unexpected' },
        { skill_slug: 'omnx-dash', platform_name: 'OMNX Dash' },
        { skill_slug: 'omnx-sell', platform_name: 'Duplicate' },
      ],
    })

    expect(hubs.map((hub) => hub.skill_slug)).toEqual([
      'omnx-desk-saas',
      'omnx-sell',
      'omnx-dash',
    ])
  })

  it('does not create extras when the response is invalid', () => {
    expect(mapSaasHubs({ hubs: 'not-an-array' }).map((hub) => hub.skill_slug)).toEqual(['omnx-desk-saas'])
  })

  it('builds a static SSO URL for each allowlisted product', () => {
    expect(buildSaasHubUrl('omnx-type')).toBe('https://type.omnx.pro/login?empire_sso=1')
    expect(buildSaasHubUrl('omnx-dash')).toBe('https://ceo.omnx.pro/login?empire_sso=1')
  })

  it('only appends a valid opaque switch intent', () => {
    const validIntent = 'a'.repeat(43)
    expect(buildSaasHubUrl('omnx-type', validIntent)).toContain(`sso_intent=${validIntent}`)
    expect(buildSaasHubUrl('omnx-type', 'not valid')).not.toContain('sso_intent')
  })
})
