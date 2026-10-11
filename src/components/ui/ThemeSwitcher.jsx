import React from 'react';

export default function ThemeSwitcher({ currentTheme, setTheme }) {
  const themes = [
    { id: 'standard', label: 'Standard' },
    { id: 'pretty', label: 'Pretty' },
    { id: 'manly', label: 'Manly' }
  ];

  const handleThemeChange = (themeId) => {
    setTheme(themeId);
    document.documentElement.setAttribute('data-theme', themeId);
  };

  return (
    <div className="flex gap-2">
      {themes.map((t) => (
        <button
          key={t.id}
          onClick={() => handleThemeChange(t.id)}
          className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${
            currentTheme === t.id
              ? 'bg-[var(--accent)] text-white'
              : 'border border-gray-500 opacity-70 hover:opacity-100'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
