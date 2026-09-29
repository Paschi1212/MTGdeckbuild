/**
 * Reads an error response from one of our Netlify Functions and turns it
 * into a user-facing German message, special-casing Gemini rate limits
 * (which happen often on the free tier and otherwise just show as a vague
 * "Fehler bei der Analyse").
 */
export async function readApiError(response) {
  let message = null

  try {
    const data = await response.json()
    message = data.message || data.error || null
  } catch (error) {
    // Not a JSON body — most commonly a hard function timeout (the request took too
    // long and got killed before it could send back our normal JSON error shape).
  }

  if (response.status === 429 || (message && /RESOURCE_EXHAUSTED|rate.?limit/i.test(message))) {
    return 'Die KI ist gerade stark ausgelastet (Gemini-Kontingent erreicht). Bitte warte 1-2 Minuten und versuche es erneut.'
  }

  if (!message) {
    return 'Die Anfrage hat zu lange gedauert oder ist fehlgeschlagen. Versuch es nochmal — bei einer langen Frage hilft es, sie kürzer zu formulieren.'
  }

  return message
}
