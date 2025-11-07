# Radar Dashboard

> Centralizar visão operacional, lista de tarefas inteligentes e execução modular em um único app rastreável, auditável e extensível.

## Overview

Radar Dashboard is a Progressive Web App (PWA) designed as a **mobile-first, offline-first, LLM-native** operational hub. It combines intelligent task management, modular plugin architecture, span-based execution tracking, and AI-powered automation into a single, traceable application.

## Core Principles

- **Reliable & Responsive Interface** - Fluid, fast, and mobile-optimized
- **Intelligent Task Prioritization** - Dynamic priority based on urgency, deadlines, and inactivity
- **Span-Based Execution** - All actions are traceable via LogLine protocol
- **Progressive LLM Autonomy** - AI assists with classification, summarization, and automation
- **Auditable & Signable** - Complete operation history with cryptographic signatures
- **Plug-and-Play Modules** - Extensible service architecture with semantic context

## Features

### 🎯 Task Management
- Intelligent priority calculation: `priority = weight + (30 - days_to_deadline) + days_inactive`
- Multiple task sources: manual, upload, webhook, LLM, spans, cron, Google Drive
- Multi-user support with task assignment
- Offline-first with IndexedDB persistence
- Real-time sync and NDJSON export

### 🔌 Plugin System
- Service module architecture
- Runtime registration via `import.meta.glob`
- Component-based UI integration
- Lifecycle hooks (`onInit`, `onSpan`)
- Permission-based access control
- Hot-reload support

### 🤖 LLM Integration
- **Providers**: OpenAI, MacMind Gateway, Ollama
- **Modules**:
  - `classify_tasks` - Auto-prioritize and categorize
  - `summarize_state` - Natural language operational summaries
  - `generate_task_from_input` - Convert spans/text to tasks
  - `plan_next_steps` - AI-powered action planning
  - `explain_span` - Human-readable execution explanations
  - `generate_policy` - Natural language → automation rules

### 📊 Execution Tracking
- **Span Protocol** (LogLine)
- Append-only audit trail
- BLAKE3 hashing (SHA-256 fallback)
- Optional DV25Seal signatures
- Full trace context with parent/child relationships

### 🔄 Automation
- Policy-based automation engine
- Natural language policy creation
- Trigger-condition-action model
- Event sources: uploads, webhooks, spans, schedules
- Auditable execution history

### 📁 File Management
- Upload from mobile/desktop/camera/microphone
- Supported formats: PDF, images, video, audio, documents
- IndexedDB local storage
- Task-linked attachments
- Metadata indexing
- Automatic sync when online

### 🔐 Authentication
- **OAuth2 Providers**: Google, GitHub, Telegram
- JWT or HTTP-only cookie sessions
- LogLine ID identity
- Multi-user with Row-Level Security (RLS)
- Session-on-login span tracking

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Vite
- **State Management**: Pinia with persistence
- **Offline Storage**: IndexedDB (via idb)
- **Routing**: Vue Router
- **PWA**: Vite PWA Plugin + Workbox
- **Styling**: CSS Custom Properties with Dark Mode
- **Date Utils**: date-fns
- **Deployment**: Vercel

## Project Structure

```
/dashboard
├── src/
│   ├── main.ts                 # App entry point
│   ├── App.vue                 # Root component
│   ├── style.css               # Global styles & dark mode
│   ├── router/
│   │   └── index.ts            # Route configuration
│   ├── stores/
│   │   ├── auth.ts             # Authentication state
│   │   ├── tasks.ts            # Task management
│   │   ├── plugins.ts          # Plugin registry
│   │   ├── llm.ts              # LLM integration
│   │   └── dashboard.ts        # Dashboard state & focus
│   ├── views/
│   │   ├── Login.vue           # OAuth login
│   │   ├── Dashboard.vue       # Main dashboard
│   │   ├── Tasks.vue           # Task list view
│   │   ├── Timeline.vue        # Activity timeline
│   │   ├── Plugins.vue         # Plugin management
│   │   └── Settings.vue        # App configuration
│   ├── services/
│   │   └── example/            # Example plugin module
│   │       ├── index.ts        # Plugin registration
│   │       ├── config.ts       # Plugin config
│   │       └── component.vue   # Plugin UI
│   ├── utils/
│   │   ├── db.ts               # IndexedDB operations
│   │   ├── span.ts             # Span tracking utilities
│   │   └── task.ts             # Task priority & filters
│   └── types/
│       └── index.ts            # TypeScript definitions
├── public/
│   ├── icon-192x192.png        # PWA icon (192x192)
│   └── icon-512x512.png        # PWA icon (512x512)
├── index.html                  # HTML entry
├── vite.config.ts              # Vite + PWA config
├── tsconfig.json               # TypeScript config
├── vercel.json                 # Vercel deployment
└── package.json                # Dependencies
```

