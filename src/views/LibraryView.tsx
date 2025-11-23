import React, { useEffect, useState, useCallback } from 'react';
import LibraryTable from '@/components/LibraryTable';
import BatchImportPanel from '@/components/library/BatchImportPanel';
import ReferenceDatasetBrowser from '@/components/library/ReferenceDatasetBrowser';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';

export default function LibraryView() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [activeTab, setActiveTab] = useState('projects');

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.ipc.invoke('LIBRARY:GET_PROJECTS');
      console.log('[LibraryView] Load projects response:', res);
      if (res && res.success) {
        setProjects(res.projects || []);
      } else {
        const errorMsg = res?.error || 'Unknown error loading projects';
        setError(errorMsg);
        console.error('[LibraryView] Failed to load projects:', errorMsg);
        setProjects([]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error('[LibraryView] Exception loading projects:', err);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleRefresh = useCallback(() => {
    loadProjects();
  }, [loadProjects]);

  const handleImportComplete = useCallback(() => {
    loadProjects();
    setActiveTab('projects');
  }, [loadProjects]);

  const handleAnalyze = async (project) => {
    if (!project || !project.audio_path) return;
    setLoading(true);
    try {
      // Use the library re-analyze to attach an analysis to the project
      const res = await window.ipc.invoke('LIBRARY:RE_ANALYZE', {
        projectId: project.id,
        force: true,
      });
      if (res && res.success) loadProjects();
    } catch (err) {
      console.error('Analyze failed', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReAnalyze = async (project) => {
    if (!project || !project.audio_path) return;
    setLoading(true);
    try {
      const res = await window.ipc.invoke('LIBRARY:RE_ANALYZE', {
        projectId: project.id,
        force: true,
      });
      if (res && res.success) loadProjects();
    } catch (err) {
      console.error('Re-analyze failed', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAttachMidi = async (projectId) => {
    try {
      const dialogRes = await window.electronAPI.showOpenDialog({
        title: 'Select MIDI File',
        filters: [{ name: 'MIDI Files', extensions: ['mid', 'midi'] }],
      });
      if (dialogRes.canceled) return;
      const filePath = (dialogRes.filePaths || [])[0];
      if (!filePath) return;
      const res = await window.ipc.invoke('LIBRARY:ATTACH_MIDI', {
        projectId,
        midiPath: filePath,
      });
      if (res && res.success) loadProjects();
    } catch (err) {
      console.error('Attach MIDI failed', err);
    }
  };

  const handleImportYouTube = async () => {
    if (!youtubeUrl.trim()) return;
    setImporting(true);
    try {
      const downloadRes = await window.electron.downloadYouTube(youtubeUrl);
      if (!downloadRes || !downloadRes.success) {
        alert('YouTube download failed: ' + (downloadRes?.error || 'Unknown error'));
        return;
      }
      const audioPath = downloadRes.audioPath;
      const title = downloadRes.title || 'YouTube Import';
      // Create project with the downloaded audio
      const createRes = await window.ipc.invoke('LIBRARY:CREATE_PROJECT', {
        title,
        audio_path: audioPath,
      });
      if (createRes && createRes.success) {
        setYoutubeUrl('');
        loadProjects();
      } else {
        alert('Failed to create project: ' + (createRes?.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('YouTube import failed', err);
      alert('Import error: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  // Note: created_at formatting handled where needed by table components

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">Library</h2>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="batch">Batch Import</TabsTrigger>
          <TabsTrigger value="datasets">Reference Datasets</TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="flex-1 overflow-auto mt-4 min-h-0">
          {/* YouTube Import Section */}
          <div className="mb-6 p-4 bg-card rounded-lg border border-border">
            <h3 className="text-sm font-semibold text-foreground mb-2">Import from YouTube</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="Paste YouTube URL..."
                disabled={importing || loading}
                className="flex-1 px-3 py-2 bg-background border border-input rounded text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={handleImportYouTube}
                disabled={!youtubeUrl.trim() || importing || loading}
                className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : error ? (
            <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
              <div className="text-destructive font-semibold mb-2">Error Loading Library</div>
              <div className="text-sm text-destructive/80">{error}</div>
              <button
                onClick={loadProjects}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-sm"
              >
                Retry
              </button>
            </div>
          ) : (
            <LibraryTable
              projects={projects}
              onAnalyze={handleAnalyze}
              onReAnalyze={handleReAnalyze}
              onAttachMidi={handleAttachMidi}
              onOpenSandbox={(p) =>
                window.dispatchEvent(
                  new CustomEvent('OPEN_SANDBOX', {
                    detail: {
                      fileHash: p.analysis_file_hash || p.file_hash,
                      projectId: p.id,
                      analysisId: p.analysis_id,
                    },
                  }),
                )
              }
              isLoading={loading}
            />
          )}
        </TabsContent>

        <TabsContent value="batch" className="flex-1 overflow-auto mt-4 min-h-0">
          <BatchImportPanel onImportComplete={handleImportComplete} />
        </TabsContent>

        <TabsContent value="datasets" className="flex-1 overflow-auto mt-4 min-h-0">
          <ReferenceDatasetBrowser />
        </TabsContent>
      </Tabs>
    </div>
  );
}
