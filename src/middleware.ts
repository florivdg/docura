import { defineMiddleware } from 'astro:middleware'
import { auth } from '@/lib/auth'
import { isPublicPath } from '@/lib/public-paths'
import {
  originRejection,
  unauthenticatedResponse,
} from '@/lib/server/request-guard'

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url

  if (isPublicPath(pathname)) {
    return next()
  }

  const session = await auth.api.getSession({
    headers: context.request.headers,
  })

  if (!session) {
    return unauthenticatedResponse(pathname, () => context.redirect('/login'))
  }

  const rejection = originRejection(
    context.request,
    pathname,
    process.env.BETTER_AUTH_URL,
  )
  if (rejection) {
    return rejection
  }

  context.locals.user = session.user
  context.locals.session = session.session

  return next()
})
