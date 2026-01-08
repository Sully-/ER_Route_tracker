import { useRef } from 'react';
import './Toolbar.css';

interface ToolbarProps {
  onLoadRoute: (file: File) => void;
  onClearRoute: () => void;
  onFocusRoute: () => void;
  hasRoute: boolean;
}

export default function Toolbar({
  onLoadRoute,
  onClearRoute,
  onFocusRoute,
  hasRoute,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadRoute(file);
    }
    // Reset input so same file can be loaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="toolbar">
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="file-input"
      />
      
      <button onClick={handleLoadClick} className="toolbar-btn">
        📂 Load Route
      </button>
      
      <button 
        onClick={onClearRoute} 
        className="toolbar-btn"
        disabled={!hasRoute}
      >
        🗑️ Clear
      </button>
      
      <button 
        onClick={onFocusRoute} 
        className="toolbar-btn"
        disabled={!hasRoute}
      >
        🎯 Focus Route
      </button>
    </div>
  );
}

