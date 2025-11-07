# Admin Dashboard - Task System Documentation

## Overview

The Task System is a comprehensive, sensor-driven task management solution built on the **sensor → span → task** abstraction. It provides automated task creation, urgency-based prioritization, offline support, and LLM-powered intelligence.

## Architecture

```
┌─────────────┐
│   Sensors   │  (Gmail, GitHub, Calendar, Webhooks)
└──────┬──────┘
       │ emit
       ▼
┌─────────────┐
│    Spans    │  (LogLine protocol with metadata)
└──────┬──────┘
       │ transform via TaskSensor
       ▼
┌─────────────┐
│    Tasks    │  (With urgency, priority, metadata)
└──────┬──────┘
       │ compute urgency
       ▼
┌─────────────┐
│  TaskPanel  │  (Sidebar UI sorted by urgency)
└─────────────┘
```

## Key Components

### 1. Type Definitions (`src/types/index.ts`)

Enhanced `Task` interface with new fields:
- `userId`: Required user ownership
- `source`: Sensor ID that created the task
- `urgency`: 0-100 score computed by policy
- `dueDate`: Alias for deadline
- `resolved`: Quick completion check
- `critical`: Emergency flag (🔥/error tags)

New types:
- `UrgencyRule`: Condition-based urgency rules
- `UrgencyPolicyResult`: Urgency calculation result
- `TaskFromSpanConfig`: Span transformation config

### 2. Urgency Policy (`src/utils/urgencyPolicy.ts`)

**Rules (in priority order):**
1. `critical == true` → urgency 100
2. `dueDate expired` → urgency 95
3. `dueDate < 1h` → urgency 90
4. `dueDate < 6h` → urgency 80
5. `dueDate < 24h` → urgency 70
6. `dueDate < 48h` → urgency 50
7. `createdAt > 7d && !persistent` → urgency 20
8. Default → urgency 40

**Functions:**
- `computeUrgency(task)`: Calculate urgency for a single task
- `recalculateUrgencies(tasks)`: Batch recalculation
- `sortByUrgency(tasks)`: Sort tasks by urgency
- `getUrgentTasks(tasks, threshold)`: Filter by urgency threshold
- `getUrgencyLevel(urgency)`: Get label (CRITICAL, HIGH, MEDIUM, LOW)
- `getUrgencyColor(urgency)`: Get color for UI

### 3. Task From Span Transformer (`src/utils/taskFromSpan.ts`)

**Extraction Logic:**
- **Title**: Inferred from `span.message`, `span.attributes.title`, or `span.name`
- **Critical Detection**: Tags with 🔥/error/critical/urgent or `span.status === 'error'`
- **Due Date**: Extracted from `span.attributes.deadline`, `calendar_event`, etc.
- **Tags**: Extracted from span attributes, events, and inferred from kind/status
- **Description**: From span attributes or events summary
- **Origin**: Determined from span.attributes.source

**Functions:**
- `taskFromSpan(span, config)`: Convert span to task
- `batchTaskFromSpan(spans, config)`: Batch conversion
- `shouldCreateTask(span)`: Check if span should generate task
- `updateTaskFromSpan(task, span)`: Update existing task from new span

### 4. Task Sensor (`src/sensors/taskSensor.ts`)

Watches for spans and automatically creates tasks.

**Configuration:**
```typescript
{
  enabled: boolean
  autoCreateTasks: boolean
  autoUpdateUrgency: boolean
  deduplicationWindow: number // minutes
  minUrgencyForNotification: number
  notifyOnCritical: boolean
}
```

**Features:**
- Automatic span → task transformation
- Deduplication (5-minute window)
- Browser notifications for critical tasks
- Periodic urgency recalculation
- Span tracking and status reporting

**Methods:**
- `processSpan(span, taskStore)`: Process single span
- `processSpans(spans, taskStore)`: Batch processing
- `recalculateAllUrgencies(taskStore)`: Recalculate all
- `updateTaskFromNewSpan(taskId, span, taskStore)`: Update from span

