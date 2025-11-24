import React from 'react';
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom';
import MainShell from './components/layout/MainShell.tsx';
import ArchitectNew from './pages/Architect';
import Connections from './pages/Connections';
import Mapper from './pages/Mapper';
import LibraryView from './views/LibraryView';
import AnalysisJobManager from './components/AnalysisJobManager';
import SettingsView from './views/SettingsView';
import SandboxView from './views/SandboxView';
import AnalysisTuner from './components/tools/AnalysisTuner';
// BlocksProvider is provided at the app root in `main.jsx` to avoid re-mounts during HMR
import { useEditor } from './contexts/EditorContext';
import logger from './lib/logger';

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [sandboxContext, setSandboxContext] = React.useState(null);
  const editor = useEditor();
  const [showAnalysisTuner, setShowAnalysisTuner] = React.useState(false);

  React.useEffect(() => {
    logger.debug('[App] Mounted.');
  }, []);

  React.useEffect(() => {
    const toggleTuner = () => setShowAnalysisTuner((s) => !s);
    globalThis.addEventListener('TOGGLE_ANALYSIS_TUNER', toggleTuner);
    return () => globalThis.removeEventListener('TOGGLE_ANALYSIS_TUNER', toggleTuner);
  }, []);

  React.useEffect(() => {
    const onOpenSandbox = async (e) => {
      const detail = e?.detail || {};
      logger.debug('[App] OPEN_SANDBOX event received:', detail);

      let analysisData = null;

      // Try to load analysis data by analysisId first
      if (detail.analysisId && !detail.fileHash) {
        try {
          const res = await globalThis.ipc.invoke('ANALYSIS:GET_BY_ID', detail.analysisId);
          if (res?.success && res.analysis) {
            analysisData = res.analysis;
            logger.debug('[App] Loaded analysis by ID:', analysisData?.id);
          } else {
            logger.warn('[App] ANALYSIS:GET_BY_ID failed:', res?.error || 'No analysis found');
          }
        } catch (err) {
          logger.error('[App] Failed to fetch analysis by ID:', err);
          // Show user-friendly error but don't block navigation
          if (typeof window !== 'undefined' && window.alert) {
            window.alert(
              'Failed to load analysis data. The sandbox will open with limited functionality.',
            );
          }
        }
      }

      // If we have fileHash but no analysis data, load by fileHash
      if (!analysisData && detail.fileHash) {
        try {
          console.log('[App] Loading analysis by fileHash:', detail.fileHash);
          const res = await globalThis.ipc.invoke('ANALYSIS:GET_RESULT', detail.fileHash);
          if (res?.success && res.analysis) {
            analysisData = res.analysis;
            logger.debug('[App] Loaded analysis by fileHash:', analysisData?.id);
          } else if (res?.analysis) {
            // Handle case where response doesn't have success flag
            analysisData = res.analysis;
            console.log('[App] Loaded analysis (no success flag):', analysisData?.id);
          } else {
            logger.warn('[App] ANALYSIS:GET_RESULT returned no analysis:', res);
          }
        } catch (err) {
          logger.error('[App] Failed to fetch analysis by fileHash:', err);
          // Show user-friendly error but don't block navigation
          if (typeof window !== 'undefined' && window.alert) {
            window.alert(
              'Failed to load analysis data. The sandbox will open with limited functionality.',
            );
          }
        }
      }

      // If we still have no data but have fileHash, create a minimal data object
      if (!analysisData && detail.fileHash) {
        analysisData = {
          fileHash: detail.fileHash,
          file_hash: detail.fileHash,
        };
        logger.debug('[App] Created minimal data object with fileHash:', detail.fileHash);
      }

      // Set context and update editor
      if (analysisData) {
        setSandboxContext(analysisData);
        if (editor?.actions?.updateSongData) {
          logger.debug('[App] Updating EditorContext with analysis data');
          editor.actions.updateSongData(analysisData);
        }
        // Store fileHash globally for other components
        if (analysisData.fileHash || analysisData.file_hash) {
          globalThis.__lastAnalysisHash = analysisData.fileHash || analysisData.file_hash;
          globalThis.__currentFileHash = analysisData.fileHash || analysisData.file_hash;
        }
      } else {
        logger.warn('[App] No analysis data available for sandbox');
        setSandboxContext(detail || null);
      }

      navigate('/sandbox');
    };
    globalThis.addEventListener('OPEN_SANDBOX', onOpenSandbox);
    return () => globalThis.removeEventListener('OPEN_SANDBOX', onOpenSandbox);
  }, [navigate, editor?.actions?.updateSongData]);

  const handleTunerUpdate = React.useCallback(async () => {
    const hash = globalThis.__lastAnalysisHash || globalThis.__currentFileHash;
    if (hash && globalThis.electronAPI) {
      try {
        const res = await globalThis.electronAPI.invoke('ANALYSIS:LOAD_TO_ARCHITECT', hash);
        if (res.success && res.blocks) {
          logger.debug('Analysis reloaded after tuner update:', res.blocks.length, 'blocks');
        } else {
          logger.warn('Tuner update failed:', res?.error || 'Unknown error');
        }
      } catch (err) {
        logger.error('Tuner update failed:', err);
        // Don't show alert for tuner updates as they're background operations
      }
    }
  }, []);

  return (
    <MainShell
      showTuner={showAnalysisTuner}
      tunerComponent={
        <AnalysisTuner
          fileHash={
            globalThis.__lastAnalysisHash ||
            globalThis.__currentFileHash ||
            sandboxContext?.fileHash ||
            null
          }
          onUpdate={handleTunerUpdate}
        />
      }
    >
      <Routes>
        <Route path="/" element={<ArchitectNew />} />
        <Route path="/architect" element={<ArchitectNew />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/mapper" element={<Mapper />} />
        <Route path="/analysis" element={<AnalysisJobManager />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="/library" element={<LibraryView />} />
        <Route path="/sandbox" element={<SandboxView data={sandboxContext || {}} />} />
      </Routes>
    </MainShell>
  );
}

export default App;
