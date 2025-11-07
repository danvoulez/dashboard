# Radar Dashboard - Core Engine Integration

## 🎯 Visão Geral

Esta sprint implementou os módulos essenciais do core engine do Radar Dashboard, transformando-o de um PWA básico em um sistema operacional completo com IA, automações e rastreamento inteligente.

## 📦 Módulos Implementados

### 1. **Gerenciamento de Uploads** (`src/stores/uploads.ts`)
Sistema completo para upload e sincronização de arquivos com criação automática de tarefas.

**Funcionalidades:**
- Upload de arquivos únicos ou múltiplos
- Rastreamento de status (queued → uploading → synced → failed)
- Criação automática de tarefas baseada em uploads
- Armazenamento offline-first com IndexedDB
- Metadata extraction e tagging

**Uso:**
```typescript
import { useUploadStore } from '@/stores/uploads'

const uploadStore = useUploadStore()

// Upload único com criação de tarefa
await uploadStore.uploadFile(file, {
  createTask: true,
  taskTitle: 'Revisar documento',
  tags: ['jurídico', 'urgente']
})

// Upload múltiplo
await uploadStore.uploadMultipleFiles(files, {
  createTaskPerFile: true,
  tags: ['documentos']
})
```

### 2. **Autenticação OAuth2** (`src/auth/oauth.ts`)
Implementação real de OAuth2 com suporte para Google e GitHub.

**Funcionalidades:**
- OAuth2 com PKCE (Proof Key for Code Exchange)
- Suporte para Google e GitHub
- Gerenciamento de sessão com JWT
- Validação de state para proteção CSRF
- Fallback para login simulado quando OAuth não está configurado

**Configuração:**
1. Configure as credenciais no `.env`:
```bash
VITE_GOOGLE_CLIENT_ID=your-client-id
VITE_GITHUB_CLIENT_ID=your-client-id
```

2. No Google Cloud Console:
   - Crie um projeto OAuth
   - Adicione `http://localhost:5173/auth/callback` como redirect URI

3. No GitHub Developer Settings:
   - Crie um OAuth App
   - Configure o callback URL

**Uso:**
```typescript
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

// Login com Google/GitHub
await authStore.login('google')
await authStore.login('github')

// Logout
await authStore.logout()
```

### 3. **LLM Agent** (`src/llm-agent/`)
Sistema completo de integração com LLMs (OpenAI, Ollama, MacMind).

**Estrutura:**
- `prompts.ts` - Templates de prompts especializados
- `client.ts` - Clientes para diferentes providers
- `index.ts` - Interface high-level

**Funções Disponíveis:**
- `classifyTasks()` - Classificação e priorização automática
- `summarizeState()` - Resumo em linguagem natural
- `generateTaskFromSpan()` - Criação de tarefas a partir de execuções
- `generatePolicyFromPrompt()` - Compilação de políticas em linguagem natural
- `explainSpan()` - Explicação humanizada de spans
- `analyzeUpload()` - Análise de arquivos com sugestões
- `prioritizeTasks()` - Re-priorização holística

**Configuração:**
```bash
# OpenAI
VITE_LLM_PROVIDER=openai
VITE_OPENAI_API_KEY=sk-your-key
VITE_OPENAI_MODEL=gpt-4-turbo-preview

# Ollama (local)
VITE_LLM_PROVIDER=ollama
VITE_OLLAMA_ENDPOINT=http://localhost:11434
VITE_OLLAMA_MODEL=llama2
```

**Uso:**
```typescript
import { createLLMAgent } from '@/llm-agent'
import { useLLMStore } from '@/stores/llm'

const llmStore = useLLMStore()
const agent = createLLMAgent(llmStore.config)

// Classificar tarefas
const enriched = await agent.classifyTasks(tasks)

// Gerar tarefa de span
const taskData = await agent.generateTaskFromSpan(span)

// Criar política de linguagem natural
const policy = await agent.generatePolicyFromPrompt(
  "Quando receber um PDF, criar tarefa de revisão jurídica"
)
```

### 4. **Execution Engine** (`src/execution/`)

#### 4.1 Observer Bot (`observer_bot.ts`)
Bot que monitora spans e dispara ações automaticamente.

**Funcionalidades:**
- Monitoramento contínuo de spans
- Regras configuráveis com patterns
- Ações: criar tarefas, disparar políticas, notificações
- Regras padrão para erros e operações longas

