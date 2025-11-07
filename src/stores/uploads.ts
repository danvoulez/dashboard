import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { FileMetadata } from '@/types'
import { saveFile, getAllFileMetadata, getFileMetadata, getFile } from '@/utils/db'
import { createSpan } from '@/utils/span'
import { useAuthStore } from './auth'
import { useTaskStore } from './tasks'

export type UploadStatus = 'queued' | 'uploading' | 'synced' | 'failed'

export interface Upload extends FileMetadata {
  status: UploadStatus
  progress: number
  error?: string
}

export const useUploadStore = defineStore('uploads', () => {
  const uploads = ref<Upload[]>([])
  const loading = ref(false)

  const queuedUploads = computed(() => uploads.value.filter(u => u.status === 'queued'))
  const syncedUploads = computed(() => uploads.value.filter(u => u.status === 'synced'))
  const failedUploads = computed(() => uploads.value.filter(u => u.status === 'failed'))
  const uploadingCount = computed(() => uploads.value.filter(u => u.status === 'uploading').length)

  async function loadUploads() {
    const span = createSpan({ name: 'uploads.load' })

    try {
      loading.value = true
      const metadata = await getAllFileMetadata()
      uploads.value = metadata.map(m => ({
        ...m,
        status: 'synced' as UploadStatus,
        progress: 100
      }))
      span.setAttribute('uploadCount', uploads.value.length)
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      loading.value = false
    }
  }

  async function uploadFile(
    file: File,
    options: {
      createTask?: boolean
      taskTitle?: string
      tags?: string[]
      metadata?: Record<string, any>
    } = {}
  ): Promise<Upload> {
    const span = createSpan({
      name: 'uploads.uploadFile',
      attributes: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      }
    })

    const authStore = useAuthStore()
    const taskStore = useTaskStore()

    try {
      const uploadId = uuidv4()
      const now = new Date().toISOString()

      // Create upload record
      const upload: Upload = {
        id: uploadId,
        name: file.name,
        type: file.type,
        size: file.size,
        uploadedAt: now,
        uploadedBy: authStore.user?.id || 'anonymous',
        spanId: span.getSpan().id,
        indexed: false,
        metadata: options.metadata || {},
        status: 'queued',
        progress: 0
      }

      uploads.value.push(upload)
      span.addEvent('upload_queued', { uploadId })

      // Update status to uploading
      upload.status = 'uploading'
      upload.progress = 10

      // Save file to IndexedDB
      await saveFile(uploadId, file, upload)
      upload.progress = 80

      // Create task if requested
      if (options.createTask) {
        const taskTitle = options.taskTitle || `Process ${file.name}`
        const task = await taskStore.createTask(taskTitle, {
          description: `File uploaded: ${file.name} (${formatFileSize(file.size)})`,
          tags: options.tags || ['upload'],
          origin: 'upload',
          spanId: span.getSpan().id,
          metadata: {
            fileId: uploadId,
            fileName: file.name,
            fileType: file.type
          }
        })

        upload.taskId = task.id
        span.addEvent('task_created', { taskId: task.id })
      }

      // Mark as synced
      upload.status = 'synced'
      upload.progress = 100
      upload.indexed = true

      span.setAttribute('uploadId', uploadId)
      span.setAttribute('taskCreated', options.createTask || false)
      await span.end('ok')

      return upload
    } catch (error) {
      const upload = uploads.value.find(u => u.spanId === span.getSpan().id)
      if (upload) {
        upload.status = 'failed'
        upload.error = error instanceof Error ? error.message : String(error)
      }

      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function uploadMultipleFiles(
    files: File[],
    options: {
      createTaskPerFile?: boolean
      taskTitlePrefix?: string
      tags?: string[]
      metadata?: Record<string, any>
    } = {}
  ): Promise<Upload[]> {
    const span = createSpan({
      name: 'uploads.uploadMultiple',
      attributes: { fileCount: files.length }
    })

    try {
      const uploadPromises = files.map(file =>
        uploadFile(file, {
          createTask: options.createTaskPerFile,
          taskTitle: options.taskTitlePrefix
            ? `${options.taskTitlePrefix} ${file.name}`
            : undefined,
          tags: options.tags,
          metadata: options.metadata
        })
      )

      const results = await Promise.allSettled(uploadPromises)
      const successful = results.filter(r => r.status === 'fulfilled').length

      span.setAttribute('successCount', successful)
      span.setAttribute('failedCount', files.length - successful)
      await span.end('ok')

      return results
        .filter((r): r is PromiseFulfilledResult<Upload> => r.status === 'fulfilled')
        .map(r => r.value)
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function retryUpload(uploadId: string): Promise<void> {
    const span = createSpan({
      name: 'uploads.retry',
      attributes: { uploadId }
    })

    try {
      const upload = uploads.value.find(u => u.id === uploadId)
      if (!upload) {
        throw new Error(`Upload not found: ${uploadId}`)
      }

      if (upload.status !== 'failed') {
        throw new Error('Only failed uploads can be retried')
      }

      // Get file from IndexedDB
      const fileStorage = await getFile(uploadId)
      if (!fileStorage) {
        throw new Error('File data not found')
      }

      // Reset status
      upload.status = 'uploading'
      upload.progress = 0
      upload.error = undefined

      // Simulate upload process
      upload.progress = 100
      upload.status = 'synced'

      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function deleteUpload(uploadId: string): Promise<void> {
    const span = createSpan({
      name: 'uploads.delete',
      attributes: { uploadId }
    })

    try {
      const index = uploads.value.findIndex(u => u.id === uploadId)
      if (index === -1) {
        throw new Error(`Upload not found: ${uploadId}`)
      }

      uploads.value.splice(index, 1)
      // Note: We're not deleting from IndexedDB to preserve history
      // In production, implement soft delete or archive logic

      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  function getUploadById(id: string): Upload | undefined {
    return uploads.value.find(u => u.id === id)
  }

  function getUploadsByTask(taskId: string): Upload[] {
    return uploads.value.filter(u => u.taskId === taskId)
  }

  return {
    uploads,
    loading,
    queuedUploads,
    syncedUploads,
    failedUploads,
    uploadingCount,
    loadUploads,
    uploadFile,
    uploadMultipleFiles,
    retryUpload,
    deleteUpload,
    getUploadById,
    getUploadsByTask
  }
})

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}
