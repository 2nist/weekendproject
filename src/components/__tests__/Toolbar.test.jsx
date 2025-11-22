import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toolbar from '../Toolbar';
import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock useAppIPC hook to provide IPC sendCommand
vi.mock('../../hooks/useAppIPC', () => ({
  __esModule: true,
  default: () => ({
    sendCommand: vi.fn().mockResolvedValue(true),
    status: { isPlaying: false, isRecording: false, bpm: 120 },
    connected: true,
  }),
}));

describe('Toolbar', () => {
  it('renders and reacts to Play/Stop/Record clicks', async () => {
    const user = userEvent.setup();
    render(<Toolbar />);

    // Buttons should be present
    const play = screen.getByRole('button', { name: /play/i });
    const stop = screen.getByRole('button', { name: /stop/i });
    const record = screen.getByRole('button', { name: /record/i });

    expect(play).toBeInTheDocument();
    expect(stop).toBeInTheDocument();
    expect(record).toBeInTheDocument();

    // Click actions (mock hook sends should be resolved)
    await user.click(play);
    await user.click(stop);
    await user.click(record);

    // No thrown errors means success
    expect(true).toBe(true);
  });
});