**Uso:**
```typescript
import { getObserverBot } from '@/execution/observer_bot'

const bot = getObserverBot()

// Adicionar regra customizada
bot.addRule({
  id: 'high-priority-uploads',
  name: 'Upload grande → tarefa urgente',
  spanPattern: /upload/,
  condition: (span) => span.attributes.fileSize > 10000000,
  action: 'create_task',
  enabled: true
})

// Iniciar (já inicia automaticamente no App.vue)
bot.start(10000) // Check a cada 10s
```

#### 4.2 Policy Agent (`policy_agent.ts`)
Sistema de automações baseado em eventos com políticas compiláveis.

**Formato de Política:**
```typescript
{
  trigger: "file.uploaded",
  condition: "event.payload.type === 'pdf' && event.payload.size > 1000000",
  action: `
    await createTask({
      title: 'Review ' + event.payload.name,
      tags: ['pdf', 'review'],
      origin: 'webhook'
    })
  `
}
```

**Triggers Disponíveis:**
- `file.uploaded`
- `task.created`
- `task.completed`
- `webhook.received`
- `span.error`
- `focus.started`
- `focus.ended`
- `daily.summary`

**Uso:**
```typescript
import { getPolicyAgent, triggerPolicies } from '@/execution/policy_agent'

const agent = getPolicyAgent()

// Criar política
await agent.createPolicy({
  name: 'Auto-tag PDFs',
  trigger: 'file.uploaded',
  condition: 'event.payload.type === "application/pdf"',
  action: 'log("PDF uploaded: " + event.payload.name)',
  enabled: true,
  createdBy: userId
})

// Disparar manualmente
await triggerPolicies('file.uploaded', { payload: fileData })
```

#### 4.3 Code Runner (`run_code.ts`)
Executor de código JavaScript em contexto sandboxed.

**Funcionalidades:**
- Execução com timeout
- Contexto com acesso a stores
- Funções helper (createTask, updateTask, log)
- Scripts predefinidos (prioritize_tasks, daily_summary, cleanup)
- Validação básica de segurança

**Uso:**
```typescript
import { runCode, runScript } from '@/execution/run_code'

// Executar código customizado
const result = await runCode(`
  const tasks = getTasks()
  const urgent = tasks.filter(t => t.priority > 80)
  log('Urgent tasks: ' + urgent.length)
  return urgent
`, {
  input: { date: new Date() },
  timeout: 10000
})

// Executar script predefinido
const summary = await runScript('daily_summary')
```

### 5. **Webhook Receiver** (`src/sensors/webhook_receiver.ts`)
Sistema para receber webhooks de serviços externos.

**Funcionalidades:**
- Registro de webhooks configuráveis
- Verificação de assinaturas
- Auto-criação de tarefas
- Integração com policy agent
- Suporte para GitHub, Telegram e custom

**Uso:**
```typescript
import { getWebhookReceiver } from '@/sensors/webhook_receiver'

const receiver = getWebhookReceiver()

// Registrar webhook
const id = receiver.registerWebhook({
  id: 'github-issues',
  name: 'GitHub Issues',
  enabled: true,
  autoCreateTask: true,
  policyTrigger: 'webhook.received',
  secret: 'your-webhook-secret'
})

// Processar webhook (normalmente chamado por endpoint HTTP)
const event = await receiver.receiveWebhook(id, payload, headers)
```

### 6. **UI Components**

#### TaskList.vue
Componente de lista de tarefas com:
- Filtros (todas, pendentes, urgentes, concluídas)
- Indicadores visuais de prioridade
- Status e metadata
- Ações inline (editar, deletar)
- Responsivo (desktop/mobile)

#### Timeline.vue
Componente de timeline com:
- Agrupamento por data
- Filtros por tipo de evento
- Ícones diferenciados
- Timestamps relativos
- Detalhes de metadata

#### AuthButton.vue
Componente de autenticação com:
- Botões OAuth para Google e GitHub
- Menu dropdown com perfil
- Avatar do usuário
- Logout

## 🚀 Setup e Configuração

### 1. Instalar Dependências
```bash
npm install
```

### 2. Configurar Ambiente
```bash
cp .env.example .env
# Edite .env com suas credenciais
```

### 3. Configurar OAuth (Opcional)

**Google:**
1. Acesse https://console.cloud.google.com
2. Crie projeto e credenciais OAuth 2.0
3. Adicione redirect URI: `http://localhost:5173/auth/callback`
4. Copie Client ID para `.env`

**GitHub:**
1. Acesse https://github.com/settings/developers
2. Crie novo OAuth App
3. Callback URL: `http://localhost:5173/auth/callback`
4. Copie Client ID para `.env`

### 4. Configurar LLM (Escolha um)

