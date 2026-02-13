import { defineMiddleware } from 'astro:middleware'
import { auth } from '@/lib/auth'

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url

  if (
    pathname === '/login' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/api/auth')
  ) {
    return next()
  }

  const session = await auth.api.getSession({
    headers: context.request.headers,
  })

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return context.redirect('/login')
  }

  if (
    pathname.startsWith('/api/') &&
    MUTATING_METHODS.has(context.request.method)
  ) {
    const origin = context.request.headers.get('Origin')
    const allowedOrigin = process.env.BETTER_AUTH_URL
    if (
      !origin ||
      !allowedOrigin ||
      new URL(origin).origin !== new URL(allowedOrigin).origin
    ) {
      return new Response(JSON.stringify({ error: 'Ungültiger Origin' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  context.locals.user = session.user
  context.locals.session = session.session

  return next()
})
