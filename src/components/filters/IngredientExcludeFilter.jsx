import React, { useMemo, useRef, useState } from 'react';
import { normalizeTerm } from '../../utils/ingredientFilter';

const MAX_SUGGESTIONS = 8;

/**
 * Searchable multi-select for ingredients to exclude.
 * - Type to search known ingredients, click or press Enter to add.
 * - Press Enter on text with no match to exclude any ingredient containing that word.
 * - Backspace on an empty box removes the last chip.
 */
export default function IngredientExcludeFilter({ options, selected, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef(null);

  const q = normalizeTerm(query);
  const suggestions = useMemo(() => {
    if (!q) return options.filter(o => !selected.includes(o)).slice(0, MAX_SUGGESTIONS);
    const starts = [];
    const contains = [];
    for (const o of options) {
      if (selected.includes(o)) continue;
      if (o.startsWith(q)) starts.push(o);
      else if (o.includes(q)) contains.push(o);
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [options, selected, q]);

  // "Exclude anything containing X" – listed first when X matches several ingredients
  // (e.g. "cheese"), otherwise after the single best match (e.g. "shri" → shrimp).
  const showCustom = q && !selected.includes(q) && !suggestions.includes(q);
  const listed = suggestions.map(v => ({ value: v }));
  const customRow = { custom: true, value: q };
  const rows = !showCustom ? listed : suggestions.length >= 2 ? [customRow, ...listed] : [...listed, customRow];

  const add = (term) => {
    const t = normalizeTerm(term);
    if (!t || selected.includes(t)) return;
    onChange([...selected, t]);
    setQuery('');
    setHighlight(0);
    inputRef.current?.focus();
  };

  const remove = (term) => onChange(selected.filter(s => s !== term));

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight(h => Math.min(h + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[highlight];
      if (open && row) add(row.value);
      else if (q) add(q);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !query && selected.length) {
      remove(selected[selected.length - 1]);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label htmlFor="excludeIngredientInput" className="text-xs font-bold uppercase">Exclude Ingredients</label>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-[10px] underline opacity-70 hover:opacity-100">
            Clear all
          </button>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Excluded ingredients">
          {selected.map(term => (
            <span key={term} className="op-chip op-btn-primary op-active inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-[11px] font-semibold capitalize">
              {term}
              <button
                type="button"
                onClick={() => remove(term)}
                className="leading-none px-1 opacity-80 hover:opacity-100"
                aria-label={`Stop excluding ${term}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          id="excludeIngredientInput"
          type="text"
          role="combobox"
          aria-expanded={open && rows.length > 0}
          aria-controls="excludeIngredientList"
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={selected.length ? 'Add another ingredient…' : 'Search ingredients to exclude…'}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="w-full p-1.5 text-xs rounded border border-gray-600 bg-transparent"
        />
        {open && rows.length > 0 && (
          <ul
            id="excludeIngredientList"
            role="listbox"
            className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto p-1 z-30 text-xs shadow-lg rounded border"
            style={{ background: 'var(--modal-bg)', borderColor: 'var(--border-color)', color: 'var(--text-main)' }}
          >
            {rows.map((row, i) => (
              <li
                key={`${row.custom ? 'custom-' : ''}${row.value}`}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => { e.preventDefault(); add(row.value); }}
                onMouseEnter={() => setHighlight(i)}
                className={`px-2 py-1 rounded cursor-pointer ${row.custom ? '' : 'capitalize'} ${i === highlight ? 'op-toggle' : ''}`}
              >
                {row.custom ? <>Exclude anything containing “<strong>{row.value}</strong>”</> : row.value}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[10px] opacity-60">
        Recipes with these ingredients are hidden here and skipped by the meal plan generator.
      </p>
    </div>
  );
}
