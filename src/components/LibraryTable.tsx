import React, { useState } from 'react';
import { Button } from './ui/button';
import { Music, Youtube, File, Play, Eye } from 'lucide-react';
import ProjectDetailView from './library/ProjectDetailView';

function SourceIcon({ project }: { project: any }) {
  if (project.midi_path) return <Music className="w-4 h-4" />;
  if (project.audio_path && project.audio_path.includes('youtube')) return <Youtube className="w-4 h-4" />;
  if (project.audio_path) return <Play className="w-4 h-4" />;
  return <File className="w-4 h-4" />;
}

export default function LibraryTable({ projects, onAnalyze, onReAnalyze, onAttachMidi, onOpenSandbox, isLoading }: {
  projects: any[];
  onAnalyze: (project: any) => void;
  onReAnalyze: (project: any) => void;
  onAttachMidi: (projectId: number) => void;
  onOpenSandbox: (project: any) => void;
  isLoading?: boolean;
}) {
  const [selectedProject, setSelectedProject] = useState<any | null>(null);

  return (
    <>
    <div className="overflow-auto">
      <table className="min-w-full text-sm text-left">
        <thead>
          <tr>
            <th>Source</th>
            <th>Title</th>
            <th>Artist</th>
            <th>Key</th>
            <th>BPM</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(projects || []).map((p) => (
            <tr key={p.id} className="border-t">
              <td className="py-2 px-3"><SourceIcon project={p} /></td>
              <td className="py-2 px-3">{p.title || 'Untitled'}</td>
              <td className="py-2 px-3">{p.artist || '-'}</td>
              <td className="py-2 px-3">{p.key_signature || p.detected_key || '—'}</td>
              <td className="py-2 px-3">{p.bpm || '—'}</td>
              <td className="py-2 px-3">{p.status || (p.analysis_id ? 'Analyzed' : 'Pending')}</td>
              <td className="py-2 px-3">
                <div className="flex gap-2">
                  <Button
                    className="btn"
                    onClick={() => setSelectedProject(p)}
                    title="View details, play audio, and see lyrics"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    View
                  </Button>
                  <Button className="btn" onClick={() => onAnalyze(p)}>Analyze</Button>
                  <Button className="btn" onClick={() => onReAnalyze(p)}>Re-Analyze</Button>
                  <Button className="btn" onClick={() => onAttachMidi(p.id)}>Attach MIDI</Button>
                  <Button className="btn" onClick={() => onOpenSandbox(p)}>Open Sandbox</Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {selectedProject && (
      <ProjectDetailView
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
      />
    )}
    </>
  );
}
