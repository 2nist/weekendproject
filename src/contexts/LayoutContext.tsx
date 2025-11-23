import React, { createContext, useContext, useState } from 'react';

type LayoutContextState = {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  setLeftCollapsed: (v: boolean) => void;
  setRightCollapsed: (v: boolean) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
};

const LayoutContext = createContext<LayoutContextState | undefined>(undefined);

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const toggleLeft = () => setLeftCollapsed((s) => !s);
  const toggleRight = () => setRightCollapsed((s) => !s);

  return (
    <LayoutContext.Provider value={{ leftCollapsed, rightCollapsed, setLeftCollapsed, setRightCollapsed, toggleLeft, toggleRight }}>
      {children}
    </LayoutContext.Provider>
  );
};

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider');
  return ctx;
}

export default LayoutContext;