### 5. Enhanced Task Store (`src/stores/tasks.ts`)

**New Computed Properties:**
- `tasksSortedByUrgency`: Tasks sorted by urgency (descending)
- `criticalTasks`: Tasks with `critical === true && !resolved`

**New Actions:**
- `addTask(task)`: Add a pre-formed task (from sensor)
- `resolveTask(id)`: Mark as resolved and done
- `getUserTasks(userId)`: Filter tasks by user
- `getSortedByUrgency(userId?)`: Get tasks sorted by urgency
- `autoReorder()`: Recalculate urgencies for all tasks
- `getTasksBySource(source)`: Filter by sensor ID

**Updated Behavior:**
- `createTask()`: Now includes `userId`, `urgency`, `resolved`, `critical`
- `updateTask()`: Auto-recalculates urgency when relevant fields change

### 6. Task Panel UI (`src/components/TaskPanel.vue`)

**Features:**
- Fixed right sidebar (360px wide, collapsible)
- Tasks sorted by urgency
- Real-time stats (critical, high urgency, total)
- Filters: All, Critical, High, Medium, By Sensor
- Search and sort capabilities
- Visual urgency indicators (colored bars and borders)
- Quick actions: Resolve, View Span, Open Source
- Auto-refresh every 5 minutes

**UI Elements:**
- Urgency bar (colored, width = urgency %)
- Critical badge (🔥 with pulse animation)
- Due date display (human-readable, e.g., "in 2 hours")
- Tags (max 3 visible)
- Source indicator (sensor ID)

**Urgency Classes:**
- `urgency-critical`: Red border (>= 90)
- `urgency-high`: Orange border (>= 70)
- `urgency-medium`: Amber border (>= 50)
- `urgency-low`: Blue border (>= 30)
- `urgency-minimal`: Gray border (< 30)

### 7. LLM Agents (`src/llm/task_agents.ts`)

**Agents:**

1. **task-summarizer**: Generate task from span
   - Input: Span
   - Output: `{ title, tags, suggestedUrgency }`

2. **urgency-analyzer**: Analyze task urgency
   - Input: Task
   - Output: `{ urgencyScore, reasoning, critical }`

3. **task-editor**: Refine task with feedback
   - Input: Task + feedback
   - Output: `{ title, updatedUrgency, tags, description }`

**Utility Functions:**
- `batchProcessTasks(tasks)`: Batch urgency analysis
- `categorizeTasks(tasks)`: Smart categorization with insights
- `generateTaskRecommendations(tasks, userContext)`: Task recommendations

### 8. Example Sensors

#### Gmail Sensor (`src/sensors/gmailSensor.ts`)

Monitors Gmail inbox for important emails.

**Filters:**
- Only starred
- Only important
- From specific senders
- Keywords (urgent, asap, deadline, etc.)

**Creates tasks for:**
- Important/starred emails
- Emails with deadlines in subject/body
- Emails with urgent keywords

#### GitHub Sensor (`src/sensors/githubSensor.ts`)

Monitors GitHub issues and PRs.

**Filters:**
- Assigned to me
- Mentions me
- Review requests
- Specific labels
- Open/closed states

**Creates tasks for:**
- Assigned issues
- PR review requests
- Issues with deadlines (from milestones or body)
- Issues with urgent/critical labels

#### Calendar Sensor (`src/sensors/calendarSensor.ts`)

Monitors calendar events.

**Filters:**
- Look-ahead window (default: 7 days)
- Only with reminders
- Only with action items
- Specific calendars
- Keywords (deadline, review, submit, deliver)

**Urgency Thresholds:**
- Immediate: < 15 min before event
- Soon: < 1 hour
- Upcoming: < 24 hours

**Creates tasks for:**
- Upcoming meetings with action items
- Events with deadlines
- Events with reminders

### 9. Offline Support (`src/utils/syncManager.ts`)

