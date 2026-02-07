import { createAuthClient } from 'better-auth/vue'
import { passkeyClient } from '@better-auth/passkey/client'
import { adminClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [passkeyClient(), adminClient()],
})
