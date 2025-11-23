/**
 * Menu Configuration Tab
 * UI for editing context menu items and their configurations
 */

import React, { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { Plus, Trash2, GripVertical, Save, RotateCcw } from 'lucide-react';
import { ACTION_REGISTRY, MENU_CONFIG, type MenuContext, type ActionDef } from '../../config/actionRegistry';
import * as lucideIcons from 'lucide-react';

interface MenuConfigTabProps {
  onSave?: (config: typeof MENU_CONFIG) => void;
}

export default function MenuConfigTab({ onSave }: MenuConfigTabProps) {
  // Local state for editing
  const [menuConfig, setMenuConfig] = useState<Record<MenuContext, (string | 'separator')[]>>(MENU_CONFIG);
  const [selectedContext, setSelectedContext] = useState<MenuContext>('beat');
  const [editingAction, setEditingAction] = useState<string | null>(null);

  // Get available icons from lucide-react
  const availableIcons = useMemo(() => {
    const iconNames = Object.keys(lucideIcons).filter(
      (name) => typeof lucideIcons[name as keyof typeof lucideIcons] === 'function' && name[0] === name[0].toUpperCase()
    );
    return iconNames.sort();
  }, []);

  // Get current menu items for selected context
  const currentItems = menuConfig[selectedContext] || [];

  // Get all available actions
  const availableActions = useMemo(() => {
    return Object.keys(ACTION_REGISTRY).filter((id) => id.startsWith(selectedContext + '.'));
  }, [selectedContext]);

  // Handle adding an action to the menu
  const handleAddAction = (actionId: string) => {
    setMenuConfig((prev) => ({
      ...prev,
      [selectedContext]: [...prev[selectedContext], actionId],
    }));
  };

  // Handle adding a separator
  const handleAddSeparator = () => {
    setMenuConfig((prev) => ({
      ...prev,
      [selectedContext]: [...prev[selectedContext], 'separator'],
    }));
  };

  // Handle removing an item
  const handleRemoveItem = (index: number) => {
    setMenuConfig((prev) => ({
      ...prev,
      [selectedContext]: prev[selectedContext].filter((_, i) => i !== index),
    }));
  };

  // Handle reordering (move up)
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setMenuConfig((prev) => {
      const items = [...prev[selectedContext]];
      [items[index - 1], items[index]] = [items[index], items[index - 1]];
      return { ...prev, [selectedContext]: items };
    });
  };

  // Handle reordering (move down)
  const handleMoveDown = (index: number) => {
    setMenuConfig((prev) => {
      const items = [...prev[selectedContext]];
      if (index >= items.length - 1) return prev;
      [items[index], items[index + 1]] = [items[index + 1], items[index]];
      return { ...prev, [selectedContext]: items };
    });
  };

  // Handle save
  const handleSave = () => {
    // In a real implementation, this would save to localStorage or backend
    if (onSave) {
      onSave(menuConfig);
    }
    console.log('[MenuConfigTab] Saving menu configuration:', menuConfig);
    // TODO: Persist to localStorage or backend
    localStorage.setItem('menuConfig', JSON.stringify(menuConfig));
  };

  // Handle reset
  const handleReset = () => {
    setMenuConfig(MENU_CONFIG);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Context Menu Configuration</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Customize right-click menu items for beats, sections, and measures
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} size="sm">
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleSave} size="sm">
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      <Tabs value={selectedContext} onValueChange={(v) => setSelectedContext(v as MenuContext)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="beat">Beat Menu</TabsTrigger>
          <TabsTrigger value="section">Section Menu</TabsTrigger>
          <TabsTrigger value="measure">Measure Menu</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedContext} className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Current Menu Items */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Current Menu Items</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  Drag to reorder, click to remove
                </p>
              </div>
              <ScrollArea className="h-[400px] border rounded-md p-4">
                <div className="space-y-2">
                  {currentItems.map((item, index) => {
                    if (item === 'separator') {
                      return (
                        <div
                          key={`separator-${index}`}
                          className="flex items-center gap-2 p-2 bg-muted rounded border border-dashed"
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1 h-px bg-border" />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    }

                    const actionDef = ACTION_REGISTRY[item];
                    if (!actionDef) return null;

                    const Icon = actionDef.icon;

                    return (
                      <div
                        key={item}
                        className="flex items-center gap-2 p-2 bg-card border rounded hover:bg-accent transition-colors"
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                        <Icon className="h-4 w-4" />
                        <span className="flex-1 text-sm">{actionDef.label}</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleMoveDown(index)}
                            disabled={index >= currentItems.length - 1}
                          >
                            ↓
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Available Actions */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Available Actions</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  Click to add to menu
                </p>
              </div>
              <ScrollArea className="h-[400px] border rounded-md p-4">
                <div className="space-y-2">
                  {availableActions.map((actionId) => {
                    const actionDef = ACTION_REGISTRY[actionId];
                    if (!actionDef) return null;

                    const Icon = actionDef.icon;
                    const isInMenu = currentItems.includes(actionId);

                    return (
                      <button
                        key={actionId}
                        onClick={() => !isInMenu && handleAddAction(actionId)}
                        disabled={isInMenu}
                        className={`w-full flex items-center gap-2 p-2 rounded border transition-colors ${
                          isInMenu
                            ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                            : 'bg-card hover:bg-accent cursor-pointer'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1 text-sm text-left">{actionDef.label}</span>
                        {isInMenu && <span className="text-xs text-muted-foreground">Added</span>}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="pt-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleAddSeparator}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Separator
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

