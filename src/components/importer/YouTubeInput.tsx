import React, { useState } from 'react';
import Button from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';

export const YouTubeInput: React.FC<{
  onFileReady: (path: string) => void;
}> = ({ onFileReady }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const handleImport = async () => {
    if (!url) return;
    setLoading(true);
    try {
      // Use preload alias 'electron'
      const result = await globalThis.electron?.downloadYouTube?.(url);
      if (result?.success) {
        onFileReady(result.path);
      } else {
        console.error('Download failed', result?.error);
        alert('Download failed: ' + (result?.error || 'Unknown'));
      }
    } catch (e) {
      console.error(e);
      alert('Error downloading: ' + e?.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex gap-2 w-full max-w-md">
      <input
        placeholder="Paste YouTube URL..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="bg-slate-900 border-slate-800 text-white px-3 py-2 rounded w-full"
      />
      <Button
        onClick={handleImport}
        disabled={loading}
        className="bg-music-kick hover:bg-music-kick/80 text-black font-bold"
      >
        {loading ? (
          <Loader2 className="animate-spin w-4 h-4" />
        ) : (
          <Download className="w-4 h-4 mr-2" />
        )}
        Import
      </Button>
    </div>
  );
};

export default YouTubeInput;
