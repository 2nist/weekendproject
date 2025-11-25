import React, { useMemo, useRef, useState } from 'react';
import { findSignificantPeaks, computeThreshold } from '@/utils/novelty';

/**
 * NoveltyCurveVisualizer
 * Renders the structural novelty curve with peaks & current section boundaries.
 * Clicking on the graph sends a manual split IPC request (prototype).
 */
export default function NoveltyCurveVisualizer({
  structuralMap,
  detectionMethod = 'mad',
  detectionParam = 1.5,
}) {
  const curve = structuralMap?.debug?.noveltyCurve || structuralMap?.debug?.novelty_curve || [];
  const sections = structuralMap?.sections || [];
  const [lastSplit, setLastSplit] = useState(null);
  const svgRef = useRef(null);

  const frameHop = 0.1; // seconds per frame (must match backend constant)

  const boundaries = useMemo(() => {
    return sections.map((s) => Math.round((s.time_range?.start_time || 0) / frameHop));
  }, [sections]);

  const maxVal = useMemo(() => curve.reduce((m, v) => (v > m ? v : m), 0) || 1, [curve]);

  const points = useMemo(() => {
    if (!curve.length) return '';
    const w = 800; // internal logical width
    const h = 160; // height
    return curve
      .map((v, i) => {
        const x = (i / (curve.length - 1)) * w;
        const y = h - (v / maxVal) * (h - 20) - 10; // padding top/bottom
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [curve, maxVal]);

  const significantPeaks = useMemo(() => {
    try {
      return findSignificantPeaks(curve, detectionMethod, detectionParam);
    } catch (e) {
      return [];
    }
  }, [curve, detectionMethod, detectionParam]);

  const thresholdVal = useMemo(() => {
    try {
      return computeThreshold(curve, detectionMethod, detectionParam);
    } catch (e) {
      return 0;
    }
  }, [curve, detectionMethod, detectionParam]);

  const handleClick = async (evt) => {
    if (!svgRef.current || !curve.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = evt.clientX - rect.left;
    const idx = Math.round((relX / rect.width) * (curve.length - 1));
    try {
      if (window?.electronAPI?.invoke) {
        const res = await window.electronAPI.invoke('ARCHITECT:FORCE_SPLIT', { frame: idx });
        if (res?.success) setLastSplit(idx);
      }
    } catch (e) {
      console.warn('Split invoke failed', e);
    }
  };

  return (
    <div className="space-y-2 p-3 rounded-md bg-slate-900/40 border border-slate-800">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-slate-200">Novelty Curve</h3>
        {lastSplit != null && (
          <div className="text-xs text-indigo-300">Manual split at frame {lastSplit}</div>
        )}
      </div>
      <div className="relative">
        <svg
          ref={svgRef}
          onClick={handleClick}
          role="button"
          aria-label="Novelty curve visualization"
          className="cursor-crosshair w-full h-40 select-none"
          viewBox="0 0 800 160"
          preserveAspectRatio="none"
        >
          <rect x="0" y="0" width="800" height="160" fill="hsl(var(--background)/0.6)" />
          <polyline
            points={points}
            fill="none"
            stroke="hsl(var(--music-dominant)/0.9)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {significantPeaks.map((idx) => {
            const x = (idx / (curve.length - 1)) * 800;
            const y = 160 - (curve[idx] / maxVal) * (160 - 20) - 10;
            return (
              <g key={`sig-peak-${idx}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={4}
                  fill="#ff7b72"
                  stroke="#fff"
                  strokeWidth={0.5}
                  onClick={async (evt) => {
                    evt.stopPropagation();
                    try {
                      if (window?.electronAPI?.invoke) {
                        await window.electronAPI.invoke('ARCHITECT:FORCE_SPLIT', { frame: idx });
                      }
                      setLastSplit(idx);
                    } catch (e) {
                      console.warn('Split invoke failed', e);
                    }
                  }}
                />
                <title>Significant novelty peak — click to stage split at frame {idx}</title>
              </g>
            );
          })}
          {boundaries.map((b, i) => {
            const x = (b / (curve.length - 1)) * 800;
            return (
              <g key={`boundary-${i}`}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={160}
                  stroke={i === 0 ? 'rgba(255,255,255,0.4)' : 'rgba(99,102,241,0.5)'}
                  strokeWidth={i === 0 ? 1 : 1.5}
                  strokeDasharray={i === 0 ? '4 4' : '0'}
                />
                {i > 0 && (
                  <text
                    x={x + 4}
                    y={14}
                    fontSize="10"
                    fill="#94a3b8"
                    style={{ pointerEvents: 'none' }}
                  >
                    {sections[i - 1]?.label || sections[i - 1]?.section_label || 'sec'}
                  </text>
                )}
              </g>
            );
          })}
          {/* Threshold Line */}
          {curve.length > 0 &&
            thresholdVal > 0 &&
            (() => {
              const H = 160;
              const thresholdY = 160 - (thresholdVal / maxVal) * (H - 20) - 10;
              return (
                <g>
                  <line
                    x1={0}
                    x2={800}
                    y1={thresholdY}
                    y2={thresholdY}
                    stroke="#ffb86b"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    opacity={0.8}
                  />
                  <text
                    x={10}
                    y={14}
                    fontSize="10"
                    fill="#ffb86b"
                    style={{ pointerEvents: 'none' }}
                  >
                    {`Threshold: ${thresholdVal.toFixed(3)} (${detectionMethod} ${detectionParam})`}
                  </text>
                </g>
              );
            })()}
          )}
        </svg>
        {!curve.length && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
            No novelty data available.
          </div>
        )}
      </div>
      <p className="text-[10px] leading-relaxed text-slate-500">
        Peaks in similarity change drive boundary proposals. Click anywhere to stage a manual split
        (prototype only).
      </p>
    </div>
  );
}
