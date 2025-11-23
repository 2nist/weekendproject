/**
 * Phase 1: The Brain (Action Registry)
 * Centralized action definitions for context menus
 * Architecture allows swapping UI (Right-Click → Radial Menu) without rewriting logic
 */

import type { LucideIcon } from 'lucide-react';
import {
  Play,
  Edit3,
  Circle,
  Square,
  Type,
  Palette,
  Scissors,
  Trash2,
} from 'lucide-react';

/**
 * Action Definition Interface
 */
export interface ActionDef {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  variant?: 'default' | 'destructive';
}

/**
 * Menu Context Type
 */
export type MenuContext = 'beat' | 'section' | 'measure';

/**
 * Action Registry
 * Centralized definitions for all context menu actions
 */
export const ACTION_REGISTRY: Record<string, ActionDef> = {
  // Beat Actions
  'beat.play': {
    id: 'beat.play',
    label: 'Audition',
    icon: Play,
    shortcut: 'Space',
  },
  'beat.edit': {
    id: 'beat.edit',
    label: 'Edit Chord',
    icon: Edit3,
    shortcut: 'E',
  },
  'beat.toggleKick': {
    id: 'beat.toggleKick',
    label: 'Toggle Kick',
    icon: Circle,
  },
  'beat.toggleSnare': {
    id: 'beat.toggleSnare',
    label: 'Toggle Snare',
    icon: Square,
  },

  // Section Actions
  'section.rename': {
    id: 'section.rename',
    label: 'Rename',
    icon: Type,
  },
  'section.color': {
    id: 'section.color',
    label: 'Change Color',
    icon: Palette,
  },
  'section.split': {
    id: 'section.split',
    label: 'Split Here',
    icon: Scissors,
  },
  'section.delete': {
    id: 'section.delete',
    label: 'Delete',
    icon: Trash2,
    variant: 'destructive',
  },
};

/**
 * Menu Configuration
 * Maps contexts to action IDs (with separators)
 */
const DEFAULT_MENU_CONFIG: Record<MenuContext, (string | 'separator')[]> = {
  beat: ['beat.play', 'beat.edit', 'separator', 'beat.toggleKick', 'beat.toggleSnare'],
  section: ['section.rename', 'section.color', 'separator', 'section.split', 'section.delete'],
  measure: [], // Can be extended later
};

/**
 * Load menu configuration from localStorage or return defaults
 */
function loadMenuConfig(): Record<MenuContext, (string | 'separator')[]> {
  try {
    const saved = localStorage.getItem('menuConfig');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate structure
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_MENU_CONFIG, ...parsed };
      }
    }
  } catch (e) {
    console.warn('[actionRegistry] Failed to load menu config from localStorage:', e);
  }
  return DEFAULT_MENU_CONFIG;
}

/**
 * Menu Configuration (loaded from localStorage or defaults)
 */
export const MENU_CONFIG: Record<MenuContext, (string | 'separator')[]> = loadMenuConfig();

/**
 * Get action definition by ID
 */
export function getActionDef(actionId: string): ActionDef | undefined {
  return ACTION_REGISTRY[actionId];
}

/**
 * Get menu configuration for a context
 */
export function getMenuConfig(context: MenuContext): (string | 'separator')[] {
  return MENU_CONFIG[context] || [];
}
