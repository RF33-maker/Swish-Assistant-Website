import React from 'react';

interface ModeToggleProps {
  mode: string;
  setMode: (mode: string) => void;
}

const modes = ['general', 'scouting', 'post_game', 'social'];

const ModeToggle: React.FC<ModeToggleProps> = ({ mode, setMode }) => {
  return (
    <div className="flex space-x-2 mb-4">
      {modes.map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`px-3 py-1 text-sm rounded-full border 
            ${mode === m ? 'bg-blue-600 text-white' : 'bg-white text-black border-gray-300'}
          `}
        >
          {m.replace('_', ' ')}
        </button>
      ))}
    </div>
  );
};

export default ModeToggle;
