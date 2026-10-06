import { Brush, Castle, CircleDashed, Fence, Flag, MousePointer2, MoveUpRight, Pentagon, RadioTower, Ruler, Swords, Type } from 'lucide-vue-next'
import type { Component } from 'vue'
import { t, type MessageKey } from '../i18n'
import type { ToolId } from '../state/session'

export interface ToolInfo {
  id: ToolId
  key: string
  icon: Component
}

/** Single source for toolbar, keyboard shortcuts and the help dialog. Grouped by purpose. Shortcuts are the same in every language. */
export const TOOL_GROUPS: ToolInfo[][] = [
  [{ id: 'select', key: 'V', icon: MousePointer2 }],
  [
    { id: 'assign', key: 'P', icon: Brush },
    { id: 'own', key: 'C', icon: Castle },
  ],
  [
    { id: 'arrow', key: 'A', icon: MoveUpRight },
    { id: 'front', key: 'F', icon: Fence },
    { id: 'zone', key: 'Z', icon: Pentagon },
  ],
  [
    { id: 'unit', key: 'U', icon: Swords },
    { id: 'objective', key: 'O', icon: Flag },
    { id: 'range', key: 'R', icon: CircleDashed },
    { id: 'text', key: 'T', icon: Type },
  ],
  [
    { id: 'measure', key: 'M', icon: Ruler },
    { id: 'ping', key: 'G', icon: RadioTower },
  ],
]

export const TOOLS: ToolInfo[] = TOOL_GROUPS.flat()
export const TOOL_BY_KEY = new Map(TOOLS.map((tool) => [tool.key.toLowerCase(), tool.id]))
export const toolInfo = (id: ToolId) => TOOLS.find((tool) => tool.id === id)!

/** Tool name in the current language. */
export const toolLabel = (id: ToolId) => t(`tool.${id}` as MessageKey)
/** One-line tool explanation in the current language. */
export const toolHelp = (id: ToolId) => t(`tool.${id}.help` as MessageKey)
