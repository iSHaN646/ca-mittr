import { useState, useEffect, useRef } from 'react';
import './App.css';
import ImportPDF from './ImportPDF.jsx';

const BACKEND_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = `${BACKEND_BASE}/api`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const today = () => new Date().toISOString().split('T')[0];

const EMPTY_FORM = {
  date: today(),
  type: 'CR',
  name: '',
  debitAmount: '',
  creditAmount: '',
  remarks: '',
};

// ─── Seed data for local-storage fallback ────────────────────────────────────
const SEED = [
  { _id: 'ls-1', date: '2026-05-01', type: 'CR', name: 'Opening Balance', creditAmount: 50000, debitAmount: 0, closingBalance: 50000, remarks: 'Initial deposit', createdAt: new Date().toISOString() },
  { _id: 'ls-2', date: '2026-05-03', type: 'DR', name: 'Office Rent Payment', creditAmount: 0, debitAmount: 12000, closingBalance: 38000, remarks: 'May rent – Sector 4', createdAt: new Date().toISOString() },
  { _id: 'ls-3', date: '2026-05-07', type: 'CR', name: 'Client Invoice #1042 – ABC Corp', creditAmount: 75000, debitAmount: 0, closingBalance: 113000, remarks: '', createdAt: new Date().toISOString() },
  { _id: 'ls-4', date: '2026-05-12', type: 'DR', name: 'GST Payment Q1', creditAmount: 0, debitAmount: 18500, closingBalance: 94500, remarks: 'Challan #GST-2026-05', createdAt: new Date().toISOString() },
  { _id: 'ls-5', date: '2026-05-18', type: 'DR', name: 'Staff Salaries – May', creditAmount: 0, debitAmount: 32000, closingBalance: 62500, remarks: '4 employees', createdAt: new Date().toISOString() },
  { _id: 'ls-6', date: '2026-05-20', type: 'CR', name: 'Client Invoice #1048 – XYZ Ltd', creditAmount: 48000, debitAmount: 0, closingBalance: 110500, remarks: 'Advance payment', createdAt: new Date().toISOString() },
];

