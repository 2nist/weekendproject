import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { handleAsyncError, useAsyncOperation } from '../../utils/errorHandling';
import { LoadingSpinner, StatusIndicator } from '../../utils/errorHandling';

export default function PathConfiguration() {
  const [config, setConfig] = useState(null);

  const loadConfigOperation = useAsyncOperation(
    async () => {
      const result = await window.electronAPI.invoke('PATH:GET_CONFIG');
      if (result.success) {
        setConfig(result.config);
        return result.config;
      } else {
        throw new Error(result.error || 'Failed to load configuration');
      }
    },
    {
      onSuccess: (data) => {
        console.log('[PathConfiguration] Config loaded successfully');
      },
      onError: (error) => {
        console.error('[PathConfiguration] Failed to load config:', error.message);
      },
    },
  );

  useEffect(() => {
    loadConfigOperation.execute();
  }, []);

  async function selectDirectory(title, defaultPath) {
    try {
      const result = await window.electronAPI.invoke('PATH:SELECT_DIRECTORY', {
        title,
        defaultPath,
      });
      if (result.success && result.path) {
        return result.path;
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      const appError = handleAsyncError(error, 'PathConfiguration.selectDirectory');
      console.error('[PathConfiguration] Directory selection failed:', appError.message);
      // Show user-friendly error message
      alert(`Failed to select directory: ${appError.userMessage}`);
    }
    return null;
  }

  const enableGoogleDriveOperation = useAsyncOperation(
    async (selectedPath) => {
      const result = await window.electronAPI.invoke('PATH:ENABLE_GOOGLE_DRIVE', selectedPath);
      if (result.success) {
        await loadConfigOperation.execute();
        return result;
      } else {
        throw new Error(result.error || 'Failed to enable Google Drive');
      }
    },
    {
      onSuccess: () => {
        alert('Google Drive integration enabled!');
      },
      onError: (error) => {
        console.error('[PathConfiguration] Failed to enable Google Drive:', error.message);
        alert(`Failed to enable Google Drive: ${error.userMessage}`);
      },
    },
  );

  async function enableGoogleDrive() {
    const detectedPath = config?.detected?.googleDrive;
    const selectedPath = await selectDirectory(
      'Select Google Drive Root Folder',
      detectedPath || undefined,
    );

    if (selectedPath) {
      enableGoogleDriveOperation.execute(selectedPath);
    }
  }

  const disableCloudOperation = useAsyncOperation(
    async () => {
      const result = await window.electronAPI.invoke('PATH:DISABLE_CLOUD');
      if (result.success) {
        await loadConfigOperation.execute();
        return result;
      } else {
        throw new Error(result.error || 'Failed to disable cloud');
      }
    },
    {
      onSuccess: () => {
        alert('Cloud storage disabled');
      },
      onError: (error) => {
        console.error('[PathConfiguration] Failed to disable cloud:', error.message);
        alert(`Failed to disable cloud: ${error.userMessage}`);
      },
    },
  );

  async function disableCloud() {
    disableCloudOperation.execute();
  }

  const setCustomPathOperation = useAsyncOperation(
    async (type, selectedPath) => {
      const updates = {
        ...config,
        strategy: 'custom',
        custom: {
          ...config.custom,
          [type]: selectedPath,
        },
      };
      const result = await window.electronAPI.invoke('PATH:UPDATE_CONFIG', updates);
      if (result.success) {
        await loadConfigOperation.execute();
        return result;
      } else {
        throw new Error(result.error || 'Failed to update custom path');
      }
    },
    {
      onError: (error) => {
        console.error('[PathConfiguration] Failed to set custom path:', error.message);
        alert(`Failed to set custom path: ${error.userMessage}`);
      },
    },
  );

  async function setCustomPath(type) {
    const selectedPath = await selectDirectory(
      `Select ${type.toUpperCase()} Directory`,
      config?.custom?.[type] || config?.local?.[type],
    );

    if (selectedPath) {
      setCustomPathOperation.execute(type, selectedPath);
    }
  }

  const setStrategyOperation = useAsyncOperation(
    async (strategy) => {
      const updates = { ...config, strategy };
      const result = await window.electronAPI.invoke('PATH:UPDATE_CONFIG', updates);
      if (result.success) {
        await loadConfigOperation.execute();
        return result;
      } else {
        throw new Error(result.error || 'Failed to update strategy');
      }
    },
    {
      onError: (error) => {
        console.error('[PathConfiguration] Failed to update strategy:', error.message);
        alert(`Failed to update strategy: ${error.userMessage}`);
      },
    },
  );

  async function setStrategy(strategy) {
    setStrategyOperation.execute(strategy);
  }

  if (loadConfigOperation.loading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <LoadingSpinner />
        <span className="ml-2">Loading configuration...</span>
      </div>
    );
  }

  if (loadConfigOperation.error) {
    return (
      <div className="p-4">
        <div className="text-destructive mb-2">Failed to load configuration</div>
        <div className="text-sm text-muted-foreground mb-4">
          {loadConfigOperation.error.userMessage}
        </div>
        <Button onClick={() => loadConfigOperation.execute()} size="sm">
          Retry
        </Button>
      </div>
    );
  }

  if (!config) {
    return <div className="p-4 text-destructive">No configuration data available</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">File Storage Configuration</h2>
        <p className="text-muted-foreground">
          Configure where your audio files, MIDI files, and analysis data are stored.
        </p>
        <StatusIndicator
          operations={[
            loadConfigOperation,
            enableGoogleDriveOperation,
            disableCloudOperation,
            setCustomPathOperation,
            setStrategyOperation,
          ]}
        />
      </div>

      {/* Storage Strategy */}
      <div className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Storage Strategy</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={config.strategy === 'local'}
              onChange={() => setStrategy('local')}
              disabled={setStrategyOperation.loading}
            />
            <div>
              <div className="font-medium">Local Storage</div>
              <div className="text-sm text-muted-foreground">
                Fast, always available. Best for active projects.
              </div>
            </div>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={config.strategy === 'hybrid'}
              onChange={() => setStrategy('hybrid')}
              disabled={setStrategyOperation.loading || !config.cloud.enabled}
            />
            <div>
              <div className="font-medium">Hybrid (Local + Cloud)</div>
              <div className="text-sm text-muted-foreground">
                Audio/MIDI in cloud, cache/temp local. Requires cloud setup.
              </div>
            </div>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={config.strategy === 'custom'}
              onChange={() => setStrategy('custom')}
              disabled={setStrategyOperation.loading}
            />
            <div>
              <div className="font-medium">Custom Paths</div>
              <div className="text-sm text-muted-foreground">
                Manually configure each directory.
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Current Paths */}
      <div className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Active Paths</h3>
        <div className="space-y-2 text-sm font-mono">
          <div>
            <span className="font-bold">Audio:</span>
            <div className="bg-muted p-2 rounded mt-1">{config.local.audio}</div>
          </div>
          <div>
            <span className="font-bold">MIDI:</span>
            <div className="bg-muted p-2 rounded mt-1">{config.local.midi}</div>
          </div>
          <div>
            <span className="font-bold">JSON:</span>
            <div className="bg-muted p-2 rounded mt-1">{config.local.json}</div>
          </div>
          <div>
            <span className="font-bold">Cache:</span>
            <div className="bg-muted p-2 rounded mt-1">{config.local.cache}</div>
          </div>
        </div>
      </div>

      {/* Google Drive Integration */}
      <div className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Google Drive Integration</h3>

        {config.detected.googleDrive && (
          <div className="mb-3 p-3 bg-muted rounded">
            <div className="text-sm font-medium">Detected Google Drive:</div>
            <div className="text-sm font-mono mt-1">{config.detected.googleDrive}</div>
          </div>
        )}

        {config.cloud.enabled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="font-medium">Cloud storage enabled</span>
            </div>

            <div className="space-y-2 text-sm font-mono">
              <div>
                <span className="font-bold">Cloud Root:</span>
                <div className="bg-muted p-2 rounded mt-1">{config.cloud.root}</div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.cloud.syncOnImport}
                  onChange={async (e) => {
                    const updates = {
                      ...config,
                      cloud: { ...config.cloud, syncOnImport: e.target.checked },
                    };
                    await window.electronAPI.invoke('PATH:UPDATE_CONFIG', updates);
                    await loadConfig();
                  }}
                />
                Auto-backup to cloud on import
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.cloud.syncOnExport}
                  onChange={async (e) => {
                    const updates = {
                      ...config,
                      cloud: { ...config.cloud, syncOnExport: e.target.checked },
                    };
                    await window.electronAPI.invoke('PATH:UPDATE_CONFIG', updates);
                    await loadConfig();
                  }}
                />
                Auto-backup exports to cloud
              </label>
            </div>

            <Button
              onClick={disableCloud}
              disabled={disableCloudOperation.loading}
              variant="destructive"
              size="sm"
            >
              {disableCloudOperation.loading ? 'Disabling...' : 'Disable Cloud Storage'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enable Google Drive to backup files to the cloud. Files will still be stored locally
              for fast access.
            </p>
            <Button
              onClick={enableGoogleDrive}
              disabled={enableGoogleDriveOperation.loading}
              size="sm"
            >
              {enableGoogleDriveOperation.loading ? 'Enabling...' : 'Enable Google Drive'}
            </Button>
          </div>
        )}
      </div>

      {/* Custom Paths */}
      {config.strategy === 'custom' && (
        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Custom Directories</h3>
          <div className="space-y-3">
            {['audio', 'midi', 'json'].map((type) => (
              <div key={type}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium capitalize">{type}</span>
                  <Button
                    onClick={() => setCustomPath(type)}
                    disabled={setCustomPathOperation.loading}
                    size="sm"
                    variant="outline"
                  >
                    {setCustomPathOperation.loading ? 'Selecting...' : 'Select Directory'}
                  </Button>
                </div>
                <div className="text-sm font-mono bg-muted p-2 rounded">
                  {config.custom[type] || config.local[type]}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Organization */}
      <div className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">File Organization</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-2">Folder Structure</label>
            <select
              className="w-full p-2 border rounded"
              value={config.organization.structure}
              onChange={async (e) => {
                const updates = {
                  ...config,
                  organization: { ...config.organization, structure: e.target.value },
                };
                await window.electronAPI.invoke('PATH:UPDATE_CONFIG', updates);
                await loadConfig();
              }}
            >
              <option value="flat">Flat (all files in one folder)</option>
              <option value="by-project">By Project ID</option>
              <option value="by-artist">By Artist</option>
              <option value="by-date">By Date</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.organization.useTimestamps}
              onChange={async (e) => {
                const updates = {
                  ...config,
                  organization: { ...config.organization, useTimestamps: e.target.checked },
                };
                await window.electronAPI.invoke('PATH:UPDATE_CONFIG', updates);
                await loadConfig();
              }}
            />
            Include timestamps in filenames
          </label>
        </div>
      </div>
    </div>
  );
}
