import { defineMiddleware } from 'astro:middleware'
import { auth } from '@/lib/auth'

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
    return context.redirect('/login')
  }

  context.locals.user = session.user
  context.locals.session = session.session

  return next()
})
