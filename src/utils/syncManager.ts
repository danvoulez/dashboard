/**
 * Sync Manager
 *
 * Handles offline storage and sync for tasks:
 * - Queue operations when offline
 * - Sync when back online
 * - Conflict resolution
 * - Retry failed operations
 */

import type { Task } from '@/types'
import { db } from './db'
import { createSpan } from './span'

export interface SyncOperation {
  id: string
  type: 'create' | 'update' | 'delete' | 'resolve'
  entity: 'task' | 'span'
  data: any
  timestamp: string
  retryCount: number
  status: 'pending' | 'syncing' | 'synced' | 'failed'
  error?: string
}

export interface SyncConfig {
  autoSync: boolean
  syncIntervalSeconds: number
  maxRetries: number
  retryDelayMs: number
}

const DEFAULT_CONFIG: SyncConfig = {
  autoSync: true,
  syncIntervalSeconds: 30,
  maxRetries: 3,
  retryDelayMs: 2000
}

export class SyncManager {
  private config: SyncConfig
  private syncQueue: SyncOperation[] = []
  private syncInterval: number | null = null
  private isSyncing = false
  private isOnline = navigator.onLine

  constructor(config: Partial<SyncConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.setupEventListeners()
  }

  /**
   * Setup online/offline event listeners
   */
  private setupEventListeners(): void {
    window.addEventListener('online', () => {
      console.log('[SyncManager] Network online')
      this.isOnline = true
      this.syncNow()
    })

    window.addEventListener('offline', () => {
      console.log('[SyncManager] Network offline')
      this.isOnline = false
    })

    // Listen for visibility change to sync when tab becomes active
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        this.syncNow()
      }
    })
  }

  /**
   * Start auto-sync
   */
  start(): void {
    if (this.config.autoSync && !this.syncInterval) {
      this.syncInterval = window.setInterval(
        () => this.syncNow(),
        this.config.syncIntervalSeconds * 1000
      )
      console.log('[SyncManager] Auto-sync started')
    }
  }

  /**
   * Stop auto-sync
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
      console.log('[SyncManager] Auto-sync stopped')
    }
  }

  /**
   * Queue an operation for sync
   */
  async queueOperation(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount' | 'status'>): Promise<void> {
    const syncOp: SyncOperation = {
      ...operation,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      retryCount: 0,
      status: 'pending'
    }

    this.syncQueue.push(syncOp)

    // Persist queue to IndexedDB
    await this.persistQueue()

    console.log(`[SyncManager] Queued ${operation.type} operation for ${operation.entity}`)

    // Try to sync immediately if online
    if (this.isOnline) {
      await this.syncNow()
    }
  }

  /**
   * Sync all pending operations
   */
  async syncNow(): Promise<void> {
    if (!this.isOnline || this.isSyncing || this.syncQueue.length === 0) {
      return
    }

    this.isSyncing = true
    const span = createSpan({
      name: 'sync_manager.sync',
      attributes: { queueSize: this.syncQueue.length }
    })

    try {
      console.log(`[SyncManager] Syncing ${this.syncQueue.length} operations...`)

      const operations = [...this.syncQueue]
      let synced = 0
      let failed = 0

      for (const op of operations) {
        if (op.status === 'synced') {
          continue
        }

        try {
          await this.syncOperation(op)
          op.status = 'synced'
          synced++

          // Remove from queue
          this.syncQueue = this.syncQueue.filter(o => o.id !== op.id)
        } catch (error) {
          op.retryCount++
          op.error = error instanceof Error ? error.message : String(error)

          if (op.retryCount >= this.config.maxRetries) {
            op.status = 'failed'
            failed++
            console.error(`[SyncManager] Operation ${op.id} failed after ${op.retryCount} retries`)
          } else {
            op.status = 'pending'
            console.warn(`[SyncManager] Operation ${op.id} failed, will retry (${op.retryCount}/${this.config.maxRetries})`)
          }
        }
      }

      await this.persistQueue()

      span.addEvent('sync_completed', {
        synced,
        failed,
        remaining: this.syncQueue.length
      })

      span.setStatus('ok')
      console.log(`[SyncManager] Sync completed: ${synced} synced, ${failed} failed, ${this.syncQueue.length} remaining`)
    } catch (error) {
      span.setStatus('error')
      span.addEvent('sync_error', {
        error: error instanceof Error ? error.message : String(error)
      })
      console.error('[SyncManager] Sync error:', error)
    } finally {
      this.isSyncing = false
      await span.end()
    }
  }

  /**
   * Sync a single operation
   */
  private async syncOperation(op: SyncOperation): Promise<void> {
    op.status = 'syncing'

    // TODO: Implement actual API calls to backend
    // For now, just simulate sync delay
    await new Promise(resolve => setTimeout(resolve, 100))

    // Simulate success/failure (90% success rate)
    if (Math.random() < 0.9) {
      console.log(`[SyncManager] Synced operation ${op.id} (${op.type} ${op.entity})`)
    } else {
      throw new Error('Simulated sync failure')
    }
  }

  /**
   * Persist queue to IndexedDB
   */
  private async persistQueue(): Promise<void> {
    try {
      localStorage.setItem('syncQueue', JSON.stringify(this.syncQueue))
    } catch (error) {
      console.error('[SyncManager] Error persisting queue:', error)
    }
  }

  /**
   * Load queue from IndexedDB
   */
  async loadQueue(): Promise<void> {
    try {
      const stored = localStorage.getItem('syncQueue')
      if (stored) {
        this.syncQueue = JSON.parse(stored)
        console.log(`[SyncManager] Loaded ${this.syncQueue.length} operations from storage`)
      }
    } catch (error) {
      console.error('[SyncManager] Error loading queue:', error)
    }
  }

  /**
   * Clear failed operations
   */
  async clearFailedOperations(): Promise<void> {
    this.syncQueue = this.syncQueue.filter(op => op.status !== 'failed')
    await this.persistQueue()
    console.log('[SyncManager] Cleared failed operations')
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      queueSize: this.syncQueue.length,
      pending: this.syncQueue.filter(op => op.status === 'pending').length,
      syncing: this.syncQueue.filter(op => op.status === 'syncing').length,
      failed: this.syncQueue.filter(op => op.status === 'failed').length,
      operations: this.syncQueue
    }
  }

  /**
   * Force retry all failed operations
   */
  async retryFailedOperations(): Promise<void> {
    const failedOps = this.syncQueue.filter(op => op.status === 'failed')
    failedOps.forEach(op => {
      op.status = 'pending'
      op.retryCount = 0
      op.error = undefined
    })

    await this.persistQueue()
    console.log(`[SyncManager] Reset ${failedOps.length} failed operations for retry`)

    if (this.isOnline) {
      await this.syncNow()
    }
  }
}

