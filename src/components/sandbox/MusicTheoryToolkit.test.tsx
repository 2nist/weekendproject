import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MusicTheoryToolkit } from './MusicTheoryToolkit';

describe('MusicTheoryToolkit', () => {
  it('renders scale degrees for the selected key and mode', () => {
    render(<MusicTheoryToolkit keyCenter="C" mode="major" />);
    expect(screen.getByText(/I: C/)).toBeInTheDocument();
    expect(screen.getByText(/V: G/)).toBeInTheDocument();
  });

  it('invokes callback when a chord button is clicked', () => {
    const onAppend = vi.fn();
    render(<MusicTheoryToolkit keyCenter="C" mode="major" onAppendProgression={onAppend} />);

    const chordButton = screen.getByRole('button', { name: /Cmaj7/i });
    fireEvent.click(chordButton);

    expect(onAppend).toHaveBeenCalledTimes(1);
    expect(onAppend).toHaveBeenCalledWith(['I']);
  });
});
