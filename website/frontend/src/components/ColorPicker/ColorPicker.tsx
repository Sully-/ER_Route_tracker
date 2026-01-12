import { useEffect, useRef } from 'react';
import './ColorPicker.css';

interface ColorPickerProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
  onClose: () => void;
}

// Palette de couleurs en dégradé (rouge → orange → jaune → vert → cyan → bleu → violet → magenta)
const COLOR_PALETTE = [
  '#ff0000', '#ff4400', '#ff8800', '#ffaa00', // Rouge → Orange
  '#ffff00', '#aaff00', '#00ff00', '#00ff88', // Jaune → Vert
  '#00ffaa', '#00ffff', '#0088ff', '#0044ff', // Cyan → Bleu
  '#0000ff', '#4400ff', '#8800ff', '#ff00ff', // Bleu foncé → Violet → Magenta
];

export default function ColorPicker({ selectedColor, onColorSelect, onClose }: ColorPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Fermer le picker si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div className="color-picker-overlay" onClick={onClose}>
      <div className="color-picker-container" ref={containerRef} onClick={(e) => e.stopPropagation()}>
        <div className="color-picker-header">
          <span className="color-picker-title">Sélectionner une couleur</span>
          <button className="color-picker-close" onClick={onClose} title="Fermer">
            ×
          </button>
        </div>
        <div className="color-picker-grid">
          {COLOR_PALETTE.map((color, index) => (
            <button
              key={index}
              className={`color-picker-swatch ${selectedColor === color ? 'selected' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => {
                onColorSelect(color);
                onClose();
              }}
              title={color}
            >
              {selectedColor === color && (
                <span className="color-picker-checkmark">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
