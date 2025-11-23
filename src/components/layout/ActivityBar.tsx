import React from 'react';
import { Home, Folder, Grid, Settings, ChevronLeft, ChevronRight, FlaskConical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLayout } from '../../contexts/LayoutContext';

export default function ActivityBar() {
  const navigate = useNavigate();
  const { setLeftCollapsed, toggleLeft, toggleRight } = useLayout();

  const go = (path: string) => {
    // Expand left panel before navigating
    setLeftCollapsed(false);
    navigate(path);
  };

  const toggleAnalysisTuner = () => {
    // Dispatch a custom event to toggle the analysis tuner
    globalThis.dispatchEvent(new CustomEvent('TOGGLE_ANALYSIS_TUNER'));
  };

  const goHome = () => {
    // Clear blocks and navigate to landing page
    globalThis.dispatchEvent(new CustomEvent('CLEAR_BLOCKS'));
    go('/');
  };

  return (
    <div className="fixed left-0 top-0 bottom-0 w-14 bg-background border-r border-border z-50 flex flex-col items-center py-3 gap-2">
      <button aria-label="Home" title="Home - Arrangement Grid" onClick={goHome} className="p-2 rounded hover:bg-slate-800">
        <Home size={20} />
      </button>
      <button aria-label="Library" title="Library" onClick={() => go('/library')} className="p-2 rounded hover:bg-slate-800">
        <Folder size={20} />
      </button>
      <button aria-label="Sandbox" title="Sandbox" onClick={() => go('/sandbox')} className="p-2 rounded hover:bg-slate-800">
        <Grid size={20} />
      </button>
      <button aria-label="Analysis Lab" title="Analysis Lab" onClick={toggleAnalysisTuner} className="p-2 rounded hover:bg-slate-800">
        <FlaskConical size={20} />
      </button>
      <div className="flex-1" />
      <button aria-label="Settings" title="Settings" onClick={() => go('/settings')} className="p-2 rounded hover:bg-slate-800">
        <Settings size={20} />
      </button>
      <button aria-label="Toggle Left" title="Toggle Left Panel" onClick={() => toggleLeft()} className="p-2 rounded hover:bg-slate-800">
        <ChevronLeft size={18} />
      </button>
      <button aria-label="Toggle Right" title="Toggle Right Panel" onClick={() => toggleRight()} className="p-2 rounded hover:bg-slate-800">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
