import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type { Task, Span, FileStorage, FileMetadata, Policy, TimelineEntry, FocusSession } from '@/types'

interface RadarDB extends DBSchema {
  tasks: {
    key: string
    value: Task
    indexes: { 'by-status': string; 'by-assignedTo': string; 'by-priority': number }
  }
  spans: {
    key: string
    value: Span
    indexes: { 'by-traceId': string; 'by-userId': string }
  }
  files: {
    key: string
    value: FileStorage
  }
  fileMetadata: {
    key: string
    value: FileMetadata
    indexes: { 'by-taskId': string }
  }
  policies: {
    key: string
    value: Policy
    indexes: { 'by-enabled': number }
  }
  timeline: {
    key: string
    value: TimelineEntry
    indexes: { 'by-timestamp': string; 'by-userId': string }
  }
  focusSessions: {
    key: string
    value: FocusSession
    indexes: { 'by-taskId': string }
  }
}

let db: IDBPDatabase<RadarDB> | null = null

export async function initDB(): Promise<IDBPDatabase<RadarDB>> {
  if (db) return db

  db = await openDB<RadarDB>('radar-dashboard', 1, {
    upgrade(db) {
      // Tasks
      const taskStore = db.createObjectStore('tasks', { keyPath: 'id' })
      taskStore.createIndex('by-status', 'status')
      taskStore.createIndex('by-assignedTo', 'assignedTo')
      taskStore.createIndex('by-priority', 'priority')

      // Spans
      const spanStore = db.createObjectStore('spans', { keyPath: 'id' })
      spanStore.createIndex('by-traceId', 'traceId')
      spanStore.createIndex('by-userId', 'userId')

      // Files
      db.createObjectStore('files', { keyPath: 'id' })

      // File Metadata
      const fileMetadataStore = db.createObjectStore('fileMetadata', { keyPath: 'id' })
      fileMetadataStore.createIndex('by-taskId', 'taskId')

      // Policies
      const policyStore = db.createObjectStore('policies', { keyPath: 'id' })
      policyStore.createIndex('by-enabled', 'enabled')

      // Timeline
      const timelineStore = db.createObjectStore('timeline', { keyPath: 'id' })
      timelineStore.createIndex('by-timestamp', 'timestamp')
      timelineStore.createIndex('by-userId', 'userId')

      // Focus Sessions
      const focusStore = db.createObjectStore('focusSessions', { keyPath: 'id' })
      focusStore.createIndex('by-taskId', 'taskId')
    }
  })

  return db
}

export async function getDB(): Promise<IDBPDatabase<RadarDB>> {
  if (!db) {
    return await initDB()
  }
  return db
}

// Task operations
export async function saveTasks(tasks: Task[]): Promise<void> {
  const database = await getDB()
  const tx = database.transaction('tasks', 'readwrite')
  await Promise.all(tasks.map(task => tx.store.put(task)))
  await tx.done
}

export async function getTasks(): Promise<Task[]> {
  const database = await getDB()
  return await database.getAll('tasks')
}

export async function getTasksByStatus(status: string): Promise<Task[]> {
  const database = await getDB()
  return await database.getAllFromIndex('tasks', 'by-status', status)
}

// Span operations
export async function saveSpan(span: Span): Promise<void> {
  const database = await getDB()
  await database.put('spans', span)
}

export async function getSpans(): Promise<Span[]> {
  const database = await getDB()
  return await database.getAll('spans')
}

export async function getSpansByTraceId(traceId: string): Promise<Span[]> {
  const database = await getDB()
  return await database.getAllFromIndex('spans', 'by-traceId', traceId)
}

// File operations
export async function saveFile(id: string, file: Blob, metadata: FileMetadata): Promise<void> {
  const database = await getDB()
  const tx = database.transaction(['files', 'fileMetadata'], 'readwrite')
  await tx.objectStore('files').put({ id, data: file })
  await tx.objectStore('fileMetadata').put(metadata)
  await tx.done
}

export async function getFile(id: string): Promise<FileStorage | undefined> {
  const database = await getDB()
  return await database.get('files', id)
}

export async function getFileMetadata(id: string): Promise<FileMetadata | undefined> {
  const database = await getDB()
  return await database.get('fileMetadata', id)
}

export async function getAllFileMetadata(): Promise<FileMetadata[]> {
  const database = await getDB()
  return await database.getAll('fileMetadata')
}

// Policy operations
export async function savePolicies(policies: Policy[]): Promise<void> {
  const database = await getDB()
  const tx = database.transaction('policies', 'readwrite')
  await Promise.all(policies.map(policy => tx.store.put(policy)))
  await tx.done
}

export async function getPolicies(): Promise<Policy[]> {
  const database = await getDB()
  return await database.getAll('policies')
}

export async function getEnabledPolicies(): Promise<Policy[]> {
  const database = await getDB()
  return await database.getAllFromIndex('policies', 'by-enabled', 1)
}

// Timeline operations
export async function saveTimelineEntry(entry: TimelineEntry): Promise<void> {
  const database = await getDB()
  await database.put('timeline', entry)
}

export async function getTimelineEntries(limit?: number): Promise<TimelineEntry[]> {
  const database = await getDB()
  const entries = await database.getAll('timeline')
  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return limit ? entries.slice(0, limit) : entries
}

// Focus session operations
export async function saveFocusSession(session: FocusSession): Promise<void> {
  const database = await getDB()
  await database.put('focusSessions', session)
}

export async function getFocusSessions(): Promise<FocusSession[]> {
  const database = await getDB()
  return await database.getAll('focusSessions')
}

export async function getActiveFocusSession(): Promise<FocusSession | undefined> {
  const database = await getDB()
  const sessions = await database.getAll('focusSessions')
  return sessions.find(s => !s.endTime)
}
