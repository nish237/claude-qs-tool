'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getAllProjects, deleteProject } from '@/lib/db';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fmtCurrency(n) {
  if (!n || isNaN(n) || n === 0) return null;
  return `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function calcGrandTotal(project) {
  if (!project.results?.takeoff) return 0;
  const rates = project.rates || {};

  const aiTotal = project.results.takeoff.reduce((sum, row) => {
    const key = `${row.elementType}__${row.layerCode}`;
    const r = parseFloat(rates[key]) || 0;
    return sum + (row.quantity || 0) * r;
  }, 0);

  const manualTotal = (project.manualItems || []).reduce((sum, item) => {
    const r = parseFloat(rates[`manual__${item.id}`]) || 0;
    return sum + (item.quantity || 0) * r;
  }, 0);

  return aiTotal + manualTotal;
}

export default function ProjectsDashboard() {
  const router = useRouter();
  const [projects, setProjects]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // project id to confirm

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAllProjects();
      setProjects(list);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleDelete = async (id) => {
    try {
      await deleteProject(id);
      setConfirmDelete(null);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error(err);
      alert('Failed to delete project.');
    }
  };

  const filtered = projects.filter(p =>
    !search ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.companyName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#eef2ff' }}>

      {/* Header */}
      <header style={{
        background: '#0d1b3e', padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 64, flexShrink: 0,
        boxShadow: '0 2px 12px rgba(13,27,62,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 8, background: '#f59e0b',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 13, color: '#0d1b3e', letterSpacing: '-0.5px',
          }}>QS</div>
          <div>
            <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>QuantSurv AI</div>
            <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 500 }}>My Projects</div>
          </div>
        </div>
        <button
          className="qs-btn qs-btn-primary qs-btn-sm"
          onClick={() => router.push('/')}
        >
          + New Analysis
        </button>
      </header>

      <main style={{ flex: 1, maxWidth: 1100, width: '100%', margin: '0 auto', padding: '32px 24px 48px' }}>

        {/* Page title + stats */}
        <div className="fade-in-up" style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d1b3e', marginBottom: 4 }}>My Projects</h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
              {projects.length} saved project{projects.length !== 1 ? 's' : ''} · stored locally in your browser
            </p>
          </div>
          {projects.length > 0 && (
            <input
              className="qs-input"
              placeholder="🔍 Search projects…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 240 }}
            />
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '64px 24px', color: '#94a3b8' }}>
            <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙</div>
            <div>Loading projects…</div>
          </div>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 && (
          <div className="qs-card fade-in" style={{ textAlign: 'center', padding: '64px 24px' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🏗</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0d1b3e', marginBottom: 8 }}>No saved projects yet</h2>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
              Start a new analysis, then click <strong>Save Project</strong> in the results screen to save it here.
            </p>
            <button className="qs-btn qs-btn-primary" onClick={() => router.push('/')}>
              Start New Analysis →
            </button>
          </div>
        )}

        {/* No search results */}
        {!loading && projects.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8', fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            No projects match &ldquo;{search}&rdquo;
          </div>
        )}

        {/* Project grid */}
        {!loading && filtered.length > 0 && (
          <div
            className="fade-in"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}
          >
            {filtered.map((project) => {
              const total = calcGrandTotal(project);
              const elementCount = project.results?.elements?.length || 0;
              const manualCount  = project.manualItems?.length || 0;

              return (
                <div
                  key={project.id}
                  className="qs-card"
                  style={{
                    padding: 0, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                    cursor: 'pointer',
                  }}
                  onClick={() => router.push(`/?pid=${project.id}`)}
                >
                  {/* Card top band */}
                  <div style={{ height: 6, background: 'linear-gradient(90deg, #0d1b3e, #1e3a5f)' }} />

                  <div style={{ padding: '18px 20px', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#0d1b3e', lineHeight: 1.3, flex: 1 }}>
                        {project.name || 'Unnamed Project'}
                      </div>
                      {total > 0 && (
                        <div style={{
                          fontSize: 13, fontWeight: 800, color: '#f59e0b',
                          marginLeft: 8, flexShrink: 0,
                        }}>
                          {fmtCurrency(total)}
                        </div>
                      )}
                    </div>

                    {project.companyName && (
                      <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 8 }}>
                        🏢 {project.companyName}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                      {project.scale && (
                        <span style={{ background: '#f0f4ff', color: '#374151', padding: '3px 9px', borderRadius: 12, fontSize: 11.5, fontWeight: 600 }}>
                          Scale {project.scale}
                        </span>
                      )}
                      {elementCount > 0 && (
                        <span style={{ background: '#d1fae5', color: '#065f46', padding: '3px 9px', borderRadius: 12, fontSize: 11.5, fontWeight: 600 }}>
                          {elementCount} element{elementCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {manualCount > 0 && (
                        <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 9px', borderRadius: 12, fontSize: 11.5, fontWeight: 600 }}>
                          +{manualCount} manual
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                      Updated {fmtDate(project.updatedAt)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{
                    padding: '12px 20px', borderTop: '1px solid #f1f5f9',
                    display: 'flex', gap: 8, background: '#f8f9fc',
                  }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      className="qs-btn qs-btn-navy qs-btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => router.push(`/?pid=${project.id}`)}
                    >
                      Open →
                    </button>
                    {confirmDelete === project.id ? (
                      <>
                        <button
                          className="qs-btn qs-btn-sm"
                          style={{ background: '#dc2626', color: '#fff' }}
                          onClick={() => handleDelete(project.id)}
                        >
                          Confirm
                        </button>
                        <button
                          className="qs-btn qs-btn-ghost qs-btn-sm"
                          onClick={() => setConfirmDelete(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="qs-btn qs-btn-ghost qs-btn-sm"
                        style={{ color: '#dc2626' }}
                        onClick={() => setConfirmDelete(project.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Browser storage notice */}
        {!loading && projects.length > 0 && (
          <div className="qs-card" style={{
            marginTop: 32, padding: '14px 20px',
            background: '#fffbeb', borderColor: '#fde68a',
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 18 }}>💾</span>
            <div>
              <strong style={{ fontSize: 13, color: '#92400e' }}>Browser Storage</strong>
              <p style={{ fontSize: 12.5, color: '#78350f', margin: '3px 0 0', lineHeight: 1.6 }}>
                Projects are stored in your browser&apos;s local IndexedDB. They are private to this
                device and browser. Clearing site data or switching browsers will remove them.
                Export to CSV or PDF to keep a permanent copy.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
