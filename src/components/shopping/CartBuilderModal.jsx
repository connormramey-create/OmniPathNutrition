import React, { useState } from 'react';
import { STORES, getItemUrl, openInStoreTab } from '../../services/retailService';

/**
 * Walks the shopping list item by item on the selected store.
 * Each "Open" reuses one store tab; the user taps "Add to cart" there, then "Added – Next".
 */
export default function CartBuilderModal({ storeId, items, addedKeys, onToggleAdded, onClose }) {
  const store = STORES[storeId];
  const firstPending = Math.max(0, items.findIndex(i => !addedKeys.includes(i.key)));
  const [index, setIndex] = useState(firstPending);
  const [popupBlocked, setPopupBlocked] = useState(false);

  const current = items[index];
  const doneCount = items.filter(i => addedKeys.includes(i.key)).length;
  const allDone = doneCount === items.length;

  const openCurrent = (item = current) => {
    if (!item) return;
    const ok = openInStoreTab(getItemUrl(storeId, item));
    setPopupBlocked(!ok);
  };

  const markAndNext = () => {
    if (!current) return;
    if (!addedKeys.includes(current.key)) onToggleAdded(current.key);
    const pending = (i, idx) => idx !== index && !addedKeys.includes(i.key);
    let nextIdx = items.findIndex((i, idx) => idx > index && pending(i, idx));
    if (nextIdx === -1) nextIdx = items.findIndex(pending); // wrap around to skipped items
    if (nextIdx !== -1) {
      setIndex(nextIdx);
      openCurrent(items[nextIdx]);
    } else {
      setIndex(items.length - 1);
    }
  };

  return (
    <div className="fixed inset-0 op-backdrop flex items-center justify-center p-4 z-50">
      <div className="op-modal p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start border-b border-gray-700 pb-2">
          <div>
            <h3 className="op-heading text-lg font-bold">Send list to {store.name} cart</h3>
            <p className="text-xs opacity-75">{doneCount} of {items.length} items added</p>
          </div>
          <button onClick={onClose} className="font-bold text-lg" aria-label="Close">×</button>
        </div>

        <div className="w-full h-2 bg-black/30 rounded overflow-hidden">
          <div className={`h-full ${store.color}`} style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }} />
        </div>

        {!allDone && current && (
          <div className="p-3 border border-gray-600 rounded space-y-3">
            <div>
              <p className="text-[10px] uppercase opacity-60">Item {index + 1} of {items.length}</p>
              <p className="text-base font-bold capitalize">{current.name}</p>
              <p className="text-xs opacity-80">Buy about {current.qtyLabel}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openCurrent()}
                className={`flex-1 py-2 text-xs font-bold text-white rounded ${store.color}`}
              >
                Open in {store.name} ↗
              </button>
              <button
                type="button"
                onClick={markAndNext}
                className="flex-1 py-2 text-xs font-bold border border-gray-500 rounded"
              >
                Added ✓ Next
              </button>
            </div>
            <p className="text-[10px] opacity-60">
              Tap "Add to cart" on the {store.name} page, then come back and press "Added ✓ Next". The next item opens in the same tab.
            </p>
          </div>
        )}

        {allDone && (
          <div className="p-3 border border-green-600 rounded text-xs space-y-2">
            <p className="font-bold">All items are marked as added.</p>
            <a href={store.cartUrl} target="_blank" rel="noreferrer" className={`block text-center py-2 font-bold text-white rounded ${store.color}`}>
              Review my {store.name} cart ↗
            </a>
          </div>
        )}

        {popupBlocked && (
          <p className="text-xs text-yellow-400">
            Your browser blocked the store tab. Allow pop-ups for this site, or use the item links below.
          </p>
        )}

        <div className="max-h-[220px] overflow-y-auto space-y-1 border-t border-gray-700 pt-3">
          {items.map((item, idx) => {
            const added = addedKeys.includes(item.key);
            return (
              <div
                key={item.key}
                className={`p-1.5 border rounded text-xs flex items-center gap-2 ${idx === index && !allDone ? 'border-[var(--accent)]' : 'border-gray-700'}`}
              >
                <input type="checkbox" checked={added} onChange={() => onToggleAdded(item.key)} aria-label={`Mark ${item.name} as added`} />
                <button type="button" onClick={() => setIndex(idx)} className={`flex-1 text-left capitalize ${added ? 'line-through opacity-50' : ''}`}>
                  {item.name} <span className="opacity-60 normal-case">· {item.qtyLabel}</span>
                </button>
                <a href={getItemUrl(storeId, item)} target="_blank" rel="noreferrer" className="text-[10px] underline opacity-80">
                  open
                </a>
              </div>
            );
          })}
        </div>

        <button onClick={onClose} className="w-full py-2 op-btn-primary text-xs font-bold rounded">
          Done
        </button>
      </div>
    </div>
  );
}
