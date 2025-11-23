# Context Menu Status & Configuration

## ✅ Right-Click Menu: WIRED AND READY

The context menu system is **fully wired** and ready to use:

### Where It's Used:
1. **BeatCard** (in `SectionContainer.tsx` line 251)
   - Right-click any beat card → Shows beat menu
   - Actions: Audition, Edit Chord, Toggle Kick, Toggle Snare

2. **Section Header** (in `SectionContainer.tsx` line 175)
   - Right-click section header → Shows section menu
   - Actions: Rename, Change Color, Split, Delete

### Files:
- ✅ `src/config/actionRegistry.ts` - Action definitions
- ✅ `src/hooks/useMenuActions.ts` - Execution logic
- ✅ `src/components/ui/SmartContextMenu.tsx` - UI component
- ✅ `src/components/grid/SectionContainer.tsx` - Wired up

## 🎨 Menu Configuration UI: CREATED

A UI editor for customizing menu items has been created:

### File:
- ✅ `src/components/settings/MenuConfigTab.tsx`

### Features:
- **Visual Editor**: See current menu items and available actions
- **Add/Remove**: Add actions to menu or remove them
- **Reorder**: Move items up/down to change order
- **Separators**: Add visual separators between action groups
- **Context Tabs**: Separate tabs for Beat, Section, and Measure menus
- **Save/Reset**: Save custom configuration or reset to defaults

### How to Add to Settings:

1. **Find your Settings component** (likely in `src/pages/Settings.tsx` or similar)
2. **Import the tab**:
   ```tsx
   import MenuConfigTab from '@/components/settings/MenuConfigTab';
   ```
3. **Add it to your settings tabs**:
   ```tsx
   <Tabs>
     <TabsList>
       <TabsTrigger value="appearance">Appearance</TabsTrigger>
       <TabsTrigger value="menu">Context Menus</TabsTrigger>
       {/* ... other tabs */}
     </TabsList>
     <TabsContent value="appearance">
       <AppearanceTab />
     </TabsContent>
     <TabsContent value="menu">
       <MenuConfigTab />
     </TabsContent>
   </Tabs>
   ```

### How It Works:

1. **Default Config**: Menu items are defined in `actionRegistry.ts`
2. **Custom Config**: Users can customize via `MenuConfigTab`
3. **Persistence**: Custom config is saved to `localStorage` as `menuConfig`
4. **Loading**: `actionRegistry.ts` automatically loads saved config on import
5. **Fallback**: If no saved config exists, uses defaults

### Current Menu Items:

#### Beat Menu:
- Audition (Play icon) - Seeks to beat and plays
- Edit Chord (Edit3 icon) - Opens Inspector
- ─── Separator ───
- Toggle Kick (Circle icon) - Toggles kick drum
- Toggle Snare (Square icon) - Toggles snare drum

#### Section Menu:
- Rename (Type icon) - Opens Inspector
- Change Color (Palette icon) - Opens Inspector
- ─── Separator ───
- Split Here (Scissors icon) - TODO: Implement splitting
- Delete (Trash2 icon, destructive) - TODO: Implement deletion

## 🔧 Technical Details

### Registry Pattern:
- **Static Definitions**: All actions defined in `ACTION_REGISTRY`
- **Dynamic Configuration**: Menu order/visibility in `MENU_CONFIG`
- **Execution Bridge**: `useMenuActions` hook routes to EditorContext
- **UI Component**: `SmartContextMenu` renders from registry

### Persistence:
- Saved to: `localStorage.getItem('menuConfig')`
- Format: JSON object with context keys and action ID arrays
- Example:
  ```json
  {
    "beat": ["beat.play", "beat.edit", "separator", "beat.toggleKick"],
    "section": ["section.rename", "section.color", "separator", "section.split"]
  }
  ```

### Future Enhancements:
- [ ] Add keyboard shortcut editor
- [ ] Add icon picker for actions
- [ ] Add action visibility toggles
- [ ] Export/import menu configurations
- [ ] Per-project menu configurations

---

**Status**: ✅ Menu wired, ✅ UI editor created, ⏳ Needs integration into Settings page

