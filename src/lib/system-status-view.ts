import { formatDateTime } from './format'
import {
  WORKER_HEARTBEAT_TTL_SECONDS,
  type ModelAvailability,
  type OllamaCheck,
  type ServiceCheck,
  type SystemStatus,
  type WorkerStatus,
} from './system-status'

export type CardState = 'ok' | 'warning' | 'error' | 'unknown'

/** Everything one status card renders. */
export interface ServiceCard {
  key: string
  title: string
  state: CardState
  label: string
  details: string[]
}

function workerDetails(worker: WorkerStatus): string[] {
  return [
    `Zuletzt gesehen: ${formatDateTime(worker.lastSeen)}`,
    `Host: ${worker.hostname} (PID ${worker.pid})`,
    `Parallele Aufträge: ${worker.concurrency}`,
    `Gestartet: ${formatDateTime(worker.startedAt)}`,
    `Version: ${worker.version}`,
  ]
}

function workerCard(worker: WorkerStatus): ServiceCard {
  const base = { key: 'worker', title: 'Worker' }
  if (worker.status === 'ok')
    return {
      ...base,
      state: 'ok',
      label: 'Aktiv',
      details: workerDetails(worker),
    }
  if (worker.status === 'down')
    return {
      ...base,
      state: 'error',
      label: 'Nicht aktiv',
      details: [
        `Kein Lebenszeichen in den letzten ${WORKER_HEARTBEAT_TTL_SECONDS} Sekunden. Dokumente werden nicht verarbeitet, bis der Worker („bun run worker“) läuft.`,
      ],
    }
  return {
    ...base,
    state: 'unknown',
    label: 'Unbekannt',
    details: ['Ohne Redis lässt sich der Worker-Status nicht ermitteln.'],
  }
}

function checkCard(
  key: string,
  title: string,
  check: ServiceCheck,
): ServiceCard {
  return check.status === 'ok'
    ? {
        key,
        title,
        state: 'ok',
        label: 'Erreichbar',
        details: [`Antwortzeit: ${check.latencyMs} ms`],
      }
    : {
        key,
        title,
        state: 'error',
        label: 'Gestört',
        details: [check.error ?? 'Nicht erreichbar'],
      }
}

function modelLine(label: string, model: ModelAvailability): string {
  if (model.available === null) return `${label}: ${model.name}`
  const state = model.available ? 'installiert' : 'nicht installiert'
  return `${label}: ${model.name} (${state})`
}

function ollamaCard(ollama: OllamaCheck): ServiceCard {
  const card = checkCard('ollama', 'Ollama', ollama)
  const { embed, llm } = ollama.models
  card.details.push(
    modelLine('Einbettungsmodell', embed),
    modelLine('Sprachmodell', llm),
  )
  if (embed.available === false || llm.available === false) {
    card.state = 'warning'
    card.label = 'Modell fehlt'
  }
  return card
}

/** The cards of the system page, worker first. */
export function serviceCards(status: SystemStatus): ServiceCard[] {
  const { database, redis, ocr, ollama } = status.services
  return [
    workerCard(status.worker),
    checkCard('database', 'Datenbank', database),
    checkCard('redis', 'Redis', redis),
    checkCard('ocr', 'OCR-Dienst', ocr),
    ollamaCard(ollama),
  ]
}