**Features:**
- Queue operations when offline
- Auto-sync when back online
- Retry failed operations (max 3 attempts)
- Persistent queue (localStorage)
- Online/offline detection
- Visibility-based sync (when tab becomes active)

**Operation Types:**
- `create`, `update`, `delete`, `resolve`
- For entities: `task`, `span`

**Status:**
- `pending`: Waiting to sync
- `syncing`: Currently syncing
- `synced`: Successfully synced
- `failed`: Failed after max retries

**Methods:**
- `queueOperation(op)`: Add to queue
- `syncNow()`: Sync immediately
- `retryFailedOperations()`: Retry all failed
- `clearFailedOperations()`: Remove failed
- `getStatus()`: Get sync status

## Integration

### App Initialization (`src/App.vue`)

```typescript
onMounted(async () => {
  // ... existing initialization ...

  // Initialize Task Sensor
  const taskSensor = initTaskSensor({
    enabled: true,
    autoCreateTasks: true,
    autoUpdateUrgency: true,
    notifyOnCritical: true
  })

  // Initialize Sync Manager
  await initSyncManager({
    autoSync: true,
    syncIntervalSeconds: 30
  })

  // Auto-recalculate urgencies every 5 minutes
  setInterval(async () => {
    await taskStore.autoReorder()
  }, 5 * 60 * 1000)
})
```

### Dashboard Integration (`src/views/Dashboard.vue`)

```vue
<template>
  <div class="dashboard">
    <!-- ... existing content ... -->

    <!-- New Task Panel -->
    <TaskPanel />
  </div>
</template>

<script setup>
import TaskPanel from '@/components/TaskPanel.vue'
</script>
```

## Usage Examples

### Create Task from Span

```typescript
import { taskFromSpan } from '@/utils/taskFromSpan'
import { getTaskSensor } from '@/sensors/taskSensor'

// Manual conversion
const task = taskFromSpan(span, {
  inferTitle: true,
  detectCritical: true,
  extractDueDate: true,
  preserveTrace: true
})

// Automatic via Task Sensor
const taskSensor = getTaskSensor()
await taskSensor.processSpan(span, taskStore)
```

### Use LLM Agents

```typescript
import { taskSummarizerAgent, urgencyAnalyzerAgent } from '@/llm/task_agents'

// Generate task from span
const result = await taskSummarizerAgent(span)
// { title: "Fix login bug", tags: ["bug", "urgent"], suggestedUrgency: 85 }

// Analyze urgency
const analysis = await urgencyAnalyzerAgent(task)
// { urgencyScore: 90, reasoning: "...", critical: true }
```

### Query Tasks by Urgency

```typescript
import { useTaskStore } from '@/stores/tasks'

const taskStore = useTaskStore()

// Get sorted by urgency
const sortedTasks = taskStore.tasksSortedByUrgency

// Get critical tasks
const critical = taskStore.criticalTasks

// Get user's tasks sorted by urgency
const myTasks = taskStore.getSortedByUrgency(userId)

// Recalculate urgencies
await taskStore.autoReorder()
```

### Start Sensors

```typescript
import { createGmailSensor } from '@/sensors/gmailSensor'
import { createGitHubSensor } from '@/sensors/githubSensor'
import { createCalendarSensor } from '@/sensors/calendarSensor'

// Gmail
const gmailSensor = await createGmailSensor({
  enabled: true,
  filters: {
    onlyImportant: true,
    keywords: ['urgent', 'deadline']
  }
}, userId)

// GitHub
const githubSensor = await createGitHubSensor({
  enabled: true,
  accessToken: 'ghp_...',
  repositories: ['owner/repo'],
  filters: {
    assignedToMe: true,
    reviewRequests: true
  }
}, userId)

// Calendar
const calendarSensor = await createCalendarSensor({
  enabled: true,
  lookAheadDays: 7,
  filters: {
    onlyWithActionItems: true
  }
}, userId)
```

## Data Flow

