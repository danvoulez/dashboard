import type { ServiceModule } from '@/types'
import ExampleComponent from './component.vue'
import { config } from './config'

const examplePlugin: ServiceModule = {
  metadata: {
    id: 'example-plugin',
    title: 'Example Plugin',
    description: 'A demonstration plugin showing the service module pattern',
    icon: '🔌',
    route: '/plugins/example',
    permissions: ['view', 'edit'],
    enabled: true
  },
  component: ExampleComponent,
  config,
  async onInit() {
    console.log('Example plugin initialized')
  },
  async onSpan(span) {
    console.log('Example plugin received span:', span.name)
  }
}

export default examplePlugin
