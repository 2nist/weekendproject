# ScrollArea Layout Loop Fix

## Problem

Radix UI's `ScrollArea` was causing an infinite layout calculation loop:
1. ScrollArea asks parent: "How tall are you?"
2. Parent (Flex) says: "I'm as tall as my content."
3. ScrollArea says: "Okay, I'm tall now."
4. Parent grows.
5. ScrollArea detects resize and re-renders.
6. **Loop continues until React crashes.**

## Root Cause

The parent container didn't have explicit height constraints. When using `h-full` inside a flex container without `min-h-0` and `overflow-hidden`, the flex container tries to grow to fit content, which causes ScrollArea to recalculate, which causes the parent to grow again.

## Solution

Add these critical CSS classes to the ScrollArea wrapper:
- `flex-1` - Makes the container take available space
- `min-h-0` - **Critical for Flexbox** - Prevents flex items from growing beyond container
- `overflow-hidden` - Prevents content from expanding parent

## Files Fixed

### 1. `src/components/layout/InspectorPanel.tsx`
**Before:**
```tsx
<div className="h-full p-3 border-l border-border bg-card">
  <ScrollArea.Root className="h-[calc(100%-40px)]">
    ...
  </ScrollArea.Root>
</div>
```

**After:**
```tsx
<div className="flex flex-col h-full min-h-0 overflow-hidden bg-card border-l border-border">
  <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
    <h3>Inspector</h3>
  </div>
  <div className="flex-1 min-h-0">
    <ScrollArea className="h-full w-full">
      <div className="p-4">{content}</div>
    </ScrollArea>
  </div>
</div>
```

### 2. `src/components/layout/SidePanel.tsx`
**Before:**
```tsx
<div className="h-full p-3 overflow-auto">
  ...
</div>
```

**After:**
```tsx
<div className="flex flex-col h-full min-h-0 overflow-hidden bg-muted/10 border-r border-border">
  <div className="h-12 flex items-center px-4 border-b border-border font-semibold flex-shrink-0">
    {header}
  </div>
  <div className="flex-1 min-h-0">
    <ScrollArea className="h-full w-full">
      <div className="p-3">{content}</div>
    </ScrollArea>
  </div>
</div>
```

### 3. `src/components/editor/InspectorPanel.tsx`
**Before:**
```tsx
<div className="h-full p-4 bg-card border-l border-border">
  {children}
  <BeatEditor />
</div>
```

**After:**
```tsx
<div className="flex flex-col h-full min-h-0 overflow-hidden bg-card border-l border-border">
  {children}
  <div className="flex-1 min-h-0">
    <ScrollArea className="h-full w-full">
      <BeatEditor />
    </ScrollArea>
  </div>
</div>
```

## Key Changes

1. **Container**: Changed from `h-full` to `flex flex-col h-full min-h-0 overflow-hidden`
2. **Header**: Added `flex-shrink-0` to prevent header from shrinking
3. **ScrollArea Wrapper**: Added `flex-1 min-h-0` wrapper around ScrollArea
4. **ScrollArea**: Changed from `h-[calc(100%-40px)]` to `h-full w-full` (simpler, more reliable)

## Why `min-h-0` is Critical

In Flexbox, flex items have a default `min-height: auto`, which means they won't shrink below their content size. This causes the loop:

- Without `min-h-0`: Flex item grows to fit content → ScrollArea recalculates → Content grows → Loop
- With `min-h-0`: Flex item respects container height → ScrollArea has fixed constraint → No loop

## Testing

After applying these fixes:
1. ✅ No infinite re-renders in console
2. ✅ ScrollArea scrolls smoothly
3. ✅ Panel heights are stable
4. ✅ No React "Maximum update depth exceeded" errors

---

**Status**: ✅ Fixed - All ScrollArea components now have proper height constraints

