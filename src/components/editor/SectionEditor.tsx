/**
 * Section Editor
 * Inspector panel form for editing section properties
 * Opens when a section is selected (via right-click "Rename" or "Change Color")
 */

import React, { useEffect, useState } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { Button } from '@/components/ui/button';
import { Type, Palette, Save } from 'lucide-react';

const SECTION_COLORS = [
  { name: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { name: 'green', label: 'Green', class: 'bg-green-500' },
  { name: 'red', label: 'Red', class: 'bg-red-500' },
  { name: 'yellow', label: 'Yellow', class: 'bg-yellow-400' },
  { name: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { name: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { name: 'pink', label: 'Pink', class: 'bg-pink-500' },
  { name: 'gray', label: 'Gray', class: 'bg-gray-500' },
] as const;

export default function SectionEditor() {
  const { state, actions } = useEditor();
  const selection = state.selection;
  const section = selection?.data || {};
  const sectionId = selection?.id || section?.section_id || section?.id || 'unknown';

  const [label, setLabel] = useState(section?.section_label || section?.label || '');
  const [color, setColor] = useState(section?.color || 'blue');

  useEffect(() => {
    if (selection?.type === 'section') {
      setLabel(section?.section_label || section?.label || '');
      setColor(section?.color || 'blue');
    }
  }, [selection?.id, section?.section_id, section?.id, section?.section_label, section?.label, section?.color]);

  const handleSave = () => {
    if (!actions.updateSection) return;
    actions.updateSection(sectionId, { label, color });
  };

  const handleColorChange = (newColor: string) => {
    setColor(newColor);
    if (actions.updateSection) {
      actions.updateSection(sectionId, { color: newColor });
    }
  };

  if (!selection || selection.type !== 'section') {
    return (
      <div className="h-full p-4 text-muted-foreground text-sm">
        Select a section to edit its properties
      </div>
    );
  }

  return (
    <div className="h-full p-4 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Section Editor</h3>
          <p className="text-xs text-muted-foreground mt-1">Section ID: {sectionId}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Label Input */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            <Type className="h-4 w-4" />
            Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSave();
                e.currentTarget.blur();
              }
            }}
            className="w-full px-3 py-2 rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            placeholder="Verse, Chorus, Bridge, Intro, Outro"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Enter section label (e.g., Verse 1, Chorus, Bridge)
          </p>
        </div>

        {/* Color Picker */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Color
          </label>
          <div className="grid grid-cols-4 gap-2">
            {SECTION_COLORS.map((colorOption) => (
              <button
                key={colorOption.name}
                type="button"
                onClick={() => handleColorChange(colorOption.name)}
                className={`h-10 rounded-md border-2 transition-all ${
                  color === colorOption.name
                    ? 'border-foreground ring-2 ring-ring ring-offset-2'
                    : 'border-border hover:border-foreground/50'
                } ${colorOption.class}`}
                aria-label={`Color ${colorOption.label}`}
                title={colorOption.label}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Selected: <span className="font-medium capitalize">{color}</span>
          </p>
        </div>

        {/* Metadata Display */}
        {(section?.measures?.length !== undefined || section?.time_range) && (
          <div className="pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground space-y-1">
              {section?.measures?.length !== undefined && (
                <div>Measures: {section.measures.length}</div>
              )}
              {section?.time_range && (
                <div>
                  Time: {section.time_range.start_time?.toFixed(2)}s -{' '}
                  {section.time_range.end_time?.toFixed(2)}s
                </div>
              )}
              {section?.section_variant && (
                <div>Variant: {section.section_variant}</div>
              )}
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="pt-2">
          <Button onClick={handleSave} className="w-full" size="sm">
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
