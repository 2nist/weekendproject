# Registry-Based Context Menu System - Implementation Complete

## ✅ All Phases Implemented

### Phase 1: The Brain (Action Registry) ✅
**File**: `src/config/actionRegistry.ts`

**Interfaces Defined:**
- `ActionDef`: `{ id, label, icon, shortcut?, variant? }`
- `MenuContext`: `'beat' | 'section' | 'measure'`

**Registry Created:**
- `ACTION_REGISTRY`: All action definitions
  - `beat.play` - Audition (Play icon)
  - `beat.edit` - Edit Chord (Edit3 icon)
  - `beat.toggleKick` - Toggle Kick (Circle icon)
  - `beat.toggleSnare` - Toggle Snare (Square icon)
  - `section.rename` - Rename (Type icon)
  - `section.color` - Change Color (Palette icon)
  - `section.split` - Split Here (Scissors icon)
  - `section.delete` - Delete (Trash2 icon, destructive)

**Menu Config Created:**
- `MENU_CONFIG`: Maps contexts to action IDs
  - `beat`: `['beat.play', 'beat.edit', 'separator', 'beat.toggleKick', 'beat.toggleSnare']`
  - `section`: `['section.rename', 'section.color', 'separator', 'section.split', 'section.delete']`

### Phase 2: The Execution Bridge (Hooks) ✅
**File**: `src/hooks/useMenuActions.ts`

**Hook Created:**
- `useMenuActions()`: Returns `{ executeAction }`
- `executeAction(actionId, targetId, data?)`: Routes actions to EditorContext

**Actions Implemented:**
- `beat.play` → Seeks to timestamp and starts playback
- `beat.edit` → Calls `selectObject('beat', id)` to open Inspector
- `beat.toggleKick` → Calls `updateBeat(id, { hasKick })`
- `beat.toggleSnare` → Calls `updateBeat(id, { hasSnare })`
- `section.rename` → Calls `selectObject('section', id)` to open Inspector
- `section.color` → Calls `selectObject('section', id)` to open Inspector
- `section.split` → TODO (logged for future implementation)
- `section.delete` → TODO (logged for future implementation)

### Phase 3: The UI Component (SmartContextMenu) ✅
**File**: `src/components/ui/SmartContextMenu.tsx`

**Component Created:**
- Uses Shadcn `ContextMenu` primitives
- Reads menu config from registry
- Renders actions with icons, labels, shortcuts
- Handles separators
- Supports destructive variant styling
- Architecture allows swapping to Radial Menu later

**Props:**
- `menuType: MenuContext` - 'beat' | 'section' | 'measure'
- `entityId: string` - Entity ID
- `data?: any` - Optional entity data
- `children: React.ReactNode` - Wrapped element

### Phase 4: Integration (Wiring it Up) ✅
**Files Updated:**

1. **`src/components/grid/SectionContainer.tsx`**
   - ✅ Section header wrapped in `<SmartContextMenu menuType="section">`
   - ✅ BeatCard wrapped in `<SmartContextMenu menuType="beat">`
   - ✅ Passes `data={beat}` and `data={section}` props

2. **`src/components/grid/HarmonicGrid.tsx`**
   - ✅ Already uses SectionContainer (which wraps BeatCard)
   - ✅ No additional changes needed

## Architecture Benefits

### 1. **UI Swappable**
The registry pattern allows swapping the UI component:
- Current: `SmartContextMenu` (Right-Click menu)
- Future: `RadialMenu` (can use same registry and hook)

### 2. **Centralized Logic**
- All action definitions in one place (`actionRegistry.ts`)
- All execution logic in one hook (`useMenuActions.ts`)
- Easy to add new actions or modify existing ones

### 3. **Type Safe**
- TypeScript interfaces ensure consistency
- MenuContext type prevents invalid menu types
- Action IDs are string literals for autocomplete

### 4. **Extensible**
- Add new actions: Add to `ACTION_REGISTRY`
- Add new menu types: Add to `MENU_CONFIG`
- Add new execution logic: Add case to `executeAction` switch

## Usage Example

```tsx
// In any component
<SmartContextMenu menuType="beat" entityId={beat.id} data={beat}>
  <BeatCard {...beatProps} />
</SmartContextMenu>

<SmartContextMenu menuType="section" entityId={section.id} data={section}>
  <SectionHeader {...sectionProps} />
</SmartContextMenu>
```

## Action Execution Flow

1. User right-clicks on BeatCard/SectionContainer
2. `SmartContextMenu` reads `MENU_CONFIG[menuType]`
3. Renders menu items from `ACTION_REGISTRY`
4. User clicks action (e.g., "Toggle Kick")
5. `SmartContextMenu` calls `executeAction('beat.toggleKick', entityId, data)`
6. `useMenuActions` routes to `actions.updateBeat(id, { hasKick })`
7. `EditorContext` updates state
8. UI re-renders with new state

## Future Enhancements

### Easy to Add:
1. **Keyboard Shortcuts**: Already supported via `shortcut` prop
2. **Radial Menu**: Create `RadialMenu.tsx` using same registry
3. **More Actions**: Add to registry, add case to switch
4. **Action Groups**: Extend `MENU_CONFIG` with nested groups
5. **Permissions**: Add `enabled` or `visible` flags to actions

### TODO Actions:
- `section.split` - Needs `splitSection` action in EditorContext
- `section.delete` - Needs `deleteSection` action in EditorContext

## Testing Checklist

- [ ] Right-click on BeatCard shows beat menu
- [ ] Right-click on Section header shows section menu
- [ ] "Audition" seeks and plays audio
- [ ] "Edit Chord" opens Inspector
- [ ] "Toggle Kick" updates beat drums
- [ ] "Toggle Snare" updates beat drums
- [ ] "Rename" opens Inspector for section
- [ ] "Change Color" opens Inspector for section
- [ ] Destructive actions (Delete) styled correctly
- [ ] Separators render correctly

---

**Status**: ✅ Implementation Complete
**Architecture**: Registry-based, UI-swappable
**Ready for**: Radial Menu swap (future enhancement)

