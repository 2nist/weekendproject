import React, { useRef, useState } from 'react';
// Minimal, dependency-free resizable panels. We avoid external dependency conflicts.
import ActivityBar from './ActivityBar';
import SidePanel from './SidePanel';
import InspectorPanel from './InspectorPanel';
import BottomDeck from './BottomDeck';
import { Outlet } from 'react-router-dom';
import { useLayout } from '../../contexts/LayoutContext';

export default function MainShell({ children, showTuner = false, tunerComponent = null }: Readonly<{ children?: React.ReactNode, showTuner?: boolean, tunerComponent?: React.ReactNode | null }>) {
  const { leftCollapsed, rightCollapsed } = useLayout();
  const [leftWidth, setLeftWidth] = useState(20); // percent
  const [rightWidth, setRightWidth] = useState(20); // percent
  const draggingRef = useRef<null | { which: 'left' | 'right' }>(null);

  const startDrag = (which: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = { which };
    globalThis.addEventListener('mousemove', onMove as any);
    globalThis.addEventListener('mouseup', onUp as any);
  };

  const onMove = (e: MouseEvent) => {
    if (!draggingRef.current) return;
    const w = window.innerWidth - 56; // subtract ActivityBar width
    const x = e.clientX - 56; // offset for ActivityBar
    const leftPct = Math.max(5, Math.min(80, (x / w) * 100));
    if (draggingRef.current.which === 'left') {
      setLeftWidth(leftPct);
    } else {
      const rightPct = Math.max(5, Math.min(80, (1 - x / w) * 100));
      setRightWidth(rightPct);
    }
  };

  const onUp = () => {
    globalThis.removeEventListener('mousemove', onMove as any);
    globalThis.removeEventListener('mouseup', onUp as any);
    draggingRef.current = null;
  };

  // calculate center width based on left/right and clamp
  const centerWidth = Math.max(10, 100 - (leftCollapsed ? 0 : leftWidth) - (rightCollapsed ? 0 : rightWidth));

  // Only update CSS variables when values actually change
  React.useEffect(() => {
    const root = document.documentElement;
    if (!root) return;
    const leftVal = leftCollapsed ? '0%' : `${leftWidth}%`;
    const rightVal = rightCollapsed ? '0%' : `${rightWidth}%`;
    const centerVal = `${centerWidth}%`;
    
    root.style.setProperty('--left-width', leftVal);
    root.style.setProperty('--right-width', rightVal);
    root.style.setProperty('--center-width', centerVal);
  }, [leftWidth, rightWidth, leftCollapsed, rightCollapsed, centerWidth]);

  return (
    <div className="h-screen w-screen flex bg-background text-foreground overflow-hidden">
      <ActivityBar />

      <div className="flex-1 h-full ml-14 flex min-h-screen">
        {/* Left panel */}
        <div className={`h-full bg-card border-r border-border overflow-hidden transition-all ws-left`}>
          {!leftCollapsed && <SidePanel />}
        </div>

        {/* Left resizer */}
        {!leftCollapsed && (
          <button
            className="ws-resizer"
            onMouseDown={startDrag('left')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') setLeftWidth((w) => Math.max(5, w - 2));
              if (e.key === 'ArrowRight') setLeftWidth((w) => Math.min(80, w + 2));
            }}
            aria-label="Resize left panel"
          />
        )}

        {/* Center */}
        <div className="h-full flex flex-col ws-center">
          <div className="flex-1 overflow-auto p-4">{children || <Outlet />}</div>
          <BottomDeck />
        </div>

        {/* Right resizer */}
        {!rightCollapsed && (
          <button
              className="ws-resizer"
              onMouseDown={startDrag('right')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') setRightWidth((w) => Math.max(5, w - 2));
                if (e.key === 'ArrowRight') setRightWidth((w) => Math.min(80, w + 2));
              }}
              aria-label="Resize right panel"
            />
        )}

        {/* Right panel */}
        <div className={`h-full bg-card border-l border-border overflow-hidden transition-all ws-right`}>
          {!rightCollapsed && <InspectorPanel>{showTuner && tunerComponent}</InspectorPanel>}
        </div>
      </div>
    </div>
  );
}