/**
 * Global sync manager instance
 */
let syncManager: SyncManager | null = null

/**
 * Initialize sync manager
 */
export async function initSyncManager(config?: Partial<SyncConfig>): Promise<SyncManager> {
  if (syncManager) {
    syncManager.stop()
  }

  syncManager = new SyncManager(config)
  await syncManager.loadQueue()
  syncManager.start()

  console.log('[SyncManager] Initialized')

  return syncManager
}

/**
 * Get sync manager instance
 */
export function getSyncManager(): SyncManager {
  if (!syncManager) {
    throw new Error('SyncManager not initialized. Call initSyncManager() first.')
  }
  return syncManager
}

/**
 * Queue a task operation for sync
 */
export async function queueTaskOperation(
  type: 'create' | 'update' | 'delete' | 'resolve',
  task: Task
): Promise<void> {
  const manager = getSyncManager()
  await manager.queueOperation({
    type,
    entity: 'task',
    data: task
  })
}

/**
 * Check if app is online
 */
export function isOnline(): boolean {
  return navigator.onLine
}

/**
 * Wait for online status
 */
export function waitForOnline(): Promise<void> {
  return new Promise((resolve) => {
    if (navigator.onLine) {
      resolve()
    } else {
      const handler = () => {
        window.removeEventListener('online', handler)
        resolve()
      }
      window.addEventListener('online', handler)
    }
  })
}
