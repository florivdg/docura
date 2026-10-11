import type { ActivityActor } from '@/lib/activity'

/** The signed-in user (set by the middleware) as the actor of a change. */
export function actorFromLocals(locals: App.Locals): ActivityActor {
  return { type: 'user', id: locals.user.id, name: locals.user.name }
}
