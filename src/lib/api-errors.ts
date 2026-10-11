import { JsonParseError } from './api-utils'
import { ApiValidationError } from './api-validation-error'
import { jsonResponse } from './json-response'

/**
 * Runs a route handler and maps the expected request errors to JSON
 * responses: malformed JSON → 400, `ApiValidationError` → its status.
 * Anything else propagates to Astro's 500 handling.
 */
export async function withApiErrors(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler()
  } catch (err) {
    if (err instanceof JsonParseError)
      return jsonResponse({ error: err.message }, 400)
    if (err instanceof ApiValidationError)
      return jsonResponse({ error: err.message }, err.status)
    throw err
  }
}