export default function App() {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);
  const [dbConnected, setDbConnected] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [printMode, setPrintMode] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState(null);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('ca_token') || null);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('ca_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [authMode, setAuthMode] = useState('login'); // login | register
  const [authStep, setAuthStep] = useState('credentials'); // credentials | otp
  const [authEmail, setAuthEmail] = useState('');
  const [authOtp, setAuthOtp] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authSuccess, setAuthSuccess] = useState(null);
  const tableRef = useRef(null);

  // ── Health Check ──────────────────────────────────────────────────────────
  const checkHealth = async () => {
    try {
      const res = await fetch(`${BACKEND_BASE}/`);
      const data = await res.json();
      setBackendOnline(true);
      const connected = !!(data.database && data.database.connected);
      setDbConnected(connected);
      setOfflineMode(!connected);
      return connected;
    } catch {
      setBackendOnline(false);
      setDbConnected(false);
      setOfflineMode(true);
      return false;
    }
  };

  // ── Fetch entries ─────────────────────────────────────────────────────────
  const fetchEntries = async (online) => {
    setIsLoading(true);
    if (online && token) {
      try {
        const res = await fetch(`${API_URL}/statements`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401) {
          handleLogout();
          setIsLoading(false);
          return;
        }
        const data = await res.json();
        setEntries(data.data || []);
      } catch {
        fallbackLoad();
      }
    } else {
      fallbackLoad();
    }
    setIsLoading(false);
  };

  const fallbackLoad = () => {
    const local = localStorage.getItem('ca_statements');
    setEntries(local ? JSON.parse(local) : SEED);
  };

  const persistLocal = (list) => localStorage.setItem('ca_statements', JSON.stringify(list));

  useEffect(() => {
    checkHealth().then((connected) => {
      if (token) {
        fetchEntries(connected);
      } else {
        setIsLoading(false);
      }
    });
  }, [token]);

  // ── Submit form (create / edit) ───────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.name.trim()) return;
    setSaving(true);
    setError(null);

    const payload = {
      date: form.date,
      type: form.type,
      name: form.name.trim(),
      debitAmount: form.type === 'DR' ? parseFloat(form.debitAmount) || 0 : 0,
      creditAmount: form.type === 'CR' ? parseFloat(form.creditAmount) || 0 : 0,
      remarks: form.remarks,
    };

    if (backendOnline && dbConnected && token) {
      try {
        const url = editing ? `${API_URL}/statements/${editing._id}` : `${API_URL}/statements`;
        const method = editing ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('API error');
        await fetchEntries(true);
      } catch (err) {
        setError('Server error — saved locally instead.');
        localUpsert(payload);
      }
    } else {
      localUpsert(payload);
    }

    setSaving(false);
    closeForm();
  };

  const localUpsert = (payload) => {
    let list = [...entries];
    if (editing) {
      list = list.map(e => e._id === editing._id ? { ...e, ...payload } : e);
    } else {
      const lastBal = list.length ? list[list.length - 1].closingBalance : 0;
      const closingBalance = payload.type === 'CR'
        ? lastBal + payload.creditAmount
        : lastBal - payload.debitAmount;
      list.push({ _id: 'ls-' + Date.now(), ...payload, closingBalance, createdAt: new Date().toISOString() });
    }
    setEntries(list);
    persistLocal(list);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!entryToDelete) return;
    const id = entryToDelete._id;
    if (backendOnline && dbConnected && token) {
      try {
        await fetch(`${API_URL}/statements/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        await fetchEntries(true);
      } catch {
        setError('Delete error — removing locally.');
        localDelete(id);
      }
    } else {
      localDelete(id);
    }
    setEntryToDelete(null);
  };

  const localDelete = (id) => {
    const list = entries.filter(e => e._id !== id);
    setEntries(list);
    persistLocal(list);
  };

  // ── Clear All ─────────────────────────────────────────────────────────────
  const handleClearAll = async () => {
    if (backendOnline && dbConnected && token) {
      try {
        await fetch(`${API_URL}/statements`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        await fetchEntries(true);
      } catch {
        setError('Clear All error — removing local data.');
        localClearAll();
      }
    } else {
      localClearAll();
    }
    setClearAllConfirmOpen(false);
  };

  const localClearAll = () => {
    setEntries([]);
    persistLocal([]);
  };

  // ── Authentication Actions ────────────────────────────────────────────────
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    const endpoint = authMode === 'register' ? 'register-request' : 'login-request';
    try {
      const res = await fetch(`${BACKEND_BASE}/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication request failed');
      
      setAuthSuccess(`OTP sent successfully! Please check your email inbox for the code.`);
      setAuthStep('otp');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      const res = await fetch(`${BACKEND_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, otpCode: authOtp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('ca_token', data.token);
      localStorage.setItem('ca_user', JSON.stringify(data.user));
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('ca_token');
    localStorage.removeItem('ca_user');
    setAuthStep('credentials');
    setAuthEmail('');
    setAuthOtp('');
    setAuthSuccess(null);
    setAuthError(null);
  };

  // ── Open modal ────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (entry) => {
    setEditing(entry);
    setForm({
      date: entry.date ? entry.date.split('T')[0] : today(),
      type: entry.type,
      name: entry.name,
      debitAmount: entry.debitAmount || '',
      creditAmount: entry.creditAmount || '',
      remarks: entry.remarks || '',
    });
    setFormOpen(true);
  };

  const closeForm = () => { setFormOpen(false); setEditing(null); };

  // ── Filters ───────────────────────────────────────────────────────────────
  const visible = entries.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.remarks && e.remarks.toLowerCase().includes(search.toLowerCase()));
    const matchType = filterType === 'all' || e.type === filterType;
    return matchSearch && matchType;
  });

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals = visible.reduce((acc, e) => {
    acc.debit += e.debitAmount || 0;
    acc.credit += e.creditAmount || 0;
    return acc;
  }, { debit: 0, credit: 0 });

  const closingBal = entries.length ? entries[entries.length - 1].closingBalance : 0;

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => { setPrintMode(true); setTimeout(() => { window.print(); setPrintMode(false); }, 200); };

  const showAuth = backendOnline && dbConnected && !token;

  if (showAuth) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-header">
            <div className="logo-mark">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="2" y="3" width="20" height="18" rx="2" />
                <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round"/>
              </svg>
            </div>
            <h1>CA-MITTR Ledger</h1>
            <p>Financial Statement Management Portal</p>
          </div>

          <div className="auth-tabs">
            <button type="button" className={`auth-tab ${authMode === 'login' ? 'active' : ''}`} onClick={() => { setAuthMode('login'); setAuthStep('credentials'); setAuthError(null); setAuthSuccess(null); }}>Login</button>
            <button type="button" className={`auth-tab ${authMode === 'register' ? 'active' : ''}`} onClick={() => { setAuthMode('register'); setAuthStep('credentials'); setAuthError(null); setAuthSuccess(null); }}>Register</button>
          </div>

          {authError && <div className="auth-alert error">⚠️ {authError}</div>}
          {authSuccess && <div className="auth-alert success">✔️ {authSuccess}</div>}

          {authStep === 'credentials' ? (
            <form onSubmit={handleAuthSubmit} className="auth-form">
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" placeholder="name@company.com" required value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
              </div>
              <button type="submit" className="btn-primary auth-submit" disabled={authLoading}>
                {authLoading ? 'Sending Request...' : authMode === 'register' ? 'Register Account' : 'Request OTP Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="auth-form">
              <p className="otp-info">We have sent a verification code to <strong>{authEmail}</strong>.</p>
              <div className="form-group">
                <label>Enter 6-Digit OTP</label>
                <input type="text" placeholder="000000" maxLength={6} required value={authOtp} onChange={e => setAuthOtp(e.target.value)} className="otp-input-field" />
              </div>
              <button type="submit" className="btn-primary auth-submit" disabled={authLoading}>
                {authLoading ? 'Verifying OTP...' : 'Verify & Access Ledger'}
              </button>
              <button type="button" className="btn-ghost auth-back-btn" onClick={() => setAuthStep('credentials')}>
                ← Back to Credentials
              </button>
            </form>
          )}


        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${printMode ? 'print-mode' : ''}`}>

      {/* ── TOP HEADER ───────────────────────────────────────────────────── */}
      <header className="top-bar no-print">
        <div className="top-bar-left">
          <div className="logo-mark">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="2" y="3" width="20" height="18" rx="2" />
              <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <h1 className="app-title">Account Statement Ledger</h1>
            <p className="app-sub">CA-MITTR · Financial Entry Management System</p>
          </div>
        </div>
        <div className="top-bar-right">
          {user && user.email && (
            <div className="user-profile-badge">
              <div className="avatar-circle">
                {user.email.slice(0, 2).toUpperCase()}
              </div>
              <span className="user-email">{user.email}</span>
            </div>
          )}
          <button className="btn-icon" title="Print Statement" onClick={handlePrint}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
          </button>
          <button className="btn-icon btn-import" title="Import PDF Statement" onClick={() => setImportOpen(true)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <polyline points="9 15 12 12 15 15"/>
            </svg>
            Import PDF
          </button>
          <button className="btn-clear-all" title="Clear All Ledger Records" onClick={() => setClearAllConfirmOpen(true)} disabled={entries.length === 0}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
            </svg>
            Clear All
          </button>
          <button className="btn-primary" onClick={openCreate}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Entry
          </button>
          {user && (
            <button className="btn-icon btn-logout" title="Sign Out" onClick={handleLogout}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* ── OFFLINE BANNER ────────────────────────────────────────────────── */}
      {offlineMode && (
        <div className={`banner no-print ${backendOnline ? 'warn' : 'err'}`}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {backendOnline
            ? <span>MongoDB Atlas not yet configured — entries are stored locally. Set <code>MONGODB_URI</code> in <code>backend/.env</code>.</span>
            : <span>Backend server offline (port 5000) — run <code>npm run dev</code> from project root. Showing local data.</span>}
        </div>
      )}

      {error && (
        <div className="banner err no-print">
          <span>{error}</span>
          <button className="banner-close" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ── SUMMARY CARDS ─────────────────────────────────────────────────── */}
      <section className="summary-strip no-print">
        <div className="s-card indigo">
          <span className="s-label">Total Entries</span>
          <span className="s-val">{entries.length}</span>
        </div>
        <div className="s-card green">
          <span className="s-label">Total Credits</span>
          <span className="s-val">₹ {fmt(entries.reduce((a, e) => a + (e.creditAmount || 0), 0))}</span>
        </div>
        <div className="s-card red">
          <span className="s-label">Total Debits</span>
          <span className="s-val">₹ {fmt(entries.reduce((a, e) => a + (e.debitAmount || 0), 0))}</span>
        </div>
        <div className={`s-card ${closingBal >= 0 ? 'teal' : 'orange'}`}>
          <span className="s-label">Closing Balance</span>
          <span className="s-val">₹ {fmt(closingBal)}</span>
        </div>
      </section>

      {/* ── CONTROLS ─────────────────────────────────────────────────────── */}
      <div className="controls-bar no-print">
        <div className="search-wrap">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search by name or remarks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="clear-btn" onClick={() => setSearch('')}>✕</button>}
        </div>
        <div className="type-tabs">
          {['all', 'CR', 'DR'].map(t => (
            <button
              key={t}
              className={`tab-btn ${filterType === t ? 'active' : ''} ${t === 'CR' ? 'cr' : t === 'DR' ? 'dr' : ''}`}
              onClick={() => setFilterType(t)}
            >
              {t === 'all' ? 'All' : t}
            </button>
          ))}
        </div>
        <span className="result-count">{visible.length} of {entries.length} entries</span>
      </div>

      {/* ── PRINT HEADER (only visible when printing) ─────────────────────── */}
      <div className="print-header print-only">
        <h2>Account Statement Ledger</h2>
        <p>Printed on: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
      </div>

      {/* ── TABLE ─────────────────────────────────────────────────────────── */}
      <div className="table-wrap">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>Loading entries…</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round"/>
            </svg>
            <h3>No entries found</h3>
            <p>{search || filterType !== 'all' ? 'Try clearing your filters.' : 'Click "New Entry" to add your first statement row.'}</p>
          </div>
        ) : (
          <table className="ledger-table" ref={tableRef}>
            <thead>
              <tr>
                <th className="col-no">#</th>
                <th className="col-date">Date</th>
                <th className="col-type">Type</th>
                <th className="col-name">Name / Narration</th>
                <th className="col-amt col-dr">Debit (₹)</th>
                <th className="col-amt col-cr">Credit (₹)</th>
                <th className="col-bal">Closing Balance (₹)</th>
                <th className="col-rem">Remarks</th>
                <th className="col-act no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry, idx) => (
                <tr key={entry._id} className={`ledger-row ${entry.type === 'CR' ? 'row-cr' : 'row-dr'}`}>
                  <td className="col-no td-num">{idx + 1}</td>
                  <td className="col-date td-date">{fmtDate(entry.date)}</td>
                  <td className="col-type">
                    <span className={`type-chip ${entry.type === 'CR' ? 'chip-cr' : 'chip-dr'}`}>
                      {entry.type}
                    </span>
                  </td>
                  <td className="col-name td-name">{entry.name}</td>
                  <td className="col-amt col-dr td-amt">
                    {entry.debitAmount > 0 ? fmt(entry.debitAmount) : '—'}
                  </td>
                  <td className="col-amt col-cr td-amt">
                    {entry.creditAmount > 0 ? fmt(entry.creditAmount) : '—'}
                  </td>
                  <td className={`col-bal td-bal ${entry.closingBalance >= 0 ? 'bal-pos' : 'bal-neg'}`}>
                    {fmt(entry.closingBalance)}
                  </td>
                  <td className="col-rem td-rem">{entry.remarks || '—'}</td>
                  <td className="col-act no-print">
                    <button className="row-btn edit-btn" title="Edit" onClick={() => openEdit(entry)}>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/>
                      </svg>
                    </button>
                    <button className="row-btn del-btn" title="Delete" onClick={() => setEntryToDelete(entry)}>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td colSpan="4" className="totals-label">TOTALS (filtered)</td>
                <td className="col-amt col-dr td-amt total-num">
                  {totals.debit > 0 ? fmt(totals.debit) : '—'}
                </td>
                <td className="col-amt col-cr td-amt total-num">
                  {totals.credit > 0 ? fmt(totals.credit) : '—'}
                </td>
                <td colSpan="3" className={`col-bal td-bal total-num ${closingBal >= 0 ? 'bal-pos' : 'bal-neg'}`}>
                  ₹ {fmt(closingBal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* ── MODAL ─────────────────────────────────────────────────────────── */}
      {formOpen && (
        <div className="modal-backdrop" onClick={e => { if (e.target.classList.contains('modal-backdrop')) closeForm(); }}>
          <div className="modal-box">
            <div className="modal-head">
              <h2>{editing ? 'Edit Entry' : 'New Statement Entry'}</h2>
              <button className="modal-close" onClick={closeForm}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className="entry-form">
              {/* Row 1: Date + Type */}
              <div className="form-row">
                <div className="fg">
                  <label htmlFor="f-date">Date *</label>
                  <input id="f-date" type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="fg">
                  <label>Type *</label>
                  <div className="type-toggle">
                    <button type="button" className={`tt-btn cr ${form.type === 'CR' ? 'active' : ''}`} onClick={() => setForm({ ...form, type: 'CR', debitAmount: '' })}>
                      CR &nbsp;Credit
                    </button>
                    <button type="button" className={`tt-btn dr ${form.type === 'DR' ? 'active' : ''}`} onClick={() => setForm({ ...form, type: 'DR', creditAmount: '' })}>
                      DR &nbsp;Debit
                    </button>
                  </div>
                </div>
              </div>

              {/* Name */}
              <div className="fg">
                <label htmlFor="f-name">Name / Narration *</label>
                <input id="f-name" type="text" required placeholder="e.g. Office Rent May 2026" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>

              {/* Amount */}
              <div className="fg">
                <label htmlFor="f-amt">{form.type === 'CR' ? 'Credit Amount (₹)' : 'Debit Amount (₹)'} *</label>
                <input
                  id="f-amt"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={form.type === 'CR' ? form.creditAmount : form.debitAmount}
                  onChange={e =>
                    setForm(form.type === 'CR'
                      ? { ...form, creditAmount: e.target.value }
                      : { ...form, debitAmount: e.target.value })
                  }
                />
              </div>

              {/* Remarks */}
              <div className="fg">
                <label htmlFor="f-rem">Remarks</label>
                <input id="f-rem" type="text" placeholder="Optional note…" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
              </div>

              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={closeForm}>Cancel</button>
                <button type="submit" className={`btn-primary ${saving ? 'saving' : ''}`} disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Update Entry' : 'Add Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="app-footer no-print">
        <span>CA-MITTR Account Statement System &copy; {new Date().getFullYear()}</span>
        <span>Node.js · Express · MongoDB Atlas · React</span>
      </footer>

      {importOpen && (
        <ImportPDF
          onClose={() => setImportOpen(false)}
          onImportDone={() => fetchEntries(backendOnline && dbConnected)}
          existingEntries={entries}
          token={token}
        />
      )}

      {/* Custom Delete Confirmation Modal */}
      {entryToDelete && (
        <div className="modal-backdrop" onClick={e => { if (e.target.classList.contains('modal-backdrop')) setEntryToDelete(null); }}>
          <div className="modal-box delete-modal">
            <div className="modal-head delete-modal-head">
              <div className="delete-title-wrap">
                <div className="delete-warn-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <h2>Delete Entry?</h2>
              </div>
              <button className="modal-close" onClick={() => setEntryToDelete(null)}>✕</button>
            </div>
            
            <div className="delete-modal-body">
              <p className="delete-warning-text">
                Are you sure you want to delete this transaction? This action is permanent and cannot be undone. 
                All subsequent closing balances will be recalculated automatically.
              </p>
              
              <div className="delete-entry-preview">
                <div className="preview-row">
                  <span className="preview-label">Narration:</span>
                  <span className="preview-value highlight">{entryToDelete.name}</span>
                </div>
                <div className="preview-row">
                  <span className="preview-label">Date:</span>
                  <span className="preview-value">{fmtDate(entryToDelete.date)}</span>
                </div>
                <div className="preview-row">
                  <span className="preview-label">Amount:</span>
                  <span className={`preview-value font-mono ${entryToDelete.type === 'CR' ? 'color-cr' : 'color-dr'}`}>
                    {entryToDelete.type} &nbsp;₹ {entryToDelete.type === 'CR' ? fmt(entryToDelete.creditAmount) : fmt(entryToDelete.debitAmount)}
                  </span>
                </div>
              </div>
            </div>

            <div className="form-actions delete-actions">
              <button type="button" className="btn-ghost" onClick={() => setEntryToDelete(null)}>Cancel</button>
              <button type="button" className="btn-danger" onClick={confirmDelete}>
                Delete Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Clear All Confirmation Modal */}
      {clearAllConfirmOpen && (
        <div className="modal-backdrop" onClick={e => { if (e.target.classList.contains('modal-backdrop')) setClearAllConfirmOpen(false); }}>
          <div className="modal-box delete-modal">
            <div className="modal-head delete-modal-head">
              <div className="delete-title-wrap">
                <div className="delete-warn-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <h2>Clear All Entries?</h2>
              </div>
              <button className="modal-close" onClick={() => setClearAllConfirmOpen(false)}>✕</button>
            </div>
            
            <div className="delete-modal-body">
              <p className="delete-warning-text">
                Are you sure you want to clear the entire ledger table? This action is permanent, cannot be undone, 
                and will delete all <strong>{entries.length}</strong> statement records currently in the database.
              </p>
            </div>

            <div className="form-actions delete-actions">
              <button type="button" className="btn-ghost" onClick={() => setClearAllConfirmOpen(false)}>Cancel</button>
              <button type="button" className="btn-danger" onClick={handleClearAll}>
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