1. **Sensor** emits a span (e.g., new email, GitHub issue, calendar event)
2. **Span** is stored in IndexedDB with metadata
3. **Task Sensor** watches for new spans via `shouldCreateTask()`
4. **taskFromSpan()** transforms span into task with:
   - Inferred title
   - Detected critical flag
   - Extracted due date
   - Computed urgency (via `computeUrgency()`)
5. **Task** is added to `taskStore` via `addTask()`
6. **TaskPanel** displays tasks sorted by urgency
7. **Auto-reorder** runs every 5 minutes to update urgencies
8. **Sync Manager** queues operations when offline, syncs when online

## Security & Scoping

- **User Scoping**: All tasks have `userId` field
- **Trace Isolation**: All tasks have `traceId` from span
- **Source Tracking**: `source` field identifies sensor/origin
- **Audit Trail**: All operations create spans for traceability
- **Offline Safety**: Operations queued and retried on sync

## Observability

- Every task creation → span with `task_created` event
- Every urgency recalculation → span with `urgencies_recalculated` event
- Every sensor fetch → span with `emails_fetched`, `issues_fetched`, etc.
- All spans stored in IndexedDB with hash and signature

## Extensibility

### Add New Sensor

1. Create sensor file in `src/sensors/`
2. Implement sensor class with `start()`, `stop()`, `fetchData()`
3. Emit spans with appropriate metadata:
   - `sensorId`: Unique sensor ID
   - `source`: Sensor type
   - `createTask: true`: To trigger task creation
   - `deadline`: If applicable
   - `critical`: If urgent
4. Task Sensor will automatically process spans

Example:
```typescript
const span = new SpanBuilder()
  .setName('slack.message_received')
  .setUserId(userId)
  .setAttributes({
    sensorId: 'slack_sensor',
    source: 'slack',
    createTask: true,
    message: 'Important message',
    from: 'user@example.com',
    critical: true,
    tags: ['slack', 'urgent']
  })
  .build()
```

### Add Custom Urgency Rule

Edit `src/utils/urgencyPolicy.ts`:

```typescript
export const urgencyRules: UrgencyRule[] = [
  // ... existing rules ...
  {
    condition: (task) => task.tags.includes('blocker'),
    urgency: 95,
    description: 'Task is marked as blocker'
  }
]
```

## Performance Considerations

- **Deduplication**: Task Sensor uses 5-minute window to avoid duplicates
- **Batch Operations**: `batchTaskFromSpan()` for multiple spans
- **Lazy Loading**: TaskPanel shows filtered/limited tasks
- **Auto-refresh**: Every 5 minutes (configurable)
- **IndexedDB**: All data persisted locally, no blocking API calls

## Future Enhancements

- [ ] Real-time WebSocket support for instant updates
- [ ] Task dependencies and blocking relationships
- [ ] Multi-user collaboration with real-time sync
- [ ] Advanced NLP for deadline extraction
- [ ] Custom urgency formulas per user
- [ ] Task templates and automation rules
- [ ] Integration with external task systems (Jira, Asana, etc.)
- [ ] Analytics dashboard for task metrics
- [ ] Mobile app with push notifications
- [ ] Voice input for task creation

## Troubleshooting

### Tasks not appearing in TaskPanel

1. Check if Task Sensor is enabled: `taskSensor.getStatus()`
2. Verify spans are being created with `createTask: true` attribute
3. Check browser console for errors
4. Verify user is authenticated: `authStore.isAuthenticated`

### Urgency not updating

1. Manually trigger recalculation: `taskStore.autoReorder()`
2. Check if task has valid deadline/dueDate
3. Verify urgency policy rules match task conditions
4. Check if task is marked as `resolved` (urgency = 0)

### Offline sync not working

1. Check sync status: `syncManager.getStatus()`
2. Verify network connectivity
3. Check localStorage for queued operations
4. Force retry: `syncManager.retryFailedOperations()`

## License

MIT

---

**Built with**: Vue 3, TypeScript, Pinia, IndexedDB, PWA
**Architecture**: Sensor → Span → Task abstraction
**Protocol**: LogLine protocol with DV25Seal signatures
