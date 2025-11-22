import React, { useEffect, useState } from 'react';
import LibraryTable from '@/components/LibraryTable';

export default function LibraryView() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [importing, setImporting] = useState(false);

  async function loadProjects() {
    setLoading(true);
    try {
      const res = await window.ipc.invoke('LIBRARY:GET_PROJECTS');
      if (res && res.success) setProjects(res.projects || []);
      else setProjects([]);
    } catch (err) {
      console.error('Failed to load projects', err);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  const handleRefresh = () => loadProjects();

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
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Library</h2>
        <div className="flex gap-2">
          <button onClick={handleRefresh} className="btn">
            Refresh
          </button>
        </div>
      </div>
      
      {/* YouTube Import Section */}
      <div className="mb-6 p-4 bg-slate-900 rounded-lg border border-slate-800">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Import from YouTube</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="Paste YouTube URL..."
            disabled={importing || loading}
            className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200 placeholder-slate-500 text-sm"
          />
          <button
            onClick={handleImportYouTube}
            disabled={!youtubeUrl.trim() || importing || loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded text-sm font-medium transition-colors"
          >
            {importing ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
      
      {loading ? (
        <div>Loading...</div>
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
    </div>
  );
}
