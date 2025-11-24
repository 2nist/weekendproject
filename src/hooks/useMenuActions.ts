/**
 * Phase 2: The Execution Bridge (Hooks)
 * Connects static Registry IDs to actual EditorContext functions
 */

import { useEditor } from '@/contexts/EditorContext';
import { useCallback } from 'react';
import logger from '@/lib/logger';

/**
 * Hook to execute menu actions
 * Bridges the gap between static config and live React state
 */
export function useMenuActions() {
  const { actions, state } = useEditor();

  /**
   * Execute an action by ID
   * @param actionId - Action ID from registry (e.g., 'beat.play')
   * @param targetId - Entity ID (beat ID, section ID, etc.)
   * @param data - Optional additional data (e.g., beat timestamp, section object)
   */
  const executeAction = useCallback(
    (actionId: string, targetId: string, data?: any) => {
      logger.debug('[useMenuActions] Executing action:', { actionId, targetId, data });

      switch (actionId) {
        // Beat Actions
        case 'beat.play': {
          // Audition: Seek to beat timestamp and play
          if (data?.timestamp !== undefined) {
            const timestamp = data.timestamp;
            // Seek to timestamp
            if (actions.setPlaybackTime) {
              actions.setPlaybackTime(timestamp);
            }
            // Start playback if not already playing
            if (!state.isPlaying && actions.togglePlayback) {
              actions.togglePlayback();
            }
            logger.debug('[useMenuActions] Audition beat at:', timestamp);
          } else {
            logger.warn('[useMenuActions] beat.play requires timestamp in data');
          }
          break;
        }

        case 'beat.edit': {
          // Edit Chord: Select beat to open Inspector
          if (actions.selectObject) {
            actions.selectObject('beat', targetId, data);
            logger.debug('[useMenuActions] Selected beat for editing:', targetId);
          }
          break;
        }

        case 'beat.toggleKick': {
          // Toggle Kick: Update drums
          if (actions.updateBeat && data) {
            const currentKick = data.drums?.hasKick || false;
            actions.updateBeat(targetId, { hasKick: !currentKick });
            logger.debug('[useMenuActions] Toggled kick:', !currentKick);
          }
          break;
        }

        case 'beat.toggleSnare': {
          // Toggle Snare: Update drums
          if (actions.updateBeat && data) {
            const currentSnare = data.drums?.hasSnare || false;
            actions.updateBeat(targetId, { hasSnare: !currentSnare });
            logger.debug('[useMenuActions] Toggled snare:', !currentSnare);
          }
          break;
        }

        // Section Actions
        case 'section.rename': {
          // Rename: Select section to open Inspector
          if (actions.selectObject) {
            actions.selectObject('section', targetId, data);
            logger.debug('[useMenuActions] Selected section for renaming:', targetId);
          }
          break;
        }

        case 'section.color': {
          // Change Color: Select section (Inspector will handle color picker)
          if (actions.selectObject) {
            actions.selectObject('section', targetId, data);
            logger.debug('[useMenuActions] Selected section for color change:', targetId);
          }
          break;
        }

        case 'section.split': {
          // Split Here: TODO - Implement section splitting
          logger.debug('[useMenuActions] Split section:', targetId);
          // This would need a new action in EditorContext
          // For now, just log
          break;
        }

        case 'section.delete': {
          // Delete: TODO - Implement section deletion
          logger.debug('[useMenuActions] Delete section:', targetId);
          // This would need a new action in EditorContext
          // For now, just log
          break;
        }

        default:
          logger.warn('[useMenuActions] Unknown action ID:', actionId);
      }
    },
    [actions, state.isPlaying],
  );

  return { executeAction };
}
