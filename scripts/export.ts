#!/usr/bin/env bun
import { databaseExportSource, libraryDocumentIds } from '@/db/document-export'
import { runDbCli } from '@/lib/server/db-cli'
import { parseExportArgs, writeExportFile } from '@/lib/server/export-cli'
import { STORAGE_CONFIG } from '@/lib/server/storage-config'

// Exports the library as a ZIP (files in their folder structure plus
// metadata.json/metadata.csv). Unlike the web export it has no size limit.
async function main(): Promise<number> {
  const options = parseExportArgs(process.argv.slice(2), new Date())
  const source = await databaseExportSource(await libraryDocumentIds(options))
  const count = await writeExportFile(
    options.out,
    source,
    STORAGE_CONFIG.uploadDir,
  )
  console.log(`${count} Dokument(e) exportiert nach ${options.out}`)
  return 0
}

await runDbCli(main, 'Export fehlgeschlagen:', 1)
