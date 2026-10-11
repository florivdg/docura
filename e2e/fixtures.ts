/**
 * Per-run test content for the smoke test. Every run gets fresh tokens, so
 * the files never collide with earlier uploads (sha256 dedup) and searches
 * can only match this run's documents.
 */

/** Upper-case letters OCR rarely confuses (no I/J/O/Q/S/B/G/Z). */
const TOKEN_ALPHABET = 'ACDEFHKLMNPRTUVWXY'

export function randomToken(length: number, random = Math.random): string {
  return Array.from(
    { length },
    () => TOKEN_ALPHABET[Math.floor(random() * TOKEN_ALPHABET.length)],
  ).join('')
}

export interface SmokeFixtures {
  runId: string
  /** `html` is printed to a PDF with a text layer by headless Chromium. */
  pdf: { name: string; token: string; html: string }
  image: { name: string; token: string; word: string; html: string }
  /** Paraphrase of the PDF's content for the semantic search. */
  semanticQuery: string
  passkeyName: string
}

export function createFixtures(
  random = Math.random,
  now = new Date(),
): SmokeFixtures {
  const runId = randomToken(6, random).toLowerCase()
  const pdfToken = randomToken(10, random)
  const imageToken = randomToken(8, random)
  return {
    runId,
    pdf: {
      // File names never contain the tokens, so only the content can match.
      name: `smoke-${runId}-rechnung.pdf`,
      token: pdfToken,
      html: documentHtml(
        [
          `Rechnung Nr. ${pdfToken}`,
          'Stadtwerke Musterstadt GmbH, Hauptstraße 1, 12345 Musterstadt',
          'Lieferung von 2.000 Litern Heizöl für das Wohnhaus',
          'Rechnungsbetrag: 1.840,00 EUR inklusive 19 % Umsatzsteuer',
          'Zahlbar innerhalb von 14 Tagen ohne Abzug.',
          `Bitte geben Sie bei der Überweisung die Referenz ${pdfToken} an.`,
        ],
        '400 16px/1.6',
      ),
    },
    image: {
      name: `smoke-${runId}-scan.png`,
      token: imageToken,
      word: 'Lieferschein',
      html: documentHtml(
        ['Lieferschein', `Nummer ${imageToken}`, 'Paketdienst'],
        // Large and bold, so OCR reads the image reliably.
        '600 56px/1.4',
      ),
    },
    semanticQuery: 'Was hat die Heizöllieferung für unser Haus gekostet?',
    passkeyName: `Smoke-Test ${runId} ${now.toISOString()}`,
  }
}

/** Black-on-white text lines that Chromium renders into a test file. */
function documentHtml(lines: string[], font: string): string {
  const paragraphs = lines.map((line) => `<p>${line}</p>`).join('')
  return (
    '<!doctype html><html lang="de"><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;background:#fff">' +
    `<main style="padding:48px;font:${font} Arial,Helvetica,sans-serif;color:#000">` +
    `${paragraphs}</main></body></html>`
  )
}
