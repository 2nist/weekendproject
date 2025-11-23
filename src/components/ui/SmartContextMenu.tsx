/**
 * Phase 3: The UI Component (SmartContextMenu)
 * Registry-based context menu that can be swapped for Radial Menu later
 */

import React, { useMemo } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuShortcut,
} from './context-menu';
import { getMenuConfig, getActionDef, type MenuContext } from '@/config/actionRegistry';
import { useMenuActions } from '@/hooks/useMenuActions';
import { cn } from '@/lib/utils';

interface SmartContextMenuProps {
  menuType: MenuContext;
  entityId: string;
  data?: any; // Optional entity data (beat, section, etc.)
  children: React.ReactNode;
  className?: string;
}

/**
 * Load menu config from localStorage or use defaults
 * Supports runtime configuration changes
 */
function loadMenuConfigForContext(context: MenuContext): (string | 'separator')[] {
  try {
    const saved = localStorage.getItem('menuConfig');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed[context]) {
        return parsed[context];
      }
    }
  } catch (e) {
    // Fall through to default
  }
  return getMenuConfig(context);
}

/**
 * Smart Context Menu Component
 * Uses registry-based architecture for easy UI swapping
 */
export function SmartContextMenu({
  menuType,
  entityId,
  data,
  children,
  className,
}: SmartContextMenuProps) {
  const { executeAction } = useMenuActions();
  // Load config dynamically to support runtime changes
  const menuConfig = useMemo(() => loadMenuConfigForContext(menuType), [menuType]);

  // If no actions configured, return children without menu
  if (menuConfig.length === 0) {
    return <>{children}</>;
  }

  const handleActionClick = (actionId: string) => {
    executeAction(actionId, entityId, data);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild className={className}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {menuConfig.map((item, index) => {
          // Handle separators
          if (item === 'separator') {
            return <ContextMenuSeparator key={`separator-${index}`} />;
          }

          // Get action definition
          const actionDef = getActionDef(item);
          if (!actionDef) {
            console.warn(`[SmartContextMenu] Action not found: ${item}`);
            return null;
          }

          const Icon = actionDef.icon;
          const isDestructive = actionDef.variant === 'destructive';

          return (
            <ContextMenuItem
              key={actionDef.id}
              onClick={() => handleActionClick(actionDef.id)}
              className={cn(
                'flex items-center gap-2 cursor-pointer',
                isDestructive && 'text-destructive focus:text-destructive',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{actionDef.label}</span>
              {actionDef.shortcut && (
                <ContextMenuShortcut>{actionDef.shortcut}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
          );
        })}
      </ContextMenuContent>
    </ContextMenu>
  );
}