**OpenAI:**
```bash
VITE_LLM_PROVIDER=openai
VITE_OPENAI_API_KEY=sk-your-key
VITE_OPENAI_MODEL=gpt-4-turbo-preview
```

**Ollama (Local):**
```bash
# Instale Ollama primeiro: https://ollama.ai
ollama pull llama2

# Configure no .env:
VITE_LLM_PROVIDER=ollama
VITE_OLLAMA_ENDPOINT=http://localhost:11434
VITE_OLLAMA_MODEL=llama2
```

### 5. Iniciar Desenvolvimento
```bash
npm run dev
```

## 📊 Arquitetura de Dados

### IndexedDB Stores
- `tasks` - Tarefas com índices por status, assignee, priority
- `spans` - Execuções rastreáveis com traceId
- `files` - Blobs de arquivos
- `fileMetadata` - Metadata de arquivos
- `policies` - Políticas de automação
- `timeline` - Entradas de timeline
- `focusSessions` - Sessões de foco

### Pinia Stores
- `tasks` - Gerenciamento de tarefas
- `uploads` - Gerenciamento de uploads
- `auth` - Autenticação e sessão
- `llm` - Configuração e calls de LLM
- `dashboard` - Estado global
- `plugins` - Sistema de plugins

## 🎯 Fluxos Principais

### 1. Upload → Task Automático
```
Usuário faz upload
  → uploads.uploadFile()
  → Salva em IndexedDB
  → Cria task automaticamente
  → LLM analisa arquivo (opcional)
  → Policy agent processa
  → Observer bot monitora
```

### 2. Span de Erro → Task
```
Operação falha
  → Span criado com status=error
  → Observer bot detecta
  → Regra matchea pattern
  → LLM gera task description
  → Task criada automaticamente
```

### 3. Webhook → Automação
```
Webhook recebido
  → webhook_receiver processa
  → Valida signature
  → Extrai informações
  → Dispara policies
  → Cria tasks se configurado
  → Timeline atualizada
```

### 4. Linguagem Natural → Política
```
Usuário: "Quando receber email, criar tarefa"
  → LLM Agent processa
  → Gera JSON de política
  → Policy agent valida
  → Política ativada
  → Monitora trigger
```

## 🔧 Desenvolvimento

### Adicionar Nova Função LLM
```typescript
// 1. Adicionar prompt em src/llm-agent/prompts.ts
export const PROMPTS = {
  my_function: {
    system: "You are...",
    user: (input) => `Process: ${input}`,
    outputSchema: { type: 'object', ... }
  }
}

// 2. Adicionar método em src/llm-agent/index.ts
async myFunction(input: any): Promise<Result> {
  const prompt = buildPrompt('my_function', input)
  return await callLLMWithSchema(this.config, { messages })
}
```

### Adicionar Nova Regra Observer
```typescript
import { getObserverBot } from '@/execution/observer_bot'

getObserverBot().addRule({
  id: 'my-rule',
  name: 'Description',
  spanPattern: /pattern/,
  condition: (span) => /* custom logic */,
  action: 'create_task',
  enabled: true
})
```

## 📝 Próximos Passos

1. ✅ Implementar UI para gestão de políticas
2. ✅ Adicionar testes unitários
3. ✅ Implementar streaming de LLM responses
4. ✅ Adicionar mais sensores (Gmail, Calendar, Drive)
5. ✅ Implementar sincronização com backend
6. ✅ Adicionar analytics e métricas
7. ✅ Melhorar validação de código no run_code
8. ✅ Implementar circuit breaker para LLM calls

## 🐛 Troubleshooting

### OAuth não funciona
- Verifique se o Client ID está correto no `.env`
- Confirme que o redirect URI está configurado no provider
- Verifique console do browser para erros

### LLM não responde
- Verifique se API key está correta
- Para Ollama, confirme que está rodando: `ollama serve`
- Verifique limites de rate no provider

### Observer Bot não dispara
- Verifique se está autenticado (bot só roda se auth)
- Confirme que regras estão habilitadas
- Veja console para erros

### Uploads não aparecem
- Limpe cache do IndexedDB
- Recarregue a página
- Verifique permissões do arquivo

## 📚 Referências

- [OpenAI API Docs](https://platform.openai.com/docs)
- [Ollama](https://ollama.ai)
- [OAuth 2.0 PKCE](https://oauth.net/2/pkce/)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Vue 3 Composition API](https://vuejs.org/guide/extras/composition-api-faq.html)
- [Pinia](https://pinia.vuejs.org/)

---

**Desenvolvido com ❤️ para o Radar Dashboard**
