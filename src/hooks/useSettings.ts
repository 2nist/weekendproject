import { useState, useEffect, useCallback } from 'react';
import logger from '@/lib/logger';

export interface Settings {
  reaper_port?: string;
  ableton_port?: string;
  default_bpm?: string;
  track_list?: string;
  [key: string]: string | undefined;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Check if IPC is available
      if (!window?.ipc?.invoke) {
        logger.warn('IPC not available, settings will not load');
        setSettings({});
        setLoading(false);
        return;
      }
      const res = await window.ipc.invoke('DB:GET_SETTINGS');
      if (res && res.success) {
        setSettings(res.settings || {});
      } else {
        setError(res?.error || 'Failed to load settings');
        // Set empty settings as fallback
        setSettings({});
      }
    } catch (err) {
      logger.error('Error loading settings:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Set empty settings as fallback
      setSettings({});
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSetting = useCallback(async (key: string, value: string) => {
    try {
      const res = await window.ipc.invoke('DB:SET_SETTING', { key, value });
      if (res && res.success) {
        setSettings((prev) => ({ ...prev, [key]: value }));
        // Broadcast a settings event so other hook instances can update
        try {
          const evt = new CustomEvent('APP:SETTING_UPDATED', { detail: { key, value } });
          window.dispatchEvent(evt);
        } catch (e) {
          // Ignore, not all environments support CustomEvent
        }
        return { success: true };
      } else {
        return { success: false, error: res?.error || 'Failed to update setting' };
      }
    } catch (err) {
      logger.error('Error updating setting:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, []);

  useEffect(() => {
    loadSettings();
    // Listen for setting updates from other components and update local state
    const handleSettingUpdated = (ev: any) => {
      const { key, value } = ev.detail || {};
      if (key) setSettings((prev) => ({ ...prev, [key]: value }));
    };
    window.addEventListener('APP:SETTING_UPDATED', handleSettingUpdated);
    return () => {
      window.removeEventListener('APP:SETTING_UPDATED', handleSettingUpdated);
    };
  }, [loadSettings]);

  return {
    settings,
    loading,
    error,
    loadSettings,
    updateSetting,
  };
}
