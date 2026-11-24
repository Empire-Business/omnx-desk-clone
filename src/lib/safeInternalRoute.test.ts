import { describe, expect, it } from 'vitest'
import { safeInternalRoute } from './safeInternalRoute'

describe('safeInternalRoute', () => {
  it.each([
    '/',
    '/clientes/123',
    '/notificacoes?filtro=abertas#item-1',
  ])('aceita rota interna: %s', (route) => {
    expect(safeInternalRoute(route)).toBe(route)
  })

  it.each([
    'https://evil.example/roubo',
    'javascript:alert(1)',
    '//evil.example/roubo',
    '/\\evil.example/roubo',
    '/%2f%2fevil.example/roubo',
    '/%5cevil.example/roubo',
    ' /clientes',
    '/clientes\n',
    '',
  ])('recusa destino inseguro: %s', (route) => {
    expect(safeInternalRoute(route)).toBeNull()
  })
})
