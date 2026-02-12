import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { document } from '@/db/schema/documents'
import { WORKER_CONFIG } from '@/worker/config'
import { generateLlmResponse } from '@/worker/clients/ollama'
import { updateStep } from '@/worker/pipeline/job-lifecycle'
import { applyFolderSuggestion } from '@/worker/services/folder-service'
import { loadExistingMetadata } from '@/worker/services/metadata-service'
import { applyTags } from '@/worker/services/tag-service'
import type { LlmAnalysisResult } from '@/worker/types'
import {
  sanitizeFolderSuggestion,
  sanitizeTags,
  sanitizeTitle,
} from '@/worker/utils/text'

async function analyzeLlm(
  textContent: string,
  existingTags: { id: string; name: string }[],
  existingFolders: { id: string; name: string }[],
): Promise<LlmAnalysisResult> {
  const empty: LlmAnalysisResult = {
    title: null,
    tags: [],
    folderSuggestion: null,
  }
  const truncatedText = textContent.substring(0, WORKER_CONFIG.llmTextLimit)

  const tagList =
    existingTags.length > 0
      ? existingTags.map((t) => t.name).join(', ')
      : '(keine vorhanden)'
  const folderList =
    existingFolders.length > 0
      ? existingFolders.map((f) => f.name).join(', ')
      : '(keine vorhanden)'

  const prompt = `Du bist ein Dokumentenmanagement-Assistent. Analysiere den folgenden Dokumententext und extrahiere strukturierte Metadaten.

Aufgaben:
1. Erstelle einen kurzen, prägnanten deutschen Titel (maximal 10 Wörter), der den Inhalt treffend beschreibt.
2. Wähle bis zu 5 passende Tags aus der folgenden Liste. Verwende ausschließlich vorhandene Tags, es sei denn, keiner passt — nur dann darfst du einen neuen Tag-Namen vorschlagen.
3. Schlage einen passenden vorhandenen Ordner vor, in den das Dokument einsortiert werden könnte. Falls kein Ordner passt, setze null.

Vorhandene Tags: ${tagList}
Vorhandene Ordner: ${folderList}

Antworte ausschließlich mit validem JSON in diesem Format:
{"title": "Der generierte Titel", "tags": ["Tag1", "Tag2"], "folderSuggestion": "Ordnername" oder null}

Dokumententext:
${truncatedText}`

  try {
    const responseText = await generateLlmResponse(prompt)

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(responseText)
    } catch {
      console.warn('LLM-Analyse: Antwort ist kein valides JSON')
      return empty
    }

    return {
      title: sanitizeTitle(parsed.title),
      tags: sanitizeTags(parsed.tags),
      folderSuggestion: sanitizeFolderSuggestion(parsed.folderSuggestion),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`LLM-Analyse fehlgeschlagen: ${message}`)
    return empty
  }
}

export async function runLlmAnalysis(
  doc: { id: string; folderId: string | null },
  textContent: string,
  jobId: string,
) {
  await updateStep(jobId, doc.id, 'llm_analysis')

  const { existingTags, existingFolders } = await loadExistingMetadata()
  const analysis = await analyzeLlm(textContent, existingTags, existingFolders)

  if (analysis.title) {
    await db
      .update(document)
      .set({ name: analysis.title })
      .where(eq(document.id, doc.id))
    console.log(`Titel generiert für Dokument ${doc.id}: "${analysis.title}"`)
  }

  if (analysis.tags.length > 0) {
    await applyTags(doc.id, analysis.tags)
  }

  if (analysis.folderSuggestion) {
    await applyFolderSuggestion(doc, analysis.folderSuggestion)
  }
}
