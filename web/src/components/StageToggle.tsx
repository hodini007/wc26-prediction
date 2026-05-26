import React from 'react';

interface StageToggleProps {
  dynamic: boolean;
  setDynamic: (value: boolean) => void;
}

export default function StageToggle({ dynamic, setDynamic }: StageToggleProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDynamic(e.target.checked);
  };

  return (
    <div style={containerStyle}>
      <label style={labelStyle} htmlFor="dynamic-toggle">
        <span>Static Predictions</span>
        <input
          id="dynamic-toggle"
          type="checkbox"
          checked={dynamic}
          onChange={handleChange}
          style={checkboxStyle}
        />
        <span>Dynamic Predictions</span>
      </label>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  marginBottom: '1rem',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '1rem',
  color: 'var(--text-primary)',
};

const checkboxStyle: React.CSSProperties = {
  width: '40px',
  height: '20px',
  appearance: 'none',
  backgroundColor: '#ccc',
  borderRadius: '10px',
  position: 'relative',
  outline: 'none',
  cursor: 'pointer',
  transition: 'background 0.3s',
  ':checked': {
    backgroundColor: '#4f46e5',
  },
} as any;