## Quick Start

### Prerequisites
- Node.js 18+ and npm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Development

The app will be available at `http://localhost:5173`

Default login uses simulated OAuth. In production, configure actual OAuth providers.

### Environment Variables

Create `.env` file for production:

```env
VITE_OPENAI_API_KEY=your-openai-key
VITE_API_BASE_URL=https://your-api.com
```

## Creating Plugins

Plugins follow the **Service Module** pattern:

```typescript
// src/services/my-plugin/index.ts
import type { ServiceModule } from '@/types'
import MyComponent from './component.vue'

const myPlugin: ServiceModule = {
  metadata: {
    id: 'my-plugin',
    title: 'My Plugin',
    description: 'Plugin description',
    icon: '🎯',
    route: '/plugins/my-plugin',
    permissions: ['view', 'edit'],
    enabled: true
  },
  component: MyComponent,
  config: {},
  async onInit() {
    // Initialize plugin
  },
  async onSpan(span) {
    // React to spans
  }
}

export default myPlugin
```

Plugins are automatically registered via `import.meta.glob` in the plugin store.

## Task Priority Formula

```
priority = weight + (30 - days_to_deadline) + days_inactive
```

- **weight**: Manual priority boost (0-100)
- **days_to_deadline**: Days until deadline (capped at 30)
- **days_inactive**: Days since last update

Result is clamped to 0-100.

## Span Protocol

Every significant action creates a **Span**:

```typescript
import { createSpan } from '@/utils/span'

const span = createSpan({
  name: 'operation.name',
  attributes: { key: 'value' }
})

span.addEvent('checkpoint', { data: 'info' })
await span.end('ok') // or 'error'
```

Spans are:
- Automatically hashed (BLAKE3/SHA-256)
- Stored in IndexedDB
- Linked to user identity
- Exportable as NDJSON

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

The `vercel.json` is pre-configured for SPA routing and PWA support.

### Other Platforms

Build and serve the `dist` folder:

```bash
npm run build
# Serve dist/ with any static host
```

## PWA Features

- **Offline Mode**: Full app functionality offline
- **Installable**: Add to home screen
- **Service Worker**: Auto-generated via Vite PWA
- **Caching**: Runtime caching for API calls
- **Updates**: Auto-update on new versions

## Security

- **RLS**: Row-Level Security for multi-tenancy
- **Span Signatures**: Optional DV25Seal signing
- **Append-Only**: Immutable span history
- **HTTPS Only**: Enforced in production
- **XSS Protection**: Content Security headers

## LLM Configuration

Configure in Settings:

1. **Provider**: OpenAI, MacMind, or Ollama
2. **Model**: e.g., `gpt-4`, `claude-3-opus`
3. **API Key**: Your provider key
4. **Endpoint** (optional): Custom API endpoint

## Data Export

Export tasks and spans as **NDJSON**:

```typescript
import { exportTasksAsNDJSON } from '@/utils/task'
const ndjson = exportTasksAsNDJSON(tasks)
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile: iOS Safari 14+, Chrome Android 90+

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Commit changes: `git commit -am 'Add feature'`
3. Push: `git push origin feature/my-feature`
4. Create a Pull Request

## Roadmap

- [ ] Full OAuth2 integration (Google, GitHub, Telegram)
- [ ] Real LLM API integrations
- [ ] Timeline visualization
- [ ] Advanced policy editor
- [ ] Webhook receivers
- [ ] Email/Telegram/Calendar sensors
- [ ] GitHub integration
- [ ] Google Drive sync
- [ ] Mobile native apps (Capacitor)
- [ ] Real-time collaboration
- [ ] BLAKE3 hashing (replace SHA-256)
- [ ] DV25Seal signature implementation

## License

MIT

## Support

For issues and questions:
- Open an issue on GitHub
- Check the `/docs` folder for detailed guides

---

**Built with ❤️ for autonomous, traceable operations**
