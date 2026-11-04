import { useAskStore } from '@/stores/ask-store'
import { useConnectionStore } from '@/stores/connection-store'
import { useTabStore } from '@/stores/tab-store'

/** Opens a new Ask tab on the active connection and asks it `text`. */
export function openAsk(text: string): void {
  const connectionId = useConnectionStore.getState().activeConnectionId
  const tabId = useTabStore.getState().createAskTab(connectionId)
  useAskStore.getState().queue(tabId, { mode: 'ask', text })
}

export function askAboutTable(schema: string, table: string): string {
  // Keep the schema even for public/main: another schema may have a table of
  // the same name, and the model sees every schema.
  return `Describe the ${schema}.${table} table: what it stores, its key columns, how it relates to other tables, and anything notable in its data.`
}
