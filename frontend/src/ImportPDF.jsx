import { useState, useRef } from 'react';

const BACKEND_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API = `${BACKEND_BASE}/api`;
const fmt = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Convert YYYY-MM-DD to DD/MM/YYYY
const toDisplayDate = (isoStr) => {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length !== 3) return isoStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// Convert DD/MM/YYYY to YYYY-MM-DD
const toISODate = (displayStr) => {
  if (!displayStr) return '';
  const parts = displayStr.split('/');
  if (parts.length !== 3) return displayStr;
  const d = parts[0].slice(0, 2).padStart(2, '0');
  const m = parts[1].slice(0, 2).padStart(2, '0');
  const y = parts[2].slice(0, 4);
  return `${y}-${m}-${d}`;
};

export default function ImportPDF({ onImportDone, onClose, existingEntries, token }) {
  const [step, setStep] = useState('upload'); // upload | parsing | review | importing | done
  const [bank, setBank] = useState('');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [importProgress, setImportProgress] = useState(0);
  const fileRef = useRef(null);
  const dropRef = useRef(null);

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault();
    dropRef.current?.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') uploadFile(file);
    else setError('Please drop a PDF file.');
  };

  const handleDragOver = (e) => { e.preventDefault(); dropRef.current?.classList.add('drag-over'); };
  const handleDragLeave = () => dropRef.current?.classList.remove('drag-over');

  // ── Upload & Parse ─────────────────────────────────────────────────────────
  const uploadFile = async (file) => {
    setError('');
    setStep('parsing');
    const fd = new FormData();
    fd.append('pdf', file);
    try {
      const res = await fetch(`${API}/upload/parse`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) {
        const preview = data.rawTextPreview
          ? `\n\n--- Raw text preview (first 400 chars) ---\n${data.rawTextPreview.slice(0, 400)}`
          : '';
        throw new Error((data.error || 'Parse failed') + preview);
      }
      setRows(data.data.map((r, i) => ({ ...r, _lid: i, selected: true })));
      setBank(data.bank);
      setStep('review');
    } catch (err) {
      setError(err.message);
      setStep('upload');
    }
  };

  // ── Row editing ────────────────────────────────────────────────────────────
  const updateRow = (lid, field, val) => {
    setRows(rows.map(r => {
      if (r._lid !== lid) return r;
      const updated = { ...r, [field]: val };
      // Keep amounts consistent with type
      if (field === 'type') {
        if (val === 'DR') { updated.creditAmount = 0; updated.debitAmount = updated.debitAmount || updated.creditAmount; }
        else { updated.debitAmount = 0; updated.creditAmount = updated.creditAmount || updated.debitAmount; }
      }
      return updated;
    }));
  };

  const toggleRow = (lid) => setRows(rows.map(r => r._lid === lid ? { ...r, selected: !r.selected } : r));
  const toggleAll = () => { const allOn = rows.every(r => r.selected); setRows(rows.map(r => ({ ...r, selected: !allOn }))); };
  const deleteRow = (lid) => setRows(rows.filter(r => r._lid !== lid));

  // ── Submit selected rows ───────────────────────────────────────────────────
  const handleImport = async () => {
    if (dateValidationError) {
      setError(dateValidationError);
      return;
    }
    const selected = rows.filter(r => r.selected);
    if (!selected.length) { setError('Select at least one entry to import.'); return; }
    setError('');
    setStep('importing');
    let done = 0;
    for (const row of selected) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        await fetch(`${API}/statements`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            date: row.date,
            type: row.type,
            name: row.name,
            debitAmount: row.debitAmount,
            creditAmount: row.creditAmount,
            remarks: row.remarks || '',
          }),
        });
      } catch { /* continue even if one fails */ }
      done++;
      setImportProgress(Math.round((done / selected.length) * 100));
    }
    setStep('done');
    setTimeout(() => { onImportDone(); onClose(); }, 1200);
  };

  const selectedCount = rows.filter(r => r.selected).length;

  // ── Chronological Date Check ──────────────────────────────────────────────
  const earliestPDFDate = rows.length > 0
    ? rows.reduce((min, row) => {
        if (!row.date) return min;
        const d = new Date(row.date);
        return d < min ? d : min;
      }, new Date('9999-12-31'))
    : null;

  const maxExistingDate = existingEntries && existingEntries.length > 0
    ? existingEntries.reduce((max, entry) => {
        if (!entry.date) return max;
        const d = new Date(entry.date);
        return d > max ? d : max;
      }, new Date(0))
    : null;

  const dateValidationError = earliestPDFDate && maxExistingDate && earliestPDFDate < maxExistingDate
    ? `Chronological Error: The earliest transaction date in this PDF (${toDisplayDate(earliestPDFDate.toISOString().split('T')[0])}) is older than the latest existing ledger record (${toDisplayDate(maxExistingDate.toISOString().split('T')[0])}).`
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="modal-backdrop" onClick={e => e.target.classList.contains('modal-backdrop') && onClose()}>
      <div className="modal-box import-modal">

        {/* Header */}
        <div className="modal-head">
          <div>
            <h2>Import Bank Statement</h2>
            {bank && <p className="import-bank-tag">Detected: <strong>{bank.toUpperCase()} Bank</strong></p>}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div>
            <div
              ref={dropRef}
              className="drop-zone"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileRef.current.click()}
            >
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <polyline points="9 15 12 12 15 15"/>
              </svg>
              <p className="drop-title">Drag &amp; drop PDF here</p>
              <p className="drop-sub">or click to browse — HDFC, SBI, ICICI, Axis, Kotak</p>
              <input ref={fileRef} type="file" accept="application/pdf" hidden
                onChange={e => e.target.files[0] && uploadFile(e.target.files[0])} />
            </div>
            {error && <p className="import-error">{error}</p>}
            <div className="import-info-list">
              <p>✔ All transaction rows are editable before import</p>
              <p>✔ Closing balances are recalculated automatically</p>
            </div>
          </div>
        )}

        {/* Step: Parsing */}
        {step === 'parsing' && (
          <div className="import-center-state">
            <div className="spinner" />
            <p className="import-state-title">Parsing PDF…</p>
            <p className="import-state-sub">Extracting and classifying transactions</p>
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <div>
            <div className="review-controls">
              <p className="review-count">
                <strong>{selectedCount}</strong> of <strong>{rows.length}</strong> entries selected for import
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost btn-sm" onClick={() => { setRows([]); setStep('upload'); }}>← Re-upload</button>
                <button className="btn-primary btn-sm" onClick={handleImport} disabled={!selectedCount || !!dateValidationError}>
                  Import {selectedCount} {selectedCount === 1 ? 'Entry' : 'Entries'}
                </button>
              </div>
            </div>

            {dateValidationError && (
              <div className="import-error" style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong>⚠️ Chronological Validation Error</strong>
                <span>
                  The earliest transaction date in this PDF (<strong>{toDisplayDate(earliestPDFDate.toISOString().split('T')[0])}</strong>) 
                  is older than the latest transaction in your ledger (<strong>{toDisplayDate(maxExistingDate.toISOString().split('T')[0])}</strong>).
                </span>
                <span style={{ fontSize: '11.5px', opacity: 0.9 }}>
                  To maintain accurate running balances, statements must be imported in chronological order. Please adjust the transaction dates below or re-upload a chronological statement.
                </span>
              </div>
            )}

            {error && <p className="import-error">{error}</p>}

            <div className="review-table-wrap">
              <table className="review-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={rows.every(r => r.selected)} onChange={toggleAll} /></th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Name / Narration</th>
                    <th style={{ textAlign: 'right' }}>Debit</th>
                    <th style={{ textAlign: 'right' }}>Credit</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r._lid} className={r.selected ? '' : 'row-dim'}>
                      <td><input type="checkbox" checked={r.selected} onChange={() => toggleRow(r._lid)} /></td>

                      <td>
                        <input className="cell-input date-input" type="text" placeholder="DD/MM/YYYY"
                          value={toDisplayDate(r.date)}
                          onChange={e => updateRow(r._lid, 'date', toISODate(e.target.value))} />
                      </td>

                      <td>
                        <select className="cell-input type-select"
                          value={r.type}
                          onChange={e => updateRow(r._lid, 'type', e.target.value)}>
                          <option value="CR">CR</option>
                          <option value="DR">DR</option>
                        </select>
                      </td>

                      <td>
                        <input className="cell-input name-input" type="text" value={r.name}
                          onChange={e => updateRow(r._lid, 'name', e.target.value)} />
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        {r.type === 'DR' ? (
                          <input className="cell-input amt-input" type="number" min="0" step="0.01"
                            value={r.debitAmount || ''}
                            onChange={e => updateRow(r._lid, 'debitAmount', parseFloat(e.target.value) || 0)} />
                        ) : <span className="cell-dash">—</span>}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        {r.type === 'CR' ? (
                          <input className="cell-input amt-input" type="number" min="0" step="0.01"
                            value={r.creditAmount || ''}
                            onChange={e => updateRow(r._lid, 'creditAmount', parseFloat(e.target.value) || 0)} />
                        ) : <span className="cell-dash">—</span>}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <span className={r.closingBalance >= 0 ? 'bal-pos' : 'bal-neg'}>
                          {fmt(r.closingBalance || 0)}
                        </span>
                      </td>

                      <td>
                        <button className="row-btn del-btn" title="Remove row" onClick={() => deleteRow(r._lid)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <div className="import-center-state">
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width: `${importProgress}%` }} />
            </div>
            <p className="import-state-title">Importing… {importProgress}%</p>
            <p className="import-state-sub">Saving entries and recalculating balances</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="import-center-state">
            <div className="done-check">✓</div>
            <p className="import-state-title">Import Complete</p>
          </div>
        )}

      </div>
    </div>
  );
}
