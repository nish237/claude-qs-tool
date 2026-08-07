'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { saveProject, getProject, getAllProjects } from '@/lib/db';
import { saveRatesToLibrary, loadRateLibrary, saveCompanyDefaults, loadCompanyDefaults } from '@/lib/rates';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const SCALES = [
  '1:20', '1:25', '1:50', '1:100', '1:200',
  '1:250', '1:500', '1:1000', '1:1250', '1:2500',
];
const UNITS = ['m', 'mm', 'ft'];
const MANUAL_UNITS = ['m', 'm2', 'm3', 'nr', 'item'];

const ELEMENT_COLORS = {
  'A-WALL-INT':  '#ef4444',
  'A-FLOOR':     '#3b82f6',
  'A-CEIL':      '#22c55e',
  'A-DECO':      '#a855f7',
  'A-WALL-EXT':  '#f97316',
  'A-BRICKWORK': '#f97316',
  'MANUAL':      '#d97706',
  'DEFAULT':     '#64748b',
};

const ANALYSIS_STEPS = [
  'Uploading drawing…',
  'Identifying construction elements…',
  'Measuring quantities…',
  'Building takeoff table…',
  'Complete',
];

const TRADE_GROUPS = {
  'A-WALL':     'Walls & Drylining',
  'A-FLOOR':    'Flooring',
  'A-CEIL':     'Ceilings',
  'A-DECO':     'Decoration & Painting',
  'A-BRICKWORK':'Brickwork & Blockwork',
  'MANUAL':     'Manual Items',
};

const MAX_FILE_MB = 25;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function getRateKey(item) {
  return `${item.elementType}__${item.layerCode}`;
}

function fmt(n, d = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toFixed(d);
}

function fmtCurrency(n) {
  if (!n || isNaN(n)) return '—';
  return `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getElementColor(layerCode) {
  return ELEMENT_COLORS[layerCode] || ELEMENT_COLORS.DEFAULT;
}

function getTradeGroup(layerCode) {
  const prefix = (layerCode || '').split('-').slice(0, 2).join('-');
  return TRADE_GROUPS[prefix] || 'Other Works';
}

function confidenceBadge(conf) {
  const c = (conf || 'MEDIUM').toUpperCase();
  if (c === 'HIGH')  return <span className="badge-high">HIGH</span>;
  if (c === 'LOW')   return <span className="badge-low">LOW</span>;
  return <span className="badge-medium">MEDIUM</span>;
}

function newAuditEntry(action, details) {
  return { id: Math.random().toString(36).slice(2), timestamp: new Date().toISOString(), action, details };
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export default function QSDrawingAnalyser() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // ── Navigation ──
  const [screen, setScreen] = useState('upload');

  // ── File ──
  const [file, setFile]           = useState(null);
  const [fileBase64, setFileBase64]     = useState('');
  const [fileMediaType, setFileMediaType] = useState('');
  const [isDragging, setIsDragging]     = useState(false);
  const [previewUrl, setPreviewUrl]     = useState('');
  const [fileIsImage, setFileIsImage]   = useState(false);
  const [fileIsPdf, setFileIsPdf]       = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');

  // ── Company ──
  const [companyName,  setCompanyName]  = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');

  // ── Project ──
  const [projectName, setProjectName] = useState('');
  const [scale, setScale]             = useState('1:100');
  const [unit, setUnit]               = useState('m');

  // ── Calibration ──
  const [calibMode,   setCalibMode]   = useState(false);
  const [calibPoints, setCalibPoints] = useState([]);
  const [pixelDist,   setPixelDist]   = useState(null);
  const [realDim,     setRealDim]     = useState('');
  const [pixPerUnit,  setPixPerUnit]  = useState(null);

  // ── Output selector ──
  const [exportSecs, setExportSecs] = useState({ lengths: true, rooms: true, takeoff: true });

  // ── Analysis ──
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStepIdx,  setAnalysisStepIdx]  = useState(0);
  const [analysisError,    setAnalysisError]    = useState('');

  // ── Results ──
  const [results,     setResults]     = useState(null);
  const [activeTab,   setActiveTab]   = useState('lengths');
  const [rates,       setRates]       = useState({});
  const [showOverlay, setShowOverlay] = useState(false);

  // ── Phase 2: Project saving ──
  const [savedProjectId, setSavedProjectId] = useState(null);
  const [isSaving,       setIsSaving]       = useState(false);
  const [saveToast,      setSaveToast]      = useState(''); // '' | 'saving' | 'saved' | 'error'
  const [auditLog,       setAuditLog]       = useState([]);

  // ── Phase 2: Manual items ──
  const [manualItems,    setManualItems]    = useState([]);
  const [showAddManual,  setShowAddManual]  = useState(false);
  const [newManual, setNewManual] = useState({ description: '', quantity: '', unit: 'm' });

  // ── Phase 2: Rate library toast ──
  const [rateLibToast, setRateLibToast] = useState('');

  // ── Calibration warning (replaces window.confirm) ──
  const [calibWarning, setCalibWarning] = useState('');
  // ── PDF render failure ──
  const [pdfRenderFailed, setPdfRenderFailed] = useState(false);

  // ── Interactive canvas / split view ──
  const [selectedElementIdx, setSelectedElementIdx] = useState(null);
  const [showMeasurementLabels, setShowMeasurementLabels] = useState(true);

  // ── Sidebar ──
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarProjects, setSidebarProjects] = useState([]);

  // ── Refs ──
  const calibCanvasRef      = useRef(null);
  const calibImgRef         = useRef(null);
  const overlayCanvasRef    = useRef(null);
  const fileInputRef        = useRef(null);
  const progressTimer       = useRef(null);
  const interactiveCanvasRef = useRef(null);
  const listPanelRef        = useRef(null);

  // ─────────────────────────────────────────────
  // Boot: load company defaults from localStorage
  // ─────────────────────────────────────────────
  useEffect(() => {
    const defaults = loadCompanyDefaults();
    if (defaults) {
      setCompanyName(defaults.companyName || '');
      setCompanyEmail(defaults.companyEmail || '');
      setCompanyPhone(defaults.companyPhone || '');
    }
  }, []);

  // Boot: load saved project from URL ?pid=
  useEffect(() => {
    const pid = searchParams.get('pid');
    if (!pid) return;
    getProject(pid).then(project => {
      if (!project) return;
      setSavedProjectId(project.id);
      setProjectName(project.name || '');
      setCompanyName(project.companyName || '');
      setCompanyEmail(project.companyEmail || '');
      setCompanyPhone(project.companyPhone || '');
      setScale(project.scale || '1:100');
      setUnit(project.unit || 'm');
      setPixPerUnit(project.pixPerUnit || null);
      setResults(project.results || null);
      setRates(project.rates || {});
      setManualItems(project.manualItems || []);
      setAuditLog(project.auditLog || []);
      setExportSecs(project.exportSecs || { lengths: true, rooms: true, takeoff: true });
      if (project.results) setScreen('results');
    }).catch(console.error);
  }, [searchParams]);

  // ─────────────────────────────────────────────
  // File processing
  // ─────────────────────────────────────────────
  const processFile = useCallback((f) => {
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      alert(`File is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_MB} MB.`);
      return;
    }
    const isImage = f.type.startsWith('image/');
    const isPdf   = f.type === 'application/pdf';
    if (!isImage && !isPdf) {
      alert('Unsupported file type. Please upload a PDF, PNG, JPG, or WebP drawing.');
      return;
    }
    setFile(f);
    setFileMediaType(f.type);
    setFileIsImage(isImage);
    setFileIsPdf(isPdf);
    setCalibPoints([]);
    setPixelDist(null);
    setRealDim('');
    setPixPerUnit(null);
    setCalibMode(false);
    setPdfPreviewUrl('');
    setCalibWarning('');
    setPdfRenderFailed(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setPreviewUrl(dataUrl);
      setFileBase64(dataUrl.split(',')[1]);
      if (isPdf) {
        renderPdfToCanvas(dataUrl)
          .then(url => {
            if (url) { setPdfPreviewUrl(url); setPdfRenderFailed(false); }
            else setPdfRenderFailed(true);
          })
          .catch(() => setPdfRenderFailed(true));
      }
    };
    reader.readAsDataURL(f);
  }, []);

  const renderPdfToCanvas = async (pdfDataUrl) => {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
      }
      const pdfData = pdfDataUrl.split(',')[1];
      const pdf  = await pdfjs.getDocument({ data: atob(pdfData) }).promise;
      const page = await pdf.getPage(1);
      const MAX_DIM = 3000;
      const vp0 = page.getViewport({ scale: 1 });
      const scaleFactor = Math.min(2, MAX_DIM / Math.max(vp0.width, vp0.height));
      const viewport = page.getViewport({ scale: scaleFactor });
      const canvas  = document.createElement('canvas');
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return canvas.toDataURL('image/png');
    } catch (err) {
      console.warn('PDF render failed:', err);
      return '';
    }
  };

  const handleDragOver  = useCallback((e) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop      = useCallback((e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }, [processFile]);
  const handleFileInputChange = useCallback((e) => { const f = e.target.files[0]; if (f) processFile(f); e.target.value = ''; }, [processFile]);

  // ─────────────────────────────────────────────
  // Canvas calibration
  // ─────────────────────────────────────────────
  const canvasSourceUrl = useMemo(() => {
    if (fileIsImage) return previewUrl;
    if (fileIsPdf && pdfPreviewUrl) return pdfPreviewUrl;
    return '';
  }, [fileIsImage, previewUrl, fileIsPdf, pdfPreviewUrl]);

  useEffect(() => {
    if (!canvasSourceUrl) return;
    const img = new Image();
    img.onload = () => { calibImgRef.current = img; redrawCanvas(img, calibPoints, pixPerUnit); };
    img.src = canvasSourceUrl;
  }, [canvasSourceUrl]); // eslint-disable-line

  const redrawCanvas = useCallback((imgArg, pointsArg, ppu) => {
    const canvas = calibCanvasRef.current;
    const img    = imgArg    ?? calibImgRef.current;
    const points = pointsArg ?? calibPoints;
    if (!canvas || !img) return;
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const R  = Math.max(10, canvas.width / 120);
    const LW = Math.max(2, canvas.width / 600);
    const FS = Math.max(14, canvas.width / 60);

    points.forEach((pt, i) => {
      ctx.beginPath(); ctx.arc(pt.x, pt.y, R, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = LW * 1.5; ctx.stroke();
      ctx.fillStyle = '#0d1b3e'; ctx.font = `bold ${FS}px Sora, sans-serif`;
      ctx.shadowColor = 'rgba(255,255,255,0.8)'; ctx.shadowBlur = 4;
      ctx.fillText(`P${i + 1}`, pt.x + R + 4, pt.y - R / 2);
      ctx.shadowBlur = 0;
    });

    if (points.length === 2) {
      const [p1, p2] = points;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = LW * 2;
      ctx.setLineDash([LW * 8, LW * 4]); ctx.stroke(); ctx.setLineDash([]);
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      const dist = Math.round(Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2));
      const label = `${dist}px`;
      ctx.font = `bold ${FS * 0.85}px JetBrains Mono, monospace`;
      const lw = ctx.measureText(label).width + 12;
      const bx = mx - lw / 2, by = my - FS - 4, bw = lw, bh = FS + 10;
      ctx.fillStyle = 'rgba(13,27,62,0.85)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 4);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.fillStyle = '#f59e0b'; ctx.textAlign = 'center'; ctx.fillText(label, mx, my); ctx.textAlign = 'left';
    }

    if (ppu && ppu > 0) {
      const nice = [0.1,0.2,0.25,0.5,1,2,2.5,5,10,20,25,50,100,200,500,1000];
      const maxReal = canvas.width / ppu;
      const rulerLen = nice.find(v => maxReal / 5 <= v) || 1000;
      const rulerPx = rulerLen * ppu;
      const rx = 20, ry = canvas.height - 24;
      const RH = Math.max(8, canvas.height / 80);
      ctx.fillStyle = 'rgba(13,27,62,0.85)'; ctx.fillRect(rx, ry - RH, rulerPx, RH);
      ctx.fillStyle = '#f59e0b'; ctx.font = `bold ${FS * 0.85}px Sora, sans-serif`;
      ctx.fillText(`${rulerLen}${unit}`, rx + rulerPx + 6, ry);
    }
  }, [calibPoints, pixPerUnit, unit]);

  useEffect(() => { if (calibImgRef.current) redrawCanvas(calibImgRef.current, calibPoints, pixPerUnit); }, [calibPoints, pixPerUnit, redrawCanvas]);

  const getCanvasPoint = (e) => {
    const canvas = calibCanvasRef.current;
    if (!canvas) return null;
    const rect   = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    const src    = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  };

  const handleCanvasClick = useCallback((e) => {
    if (!calibMode || !calibCanvasRef.current) return;
    e.preventDefault();
    const pt = getCanvasPoint(e);
    if (!pt) return;
    if (calibPoints.length === 0) {
      setCalibPoints([pt]);
    } else if (calibPoints.length === 1) {
      const [p1] = calibPoints;
      const dist = Math.sqrt((pt.x - p1.x) ** 2 + (pt.y - p1.y) ** 2);
      setCalibPoints([p1, pt]);
      setPixelDist(dist);
      setCalibMode(false);
    }
  }, [calibMode, calibPoints]);

  const resetCalibration = () => {
    setCalibPoints([]); setPixelDist(null); setRealDim(''); setPixPerUnit(null); setCalibMode(false);
    if (calibImgRef.current) redrawCanvas(calibImgRef.current, [], null);
  };

  const confirmCalibration = useCallback(() => {
    const dim = parseFloat(realDim);
    if (calibPoints.length !== 2 || !dim || dim <= 0 || !pixelDist) return;
    const ppu = pixelDist / dim;
    // Thresholds vary by unit: mm drawings can legitimately have ppu < 1
    const minPpu = unit === 'mm' ? 0.0001 : unit === 'ft' ? 0.01 : 0.05;
    if (ppu < minPpu || ppu > 100000) {
      setCalibWarning(`Unusual scale detected: 1 pixel = ${(1/ppu).toFixed(6)} ${unit}. If this looks wrong, click Reset and re-pick your two points with the correct real dimension.`);
    } else {
      setCalibWarning('');
    }
    setPixPerUnit(ppu);
  }, [calibPoints, pixelDist, realDim, unit]);

  // ─────────────────────────────────────────────
  // Analysis
  // ─────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    if (!file || !fileBase64) return;
    setScreen('analysing');
    setAnalysisError('');
    setAnalysisProgress(0);
    setAnalysisStepIdx(0);

    let progress = 0, stepIdx = 0;
    const targets = [12, 38, 68, 92];
    clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      if (stepIdx < targets.length) {
        if (progress < targets[stepIdx]) { progress++; setAnalysisProgress(progress); }
        else { stepIdx++; setAnalysisStepIdx(stepIdx); }
      }
    }, 120);

    try {
      const res = await fetch('/api/analyse-drawing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: fileBase64, mediaType: fileMediaType,
          projectName, scale, unit,
          calibration: pixPerUnit ? { pixelsPerRealUnit: pixPerUnit, calibUnit: unit } : null,
          outputSections: exportSecs,
        }),
      });
      clearInterval(progressTimer.current);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Request failed with status ${res.status}`);
      }
      const data = await res.json();
      if (!data.elements?.length && !data.takeoff?.length) {
        throw new Error('No construction elements were identified. Please check the file and try again.');
      }
      setAnalysisProgress(100);
      setAnalysisStepIdx(4);
      await new Promise(r => setTimeout(r, 700));
      setResults(data);
      setManualItems([]);
      setAuditLog(prev => [...prev, newAuditEntry('analysed', `AI analysis completed — ${data.elements?.length || 0} elements, ${data.takeoff?.length || 0} takeoff items`)]);
      setScreen('results');
      setActiveTab('lengths');
    } catch (err) {
      clearInterval(progressTimer.current);
      const raw = err.message || '';
      let errorMsg;
      if (raw.includes('401') || raw.toLowerCase().includes('authentication') || raw.toLowerCase().includes('api key') || raw.toLowerCase().includes('invalid x-api-key')) {
        errorMsg = 'API key error — your ANTHROPIC_API_KEY is missing or invalid. Open the .env.local file in your app folder, paste your key (starts with sk-ant-...), save it, then stop and restart the server with npm run dev.';
      } else if (raw.toLowerCase().includes('413') || raw.toLowerCase().includes('too large') || raw.toLowerCase().includes('payload')) {
        errorMsg = 'The file is too large to process. Please try a smaller image or a compressed PDF (ideally under 4 MB).';
      } else if (raw.toLowerCase().includes('network') || raw.toLowerCase().includes('econnrefused') || raw.toLowerCase().includes('failed to fetch')) {
        errorMsg = 'Network error — could not reach the AI service. Check your internet connection and try again.';
      } else if (raw.toLowerCase().includes('no construction elements') || raw.toLowerCase().includes('no elements')) {
        errorMsg = 'No construction elements could be identified. Try a clearer drawing, or check the file opened correctly.';
      } else {
        errorMsg = raw || 'Analysis failed. Please try again.';
      }
      setAnalysisError(errorMsg);
      setScreen('upload');
    }
  }, [file, fileBase64, fileMediaType, projectName, scale, unit, pixPerUnit, exportSecs]);

  useEffect(() => () => clearInterval(progressTimer.current), []);

  // ─────────────────────────────────────────────
  // Phase 2: Save project
  // ─────────────────────────────────────────────
  const handleSaveProject = useCallback(async () => {
    if (!results) return;
    setIsSaving(true);
    setSaveToast('saving');
    try {
      const id = savedProjectId || crypto.randomUUID();
      await saveProject({
        id,
        name: projectName || 'Unnamed Project',
        companyName, companyEmail, companyPhone,
        scale, unit, pixPerUnit,
        fileName: file?.name || '',
        results, rates, manualItems, exportSecs,
        auditLog: [...auditLog, newAuditEntry('saved', 'Project saved to browser storage')],
        createdAt: savedProjectId ? undefined : new Date().toISOString(),
      });
      setSavedProjectId(id);
      setSaveToast('saved');
      setAuditLog(prev => [...prev, newAuditEntry('saved', 'Project saved to browser storage')]);
      saveCompanyDefaults({ companyName, companyEmail, companyPhone });
      setTimeout(() => setSaveToast(''), 3000);
    } catch (err) {
      console.error(err);
      setSaveToast('error');
      setTimeout(() => setSaveToast(''), 4000);
    } finally {
      setIsSaving(false);
    }
  }, [results, savedProjectId, projectName, companyName, companyEmail, companyPhone, scale, unit, pixPerUnit, file, rates, manualItems, exportSecs, auditLog]);

  // ─────────────────────────────────────────────
  // Phase 2: Manual items
  // ─────────────────────────────────────────────
  const addManualItem = () => {
    const qty = parseFloat(newManual.quantity);
    if (!newManual.description.trim() || !qty || qty <= 0) return;
    const item = {
      id: crypto.randomUUID(),
      description: newManual.description.trim(),
      quantity: qty,
      unit: newManual.unit,
      elementType: 'Manual Item',
      layerCode: 'MANUAL',
    };
    setManualItems(prev => [...prev, item]);
    setNewManual({ description: '', quantity: '', unit: 'm' });
    setShowAddManual(false);
    setAuditLog(prev => [...prev, newAuditEntry('manual_added', `Manual item added: ${item.description}`)]);
  };

  const removeManualItem = (id) => {
    setManualItems(prev => prev.filter(item => item.id !== id));
    setRates(prev => { const next = { ...prev }; delete next[`manual__${id}`]; return next; });
  };

  // ─────────────────────────────────────────────
  // Phase 2: Rate library
  // ─────────────────────────────────────────────
  const handleLoadRates = () => {
    const lib = loadRateLibrary();
    if (!Object.keys(lib).length) {
      setRateLibToast('empty');
      setTimeout(() => setRateLibToast(''), 3000);
      return;
    }
    setRates(prev => ({ ...lib, ...prev })); // library fills blanks, don't overwrite existing
    setRateLibToast('loaded');
    setTimeout(() => setRateLibToast(''), 3000);
  };

  const handleSaveRates = () => {
    saveRatesToLibrary(rates);
    setRateLibToast('saved');
    setTimeout(() => setRateLibToast(''), 3000);
  };

  // ─────────────────────────────────────────────
  // Phase 2: Contractor trade export
  // ─────────────────────────────────────────────
  const exportByTrade = useCallback(() => {
    if (!results) return;
    const allItems = [
      ...results.takeoff.map(item => ({ ...item, isManual: false })),
      ...manualItems.map(item => ({
        ...item, ref: null, description: item.description,
        quantity: item.quantity, unit: item.unit, layerCode: 'MANUAL',
        elementType: 'Manual Item', isManual: true,
      })),
    ];

    const groups = {};
    allItems.forEach(item => {
      const group = getTradeGroup(item.layerCode);
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
    });

    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [];

    rows.push([companyName, companyEmail, companyPhone, '', '', '', ''].map(esc).join(','));
    rows.push([`${projectName || 'Project'} — Contractor Package`, '', '', '', '', '', ''].map(esc).join(','));
    rows.push(['', '', '', '', '', '', ''].map(esc).join(','));

    let rowNum = 4;
    Object.entries(groups).forEach(([groupName, items]) => {
      rows.push(['', '', '', '', '', '', ''].map(esc).join(','));
      rows.push([`=== ${groupName} ===`, '', '', '', '', '', ''].map(esc).join(','));
      rows.push(['Ref', 'Description', 'Quant', 'Unit', 'Rate', 'Total', 'Comments'].map(esc).join(','));
      rowNum += 3;
      items.forEach((item, i) => {
        rows.push([
          i + 1,
          item.description,
          item.quantity,
          item.unit,
          '',
          `=C${rowNum + i}*E${rowNum + i}`,
          item.comments || (item.isManual ? 'Manual measurement' : ''),
        ].map(esc).join(','));
      });
      rowNum += items.length;
    });

    const csv  = rows.join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${(projectName || 'qs').replace(/\s+/g, '-')}-by-trade-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [results, manualItems, companyName, companyEmail, companyPhone, projectName]);

  // ─────────────────────────────────────────────
  // Overlay
  // ─────────────────────────────────────────────
  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const img    = calibImgRef.current;
    if (!canvas || !results?.elements?.length) return;
    const W = img?.naturalWidth || 800, H = img?.naturalHeight || 600;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    results.elements.forEach((el) => {
      const color = el.colorHex || getElementColor(el.layerCode);
      (el.regions || []).forEach((r) => {
        const x = r.x * W, y = r.y * H, w = r.w * W, h = r.h * H;
        ctx.fillStyle = color + '40'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
      });
    });
  }, [results]);

  useEffect(() => { if (showOverlay) drawOverlay(); }, [showOverlay, drawOverlay]);

  // Load projects for sidebar
  useEffect(() => {
    if (!sidebarOpen) return;
    getAllProjects().then(ps => setSidebarProjects(ps || [])).catch(() => setSidebarProjects([]));
  }, [sidebarOpen]);

  // ─────────────────────────────────────────────
  // Interactive split-view canvas
  // ─────────────────────────────────────────────
  const drawInteractiveCanvas = useCallback(() => {
    const canvas = interactiveCanvasRef.current;
    const img    = calibImgRef.current;
    if (!canvas || !img || !results) return;
    const W = img.naturalWidth, H = img.naturalHeight;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0);

    results.elements.forEach((el, idx) => {
      const color   = el.colorHex || getElementColor(el.layerCode);
      const isSel   = idx === selectedElementIdx;
      const regions = el.regions || [];
      const lw      = Math.max(2, W / 500);
      const fs      = Math.max(12, Math.min(20, W / 65));

      regions.forEach(r => {
        const x = r.x * W, y = r.y * H, w = r.w * W, h = r.h * H;
        ctx.fillStyle   = color + (isSel ? '55' : '28');
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = color + (isSel ? 'ff' : 'bb');
        ctx.lineWidth   = isSel ? lw * 2.5 : lw;
        ctx.setLineDash(isSel ? [] : [lw * 6, lw * 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);

        if (showMeasurementLabels) {
          const label = `${fmt(el.totalQuantity)} ${el.unit}`;
          ctx.font = `bold ${fs}px Arial, sans-serif`;
          const tw = ctx.measureText(label).width + 10;
          const th = fs + 8;
          if (w >= tw + 4 && h >= th + 4) {
            ctx.fillStyle = isSel ? color : 'rgba(13,27,62,0.78)';
            ctx.fillRect(x + 4, y + 4, tw, th);
            ctx.fillStyle = '#fff';
            ctx.fillText(label, x + 9, y + 4 + fs);
          }
        }
      });
    });
  }, [results, selectedElementIdx, showMeasurementLabels]);

  useEffect(() => {
    if (screen !== 'results') return;
    if (calibImgRef.current) {
      drawInteractiveCanvas();
    } else if (canvasSourceUrl) {
      const img = new Image();
      img.onload = () => { calibImgRef.current = img; drawInteractiveCanvas(); };
      img.src = canvasSourceUrl;
    }
  }, [screen, canvasSourceUrl, drawInteractiveCanvas]);

  const handleInteractiveCanvasClick = useCallback((e) => {
    const canvas = interactiveCanvasRef.current;
    if (!canvas || !results) return;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx     = (e.clientX - rect.left) * scaleX;
    const cy     = (e.clientY - rect.top)  * scaleY;
    const W = canvas.width, H = canvas.height;

    let found = null;
    for (let idx = results.elements.length - 1; idx >= 0; idx--) {
      for (const r of (results.elements[idx].regions || [])) {
        if (cx >= r.x*W && cx <= (r.x+r.w)*W && cy >= r.y*H && cy <= (r.y+r.h)*H) {
          found = idx; break;
        }
      }
      if (found !== null) break;
    }

    setSelectedElementIdx(prev => prev === found ? null : found);

    if (found !== null && listPanelRef.current) {
      const row = listPanelRef.current.querySelector(`[data-el-idx="${found}"]`);
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [results]);

  // ─────────────────────────────────────────────
  // Grand total (AI + manual)
  // ─────────────────────────────────────────────
  const grandTotal = useMemo(() => {
    const aiTotal = results?.takeoff?.reduce((sum, row) => {
      return sum + row.quantity * (parseFloat(rates[getRateKey(row)]) || 0);
    }, 0) || 0;
    const manualTotal = manualItems.reduce((sum, item) => {
      return sum + item.quantity * (parseFloat(rates[`manual__${item.id}`]) || 0);
    }, 0);
    return aiTotal + manualTotal;
  }, [results, rates, manualItems]);

  // ─────────────────────────────────────────────
  // CSV Export (AI + manual items)
  // ─────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    if (!results) return;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [];
    rows.push([companyName, companyEmail, companyPhone, '', '', '', ''].map(esc).join(','));
    rows.push([projectName || 'Unnamed Project', '', '', '', '', '', ''].map(esc).join(','));
    rows.push(['', '', '', '', '', '', ''].map(esc).join(','));
    rows.push(['', '', '', '', '', '', ''].map(esc).join(','));
    rows.push(['Ref', 'Description', 'Quant', 'Unit', 'Rate', 'Total', 'Comments'].map(esc).join(','));
    const dataStart = 6;
    const allItems = [
      ...results.takeoff,
      ...manualItems.map(item => ({
        description: item.description, quantity: item.quantity, unit: item.unit,
        layerCode: 'MANUAL', comments: 'Manual measurement',
      })),
    ];
    allItems.forEach((item, i) => {
      const rowNum = dataStart + i;
      rows.push([i + 1, item.description, item.quantity, item.unit, '', `=C${rowNum}*E${rowNum}`, item.comments || ''].map(esc).join(','));
    });
    const csv  = rows.join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${(projectName || 'qs-takeoff').replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [results, manualItems, companyName, companyEmail, companyPhone, projectName]);

  // ─────────────────────────────────────────────
  // PDF Report
  // ─────────────────────────────────────────────
  const exportPDF = useCallback(() => {
    if (!results) return;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const allTakeoff = [
      ...results.takeoff,
      ...manualItems.map((item, i) => ({
        ref: results.takeoff.length + i + 1,
        description: `MANUAL — ${item.description}`,
        quantity: item.quantity, unit: item.unit, comments: 'Manual measurement',
        elementType: 'Manual Item', layerCode: 'MANUAL',
      })),
    ];

    const lengthsHTML = exportSecs.lengths ? `
      <div class="section"><h2>Total Lengths &amp; Areas</h2>
      <table><thead><tr><th>Element</th><th>Code</th><th style="text-align:right">Qty</th><th>Unit</th><th>Confidence</th></tr></thead>
      <tbody>${results.elements.map(el => `
        <tr><td><span class="swatch" style="background:${el.colorHex || getElementColor(el.layerCode)}"></span>${el.elementType}</td>
        <td><code>${el.layerCode}</code></td><td style="text-align:right">${fmt(el.totalQuantity)}</td><td>${el.unit}</td>
        <td><span class="badge badge-${(el.confidence || 'MEDIUM').toLowerCase()}">${el.confidence || 'MEDIUM'}</span></td></tr>
      `).join('')}</tbody></table></div>` : '';

    const roomsHTML = exportSecs.rooms && results.rooms?.length ? `
      <div class="section"><h2>Room Breakdown</h2>
      <table><thead><tr><th>Room</th><th style="text-align:right">Area (m²)</th><th style="text-align:right">Perimeter (m)</th></tr></thead>
      <tbody>${results.rooms.map(r => `<tr><td>${r.name}</td><td style="text-align:right">${fmt(r.area)}</td><td style="text-align:right">${fmt(r.perimeter)}</td></tr>`).join('')}</tbody></table></div>` : '';

    const takeoffHTML = exportSecs.takeoff ? `
      <div class="section"><h2>Takeoff Table</h2>
      <table><thead><tr><th>Ref</th><th>Description</th><th style="text-align:right">Qty</th><th>Unit</th><th style="text-align:right">Rate £</th><th style="text-align:right">Total £</th><th>Comments</th></tr></thead>
      <tbody>${allTakeoff.map((item, i) => {
        const key = getRateKey(item);
        const manualKey = `manual__${item.id}`;
        const r = parseFloat(rates[key] || rates[manualKey]) || 0;
        const tot = item.quantity * r;
        return `<tr${item.layerCode === 'MANUAL' ? ' style="background:#fffbeb"' : ''}><td>${i+1}</td><td>${item.description}</td>
          <td style="text-align:right">${fmt(item.quantity)}</td><td>${item.unit}</td>
          <td style="text-align:right">${r > 0 ? `£${fmt(r)}` : '—'}</td>
          <td style="text-align:right">${r > 0 ? `£${fmt(tot)}` : '—'}</td>
          <td>${item.comments || ''}</td></tr>`;
      }).join('')}
      <tr class="total-row"><td colspan="5" style="text-align:right">Grand Total</td>
      <td style="text-align:right">£${grandTotal.toLocaleString('en-GB', {minimumFractionDigits:2})}</td><td></td></tr></tbody></table></div>` : '';

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${projectName || 'Scale Up'} — QS Takeoff Report</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:24px;color:#1a1a2e;font-size:13px}
.header{background:#0d1b3e;color:#fff;padding:20px 28px;border-radius:10px;margin-bottom:24px}
.header h1{font-size:22px;font-weight:800;margin-bottom:8px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}
.meta p{margin:0;font-size:12px;opacity:.85}.meta strong{color:#f59e0b}.section{margin-bottom:28px}
h2{font-size:14px;font-weight:700;color:#0d1b3e;border-bottom:2px solid #f59e0b;padding-bottom:6px;margin-bottom:12px}
table{width:100%;border-collapse:collapse}th{background:#0d1b3e;color:#fff;padding:9px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
td{padding:8px 12px;border-bottom:1px solid #f1f5f9;vertical-align:middle}tr:nth-child(even) td{background:#f8f9fc}
.total-row td{background:#fff8e7!important;font-weight:700;border-top:2px solid #f59e0b}
code{font-family:monospace;font-size:11px;background:#f1f5f9;padding:1px 5px;border-radius:3px}
.swatch{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:middle}
.badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:12px}
.badge-high{background:#d1fae5;color:#065f46}.badge-medium{background:#fef3c7;color:#92400e}.badge-low{background:#fee2e2;color:#991b1b}
.notice{background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:14px 18px;margin-top:28px;font-size:12px;line-height:1.6}
.notice strong{color:#92400e}.footer{margin-top:24px;font-size:11px;color:#64748b;text-align:center;border-top:1px solid #e5e7eb;padding-top:14px}
@media print{body{padding:0}}</style></head><body>
<div class="header"><h1>Scale Up — Takeoff Report</h1>
<div class="meta"><p><strong>Project:</strong> ${projectName || '—'}</p><p><strong>Date:</strong> ${dateStr}</p>
<p><strong>Company:</strong> ${companyName || '—'}</p><p><strong>Scale:</strong> ${scale} | <strong>Unit:</strong> ${unit}</p>
<p><strong>Email:</strong> ${companyEmail || '—'}</p><p><strong>Phone:</strong> ${companyPhone || '—'}</p></div></div>
${results.summary ? `<p style="color:#374151;margin-bottom:24px;line-height:1.6">${results.summary}</p>` : ''}
${lengthsHTML}${roomsHTML}${takeoffHTML}
<div class="notice"><strong>⚠ QS Accuracy Notice</strong><br>AI measurements are estimates from visual drawing analysis.
Verify with a qualified QS before use in any tender or contract.</div>
<div class="footer">Generated by Scale Up | ${new Date().toLocaleString('en-GB')}</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Please allow pop-ups to generate the PDF report.'); return; }
    win.document.write(html); win.document.close();
    setTimeout(() => win.print(), 600);
  }, [results, manualItems, companyName, companyEmail, companyPhone, projectName, scale, unit, rates, grandTotal, exportSecs]);

  // ─────────────────────────────────────────────
  // Reset
  // ─────────────────────────────────────────────
  const resetAll = () => {
    setScreen('upload'); setFile(null); setFileBase64(''); setFileMediaType('');
    setPreviewUrl(''); setPdfPreviewUrl(''); setFileIsImage(false); setFileIsPdf(false);
    setCalibPoints([]); setPixelDist(null); setRealDim(''); setPixPerUnit(null); setCalibMode(false);
    setResults(null); setAnalysisError(''); setManualItems([]); setShowAddManual(false);
    setAuditLog([]); setSavedProjectId(null); setSaveToast('');
    calibImgRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
    router.push('/');
  };

  // ─────────────────────────────────────────────
  // Shared Header
  // ─────────────────────────────────────────────
  const AppHeader = ({ actions }) => (
    <header style={{
      background: '#0d1b3e', padding: '0 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 64, flexShrink: 0, boxShadow: '0 2px 12px rgba(13,27,62,0.25)',
      position: 'relative', zIndex: 100,
    }}>
      {/* LEFT: My Projects */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => setSidebarOpen(p => !p)}
          style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: 20, padding: '4px 8px', lineHeight: 1, borderRadius: 6 }}
          title="My Projects"
        >☰</button>
        <button className="qs-btn qs-btn-ghost qs-btn-sm"
          onClick={() => setSidebarOpen(p => !p)}
          style={{ color: '#93c5fd', fontWeight: 600 }}>
          My Projects
        </button>
      </div>

      {/* MIDDLE: action buttons */}
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{actions}</div>}

      {/* RIGHT: Scale Up brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#ffffff', fontWeight: 800, fontSize: 18, lineHeight: 1.1, letterSpacing: '-0.02em' }}>Scale Up</div>
          <div style={{ color: '#93c5fd', fontSize: 10 }}>Drawing Analyser</div>
        </div>
        <div style={{
          width: 38, height: 38, borderRadius: 8, background: '#f59e0b',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: 13, color: '#0d1b3e',
        }}>SU</div>
      </div>
    </header>
  );

  // ─────────────────────────────────────────────
  // SCREEN 1 — Upload
  // ─────────────────────────────────────────────
  const showCalibCanvas = canvasSourceUrl && (fileIsImage || (fileIsPdf && pdfPreviewUrl));

  // ─────────────────────────────────────────────
  // Sidebar overlay (shared across all screens)
  // ─────────────────────────────────────────────
  const SidebarOverlay = sidebarOpen ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}
      onClick={() => setSidebarOpen(false)}>
      {/* Panel */}
      <div style={{ width: 300, background: '#0d1b3e', height: '100%', display: 'flex', flexDirection: 'column', boxShadow: '4px 0 24px rgba(0,0,0,0.4)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>My Projects</div>
            <button onClick={() => setSidebarOpen(false)}
              style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
          </div>
          <button className="qs-btn qs-btn-primary qs-btn-sm" style={{ width: '100%' }}
            onClick={() => { setSidebarOpen(false); resetAll(); }}>
            + New Project
          </button>
        </div>

        {/* Sign-in prompt */}
        <div style={{ padding: '12px 20px', background: 'rgba(245,158,11,0.12)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600, marginBottom: 4 }}>Sign in to sync projects</div>
          <div style={{ fontSize: 11, color: '#93c5fd', marginBottom: 8, lineHeight: 1.5 }}>Projects are saved locally. Sign in to back them up and access across devices.</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="qs-btn qs-btn-sm"
              style={{ flex: 1, background: '#fff', color: '#0d1b3e', border: 'none', fontWeight: 700, fontSize: 11 }}
              onClick={() => router.push('/sign-in')}>
              Sign In
            </button>
            <button className="qs-btn qs-btn-sm"
              style={{ flex: 1, background: 'transparent', color: '#93c5fd', border: '1px solid rgba(255,255,255,0.2)', fontSize: 11 }}
              onClick={() => router.push('/sign-up')}>
              Sign Up
            </button>
          </div>
        </div>

        {/* Projects list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {sidebarProjects.length === 0 ? (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: '#475569' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>No saved projects yet</div>
              <div style={{ fontSize: 11, lineHeight: 1.5 }}>Upload a drawing and save it to see it here</div>
            </div>
          ) : (
            sidebarProjects.map(p => (
              <div key={p.id}
                onClick={() => { setSidebarOpen(false); router.push(`/?pid=${p.id}`); }}
                style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || 'Unnamed Project'}</div>
                {p.companyName && <div style={{ fontSize: 11, color: '#93c5fd', marginBottom: 2 }}>{p.companyName}</div>}
                <div style={{ fontSize: 10.5, color: '#475569' }}>
                  {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  {p.scale ? ` · ${p.scale}` : ''}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button className="qs-btn qs-btn-ghost qs-btn-sm" style={{ width: '100%', color: '#93c5fd', fontSize: 11 }}
            onClick={() => { setSidebarOpen(false); router.push('/projects'); }}>
            View All Projects →
          </button>
        </div>
      </div>

      {/* Backdrop */}
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} />
    </div>
  ) : null;

  if (screen === 'upload') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#eef2ff' }}>
        <AppHeader />
        <main style={{ flex: 1, maxWidth: 1100, width: '100%', margin: '0 auto', padding: '28px 24px 48px' }}>

          {/* How it works */}
          <div className="fade-in-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { n:'01', icon:'⬆', title:'Upload Drawing', desc:'Drop a PDF, PNG or JPG construction drawing' },
              { n:'02', icon:'⚙', title:'Configure',      desc:'Set drawing scale, units, and project details' },
              { n:'03', icon:'🤖', title:'AI Analysis',    desc:'AI measures every element in seconds' },
              { n:'04', icon:'📄', title:'Export Takeoff', desc:'Download CSV or PDF report, or save project' },
            ].map((s, i) => (
              <div key={i} className="qs-card" style={{ padding:'16px 18px', display:'flex', gap:12, alignItems:'flex-start', animationDelay:`${i*60}ms` }}>
                <div style={{ width:34,height:34,borderRadius:7,background:'#0d1b3e',color:'#f59e0b',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize:10.5,color:'#f59e0b',fontWeight:700,letterSpacing:'.08em',marginBottom:2 }}>STEP {s.n}</div>
                  <div style={{ fontSize:13,fontWeight:700,color:'#0d1b3e',marginBottom:3 }}>{s.title}</div>
                  <div style={{ fontSize:11.5,color:'#64748b',lineHeight:1.5 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:22 }}>

            {/* ── Left col ── */}
            <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

              {/* Drop zone */}
              <div className="qs-card fade-in-up" style={{ padding:0, overflow:'hidden' }}>
                <div style={{ padding:'13px 20px', borderBottom:'1px solid #f1f5f9' }}>
                  <h2 style={{ fontSize:15,fontWeight:700,color:'#0d1b3e' }}>Upload Drawing</h2>
                </div>
                <div style={{ padding:18 }}>
                  <div
                    className={`qs-drop-zone${isDragging?' dragging':''}`}
                    style={{ padding:'32px 20px', textAlign:'center' }}
                    onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    role="button" tabIndex={0} onKeyDown={e => e.key==='Enter' && fileInputRef.current?.click()}
                  >
                    <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif"
                      onChange={handleFileInputChange} style={{ display:'none' }} />
                    {file ? (
                      <div className="fade-in">
                        <div style={{ fontSize:34,marginBottom:10 }}>{fileIsImage?'🖼':'📄'}</div>
                        <div style={{ fontWeight:700,color:'#0d1b3e',fontSize:14,marginBottom:3 }}>{file.name}</div>
                        <div style={{ fontSize:12,color:'#64748b',marginBottom:10 }}>{(file.size/1024/1024).toFixed(2)} MB · {file.type}</div>
                        <div style={{ display:'flex',gap:8,justifyContent:'center' }}>
                          <span style={{ background:'#d1fae5',color:'#065f46',padding:'3px 11px',borderRadius:20,fontSize:12,fontWeight:700 }}>✓ Ready</span>
                          <button className="qs-btn qs-btn-ghost qs-btn-sm" onClick={e => { e.stopPropagation(); resetAll(); }}>✕ Remove</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize:38,marginBottom:12 }}>📐</div>
                        <div style={{ fontWeight:700,color:'#0d1b3e',fontSize:15,marginBottom:5 }}>Drop your drawing here</div>
                        <div style={{ fontSize:13,color:'#64748b',marginBottom:12 }}>PDF, PNG, JPG, WebP — up to {MAX_FILE_MB} MB</div>
                        <button className="qs-btn qs-btn-navy qs-btn-sm">Browse Files</button>
                      </>
                    )}
                  </div>
                  <div style={{ display:'flex',gap:7,marginTop:12,flexWrap:'wrap' }}>
                    {[{icon:'🔒',text:'Secure upload'},{icon:'⚡',text:'AI in seconds'},{icon:'💾',text:'Save projects locally'}].map((b,i) => (
                      <div key={i} style={{ display:'flex',alignItems:'center',gap:5,background:'#f0f4ff',borderRadius:20,padding:'4px 10px',fontSize:11,color:'#374151',fontWeight:500 }}>
                        <span>{b.icon}</span><span>{b.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Calibration */}
              {showCalibCanvas && (
                <div className="qs-card fade-in-up" style={{ padding:0, overflow:'hidden' }}>
                  <div style={{ padding:'13px 20px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                    <div>
                      <h2 style={{ fontSize:15,fontWeight:700,color:'#0d1b3e',marginBottom:2 }}>Scale Calibration</h2>
                      <p style={{ fontSize:12,color:'#64748b',margin:0 }}>Click 2 known points for precise measurement</p>
                    </div>
                    {pixPerUnit && <span style={{ background:'#d1fae5',color:'#065f46',padding:'4px 10px',borderRadius:20,fontSize:12,fontWeight:700 }}>✓ Calibrated</span>}
                  </div>
                  <div style={{ position:'relative',background:'#1a1a2e',maxHeight:300,overflow:'hidden' }}>
                    <canvas ref={calibCanvasRef} className={calibMode?'calib-canvas-cursor':'calib-canvas-default'}
                      style={{ width:'100%',display:'block',maxHeight:300,objectFit:'contain' }}
                      onClick={handleCanvasClick} onTouchEnd={e=>{e.preventDefault();handleCanvasClick(e);}} />
                    {calibMode && (
                      <div style={{ position:'absolute',top:10,left:'50%',transform:'translateX(-50%)',background:'rgba(245,158,11,0.95)',color:'#0d1b3e',padding:'6px 14px',borderRadius:20,fontSize:12,fontWeight:700 }}>
                        {calibPoints.length===0?'Click Point 1':'Click Point 2'}
                      </div>
                    )}
                  </div>
                  <div style={{ padding:'14px 18px',display:'flex',flexDirection:'column',gap:10 }}>
                    <div style={{ display:'flex',gap:8,flexWrap:'wrap',alignItems:'center' }}>
                      <button className="qs-btn qs-btn-navy qs-btn-sm" disabled={calibMode}
                        onClick={() => { setCalibMode(true); setCalibPoints([]); setPixelDist(null); setRealDim(''); setPixPerUnit(null); setCalibWarning(''); }}>
                        📍 Pick 2 Points
                      </button>
                      {calibPoints.length>0 && <button className="qs-btn qs-btn-ghost qs-btn-sm" onClick={resetCalibration}>✕ Reset</button>}
                      {pixelDist && <span style={{ fontSize:12,color:'#64748b' }}>Dist: <strong>{Math.round(pixelDist)}px</strong></span>}
                    </div>
                    {calibPoints.length===2 && !pixPerUnit && (
                      <div className="fade-in" style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' }}>
                        <label className="qs-label" style={{ margin:0 }}>Real dimension:</label>
                        <input type="number" min="0.001" step="any" placeholder="e.g. 10" value={realDim}
                          onChange={e=>setRealDim(e.target.value)} className="qs-input" style={{ width:90 }} />
                        <select value={unit} onChange={e=>setUnit(e.target.value)} className="qs-input qs-select" style={{ width:72 }}>
                          {UNITS.map(u=><option key={u}>{u}</option>)}
                        </select>
                        <button className="qs-btn qs-btn-primary qs-btn-sm" onClick={confirmCalibration} disabled={!realDim||parseFloat(realDim)<=0}>Set Scale</button>
                      </div>
                    )}
                    {pixPerUnit && <div className="fade-in" style={{ fontSize:12,color:'#059669',fontWeight:600 }}>✓ 1px = {(1/pixPerUnit).toFixed(5)} {unit}</div>}
                    {calibWarning && (
                      <div className="fade-in" style={{ padding:'8px 12px',background:'#fffbeb',border:'1px solid #f59e0b',borderRadius:6,fontSize:12,color:'#92400e',lineHeight:1.5 }}>
                        ⚠ {calibWarning}
                      </div>
                    )}
                    {fileIsPdf && pdfRenderFailed && (
                      <div className="fade-in" style={{ padding:'8px 12px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,fontSize:12,color:'#991b1b',lineHeight:1.5 }}>
                        ⚠ PDF preview could not load — canvas calibration is unavailable for this file. You can still run the AI analysis without calibration using the declared scale below.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right col ── */}
            <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

              {/* Company info */}
              <div className="qs-card fade-in-up" style={{ padding:0,overflow:'hidden',animationDelay:'80ms' }}>
                <div style={{ padding:'13px 20px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                  <div>
                    <h2 style={{ fontSize:15,fontWeight:700,color:'#0d1b3e' }}>Company Information</h2>
                    <p style={{ fontSize:12,color:'#64748b',margin:'2px 0 0' }}>Included in CSV header and PDF report</p>
                  </div>
                  <button className="qs-btn qs-btn-ghost qs-btn-sm"
                    onClick={() => saveCompanyDefaults({ companyName, companyEmail, companyPhone })}
                    title="Remember these details for next time">
                    💾 Remember
                  </button>
                </div>
                <div style={{ padding:18,display:'flex',flexDirection:'column',gap:12 }}>
                  <div>
                    <label className="qs-label">Company Name</label>
                    <input className="qs-input" type="text" placeholder="e.g. Smith Contractors Ltd" value={companyName} onChange={e=>setCompanyName(e.target.value)} />
                  </div>
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                    <div>
                      <label className="qs-label">Email</label>
                      <input className="qs-input" type="email" placeholder="info@example.com" value={companyEmail} onChange={e=>setCompanyEmail(e.target.value)} />
                    </div>
                    <div>
                      <label className="qs-label">Phone</label>
                      <input className="qs-input" type="tel" placeholder="+44 7700 900 123" value={companyPhone} onChange={e=>setCompanyPhone(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Project settings */}
              <div className="qs-card fade-in-up" style={{ padding:0,overflow:'hidden',animationDelay:'110ms' }}>
                <div style={{ padding:'13px 20px',borderBottom:'1px solid #f1f5f9' }}>
                  <h2 style={{ fontSize:15,fontWeight:700,color:'#0d1b3e' }}>Project Settings</h2>
                </div>
                <div style={{ padding:18,display:'flex',flexDirection:'column',gap:12 }}>
                  <div>
                    <label className="qs-label">Project Name</label>
                    <input className="qs-input" type="text" placeholder="e.g. Plot 12 — Ground Floor Fit-Out" value={projectName} onChange={e=>setProjectName(e.target.value)} />
                  </div>
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                    <div>
                      <label className="qs-label">Drawing Scale</label>
                      <select className="qs-input qs-select" value={scale} onChange={e=>setScale(e.target.value)}>
                        {SCALES.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="qs-label">Unit</label>
                      <select className="qs-input qs-select" value={unit} onChange={e=>setUnit(e.target.value)}>
                        {UNITS.map(u=><option key={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Output selector */}
              <div className="qs-card fade-in-up" style={{ padding:0,overflow:'hidden',animationDelay:'140ms' }}>
                <div style={{ padding:'13px 20px',borderBottom:'1px solid #f1f5f9' }}>
                  <h2 style={{ fontSize:15,fontWeight:700,color:'#0d1b3e' }}>Output Sections</h2>
                </div>
                <div style={{ padding:'12px 18px',display:'flex',flexDirection:'column',gap:8 }}>
                  {[
                    { key:'lengths', label:'Total Lengths & Areas' },
                    { key:'rooms',   label:'Room Breakdown' },
                    { key:'takeoff', label:'Takeoff Table' },
                  ].map(s=>(
                    <label key={s.key} style={{ display:'flex',gap:10,alignItems:'center',cursor:'pointer',padding:'9px 12px',borderRadius:8,background:exportSecs[s.key]?'#f0f4ff':'#f8fafc',border:`1.5px solid ${exportSecs[s.key]?'#c7d2fe':'#e2e8f0'}`,transition:'all 0.15s' }}>
                      <input type="checkbox" checked={exportSecs[s.key]} onChange={e=>setExportSecs(prev=>({...prev,[s.key]:e.target.checked}))} style={{ accentColor:'#0d1b3e',cursor:'pointer' }} />
                      <span style={{ fontSize:13.5,fontWeight:600,color:'#1a1a2e' }}>{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Error */}
              {analysisError && (
                <div className="qs-card fade-in" style={{ padding:'14px 18px',background:'#fef2f2',border:'1.5px solid #fecaca',borderRadius:10 }}>
                  <div style={{ fontWeight:700,color:'#dc2626',marginBottom:4,fontSize:13 }}>⚠ Analysis Error</div>
                  <div style={{ fontSize:12.5,color:'#991b1b',lineHeight:1.6 }}>{analysisError}</div>
                </div>
              )}
            </div>
          </div>

          {/* Analyse button */}
          <div style={{ marginTop:26,textAlign:'center' }}>
            <button className="qs-btn qs-btn-primary qs-btn-lg" onClick={runAnalysis} disabled={!file} style={{ minWidth:260,fontSize:17 }}>
              {file ? '🤖 Analyse Drawing' : '↑ Upload a Drawing First'}
            </button>
            <div style={{ fontSize:12,color:'#94a3b8',marginTop:7 }}>Analysis typically takes 15–45 seconds</div>
          </div>
        </main>
        {SidebarOverlay}
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // SCREEN 2 — Analysing
  // ─────────────────────────────────────────────
  if (screen === 'analysing') {
    return (
      <div style={{ minHeight:'100vh',display:'flex',flexDirection:'column',background:'#0d1b3e' }}>
        <AppHeader />
        <div style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'40px 24px' }}>
          <div className="fade-in" style={{ maxWidth:500,width:'100%',textAlign:'center' }}>
            <div style={{ width:72,height:72,borderRadius:14,background:'#f59e0b',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,fontWeight:900,color:'#0d1b3e',margin:'0 auto 24px',animation:'pulse-dot 2s ease-in-out infinite' }}>SU</div>
            <h1 style={{ color:'#ffffff',fontSize:24,fontWeight:800,marginBottom:6 }}>Analysing your drawing…</h1>
            <p style={{ color:'#93c5fd',fontSize:13,marginBottom:32 }}>
              {projectName && <><strong style={{ color:'#f59e0b' }}>{projectName}</strong> · </>}AI is measuring every element
            </p>
            <div style={{ marginBottom:32 }}>
              <div className="qs-progress-track" style={{ height:10,marginBottom:8 }}>
                <div className="qs-progress-fill" style={{ width:`${analysisProgress}%` }} />
              </div>
              <div style={{ color:'#f59e0b',fontSize:13,fontWeight:700 }}>{analysisProgress}%</div>
            </div>
            <div style={{ display:'flex',flexDirection:'column',gap:12,textAlign:'left' }}>
              {ANALYSIS_STEPS.slice(0,4).map((step,i) => {
                const done=i<analysisStepIdx, active=i===analysisStepIdx&&analysisProgress<100;
                return (
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:12 }}>
                    <div className={`step-dot ${done?'done':active?'active':'pending'}`} />
                    <span style={{ fontSize:13.5,fontWeight:done?500:active?700:400,color:done?'#10b981':active?'#ffffff':'#475569' }}>{step}</span>
                    {done && <span style={{ marginLeft:'auto',fontSize:12,color:'#10b981' }}>✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {SidebarOverlay}
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // SCREEN 3 — Results (split-view)
  // ─────────────────────────────────────────────
  if (screen === 'results' && results) {
    const lpTabs = [
      { id:'elements', label:'📏 Elements' },
      { id:'takeoff',  label:'📋 Takeoff'  },
      { id:'rooms',    label:'🏠 Rooms'    },
      { id:'rates',    label:'💷 Rates'    },
      { id:'audit',    label:'📝 Audit'    },
    ];

    const ManualAddPanel = (
      <div style={{ padding:'10px 14px' }}>
        {!showAddManual ? (
          <button className="qs-btn qs-btn-outline qs-btn-sm" style={{ width:'100%' }} onClick={()=>setShowAddManual(true)}>+ Add Manual Item</button>
        ) : (
          <div className="fade-in" style={{ background:'#fffbeb',border:'1.5px solid #fde68a',borderRadius:8,padding:12 }}>
            <div style={{ fontWeight:700,fontSize:13,color:'#92400e',marginBottom:8 }}>Add Manual Measurement</div>
            <input className="qs-input" type="text" placeholder="e.g. Extra wall — Room 3"
              value={newManual.description} onChange={e=>setNewManual(p=>({...p,description:e.target.value}))} style={{ marginBottom:6 }} />
            <div style={{ display:'flex',gap:6,marginBottom:8 }}>
              <input className="qs-input" type="number" placeholder="Qty" value={newManual.quantity}
                onChange={e=>setNewManual(p=>({...p,quantity:e.target.value}))} />
              <select className="qs-input qs-select" value={newManual.unit}
                onChange={e=>setNewManual(p=>({...p,unit:e.target.value}))} style={{ width:72 }}>
                {MANUAL_UNITS.map(u=><option key={u}>{u}</option>)}
              </select>
            </div>
            <div style={{ display:'flex',gap:6 }}>
              <button className="qs-btn qs-btn-primary qs-btn-sm" style={{ flex:1 }}
                disabled={!newManual.description.trim()||!newManual.quantity||parseFloat(newManual.quantity)<=0}
                onClick={addManualItem}>Add</button>
              <button className="qs-btn qs-btn-ghost qs-btn-sm"
                onClick={()=>{setShowAddManual(false);setNewManual({description:'',quantity:'',unit:'m'});}}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );

    return (
      <div style={{ height:'100vh',display:'flex',flexDirection:'column',background:'#eef2ff',overflow:'hidden' }}>

        <AppHeader actions={
          <div style={{ display:'flex',gap:6 }}>
            <button className="qs-btn qs-btn-ghost qs-btn-sm" onClick={resetAll} style={{ color:'#93c5fd' }}>← New</button>
            <button className="qs-btn qs-btn-sm"
              onClick={handleSaveProject} disabled={isSaving}
              style={{ background:savedProjectId?'#10b981':'#f59e0b',color:savedProjectId?'#fff':'#0d1b3e',border:'none' }}>
              {isSaving?'⏳':'💾'} {isSaving?'Saving…':savedProjectId?'Saved':'Save'}
            </button>
            <button className="qs-btn qs-btn-outline qs-btn-sm" onClick={exportCSV} style={{ borderColor:'#f59e0b',color:'#f59e0b',background:'transparent' }}>⬇ CSV</button>
            <button className="qs-btn qs-btn-primary qs-btn-sm" onClick={exportPDF}>📄 PDF</button>
          </div>
        } />

        <div style={{ flex:1,display:'flex',overflow:'hidden' }}>

          {/* ── LEFT PANEL ── */}
          <div ref={listPanelRef} style={{ width:360,flexShrink:0,borderRight:'1px solid #e2e8f0',background:'#fff',display:'flex',flexDirection:'column',overflow:'hidden' }}>

            {/* Project info */}
            <div style={{ padding:'10px 14px',borderBottom:'1px solid #f1f5f9',background:'#f8f9fc',flexShrink:0 }}>
              <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:14,fontWeight:700,color:'#0d1b3e',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{projectName||'Unnamed Project'}</div>
                  {companyName&&<div style={{ fontSize:11.5,color:'#64748b' }}>{companyName}</div>}
                </div>
                <div style={{ flexShrink:0,background:grandTotal>0?'#0d1b3e':'#e2e8f0',color:grandTotal>0?'#f59e0b':'#94a3b8',padding:'4px 10px',borderRadius:20,fontSize:13,fontWeight:800 }}>
                  {grandTotal>0?fmtCurrency(grandTotal):'—'}
                </div>
              </div>
              <div style={{ fontSize:10.5,color:'#94a3b8',marginTop:3 }}>{scale} · {unit} · {results.elements.length} element{results.elements.length!==1?'s':''}{manualItems.length>0?` · +${manualItems.length} manual`:''}</div>
            </div>

            {/* Tab bar */}
            <div style={{ display:'flex',borderBottom:'1px solid #e8ecf4',background:'#f8f9fc',overflowX:'auto',flexShrink:0 }}>
              {lpTabs.map(t=>(
                <button key={t.id} onClick={()=>setActiveTab(t.id)}
                  style={{ padding:'7px 10px',fontSize:11,fontWeight:600,border:'none',background:'transparent',color:activeTab===t.id?'#0d1b3e':'#64748b',borderBottom:`2px solid ${activeTab===t.id?'#f59e0b':'transparent'}`,cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.15s',flexShrink:0 }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Scrollable content */}
            <div style={{ flex:1,overflowY:'auto' }}>

              {/* ELEMENTS TAB */}
              {activeTab==='elements'&&(
                <div>
                  {results.summary&&(
                    <div style={{ padding:'10px 14px',background:'#f0f4ff',borderBottom:'1px solid #e8ecf4',fontSize:12,color:'#374151',lineHeight:1.6 }}>
                      <strong style={{ color:'#0d1b3e' }}>AI: </strong>{results.summary}
                    </div>
                  )}
                  {results.elements.length===0&&<EmptyState message="No elements detected." />}
                  {results.elements.map((el,idx)=>{
                    const color=el.colorHex||getElementColor(el.layerCode);
                    const isSel=idx===selectedElementIdx;
                    return (
                      <div key={idx} data-el-idx={idx}
                        onClick={()=>setSelectedElementIdx(p=>p===idx?null:idx)}
                        style={{ padding:'11px 14px',borderLeft:`4px solid ${color}`,borderBottom:'1px solid #f1f5f9',background:isSel?'#f0f4ff':'#fff',cursor:'pointer',transition:'background 0.15s' }}>
                        <div style={{ display:'flex',alignItems:'flex-start',gap:6,marginBottom:4 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13,fontWeight:700,color:'#0d1b3e',lineHeight:1.3 }}>{el.elementType}</div>
                            <div style={{ fontSize:10.5,color:'#64748b',fontFamily:'JetBrains Mono,monospace' }}>{el.layerCode}</div>
                          </div>
                          {confidenceBadge(el.confidence)}
                        </div>
                        <div style={{ fontSize:24,fontWeight:800,color:isSel?color:'#0d1b3e',lineHeight:1.1 }}>
                          {fmt(el.totalQuantity)}<span style={{ fontSize:12,fontWeight:500,color:'#64748b',marginLeft:4 }}>{el.unit}</span>
                        </div>
                        {el.specNote&&<div style={{ fontSize:11,color:'#64748b',marginTop:4,fontStyle:'italic' }}>{el.specNote}</div>}
                        {isSel&&(el.regions||[]).length>0&&<div style={{ fontSize:10.5,color:color,marginTop:4,fontWeight:600 }}>↗ Highlighted on drawing →</div>}
                      </div>
                    );
                  })}

                  {manualItems.length>0&&(
                    <>
                      <div style={{ padding:'6px 14px',background:'#fef3c7',fontSize:10.5,fontWeight:700,color:'#92400e',textTransform:'uppercase',letterSpacing:'.06em' }}>Manual Items</div>
                      {manualItems.map(item=>(
                        <div key={item.id} style={{ padding:'11px 14px',borderLeft:'4px solid #d97706',borderBottom:'1px solid #f1f5f9',background:'#fffbeb' }}>
                          <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:4 }}>
                            <span style={{ background:'#fef3c7',color:'#92400e',fontSize:10,fontWeight:700,padding:'1px 5px',borderRadius:3 }}>MANUAL</span>
                            <span style={{ fontSize:13,fontWeight:700,color:'#0d1b3e',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.description}</span>
                            <button style={{ background:'none',border:'none',color:'#dc2626',cursor:'pointer',padding:'2px 4px',fontSize:14,lineHeight:1,flexShrink:0 }}
                              onClick={e=>{e.stopPropagation();removeManualItem(item.id);}}>✕</button>
                          </div>
                          <div style={{ fontSize:24,fontWeight:800,color:'#d97706',lineHeight:1.1 }}>
                            {fmt(item.quantity)}<span style={{ fontSize:12,fontWeight:500,color:'#64748b',marginLeft:4 }}>{item.unit}</span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {ManualAddPanel}

                  <div style={{ margin:'4px 14px 14px',padding:'10px 12px',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:7,fontSize:11.5,color:'#78350f',lineHeight:1.6 }}>
                    <strong>⚠ QS Notice:</strong> AI measurements are estimates. Verify with a qualified QS before use in any tender or contract.
                  </div>
                </div>
              )}

              {/* TAKEOFF TAB */}
              {activeTab==='takeoff'&&(
                <div>
                  {results.takeoff.length===0&&manualItems.length===0?<EmptyState message="No takeoff items." />:(
                    <>
                      {results.takeoff.map((item,i)=>{
                        const key=getRateKey(item),rate=parseFloat(rates[key])||0,total=item.quantity*rate;
                        return (
                          <div key={`ai-${i}`} style={{ padding:'9px 14px',borderBottom:'1px solid #f1f5f9' }}>
                            <div style={{ fontSize:12.5,fontWeight:600,color:'#0d1b3e',marginBottom:5,lineHeight:1.3 }}>{item.description}</div>
                            <div style={{ display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' }}>
                              <span style={{ fontSize:12,fontFamily:'JetBrains Mono,monospace',fontWeight:700,color:'#374151',background:'#f0f4ff',padding:'2px 8px',borderRadius:5 }}>{fmt(item.quantity)} {item.unit}</span>
                              <span style={{ color:'#94a3b8',fontSize:11 }}>×</span>
                              <div style={{ display:'flex',alignItems:'center',gap:2 }}>
                                <span style={{ color:'#64748b',fontSize:12 }}>£</span>
                                <input type="number" min="0" step="0.01" placeholder="0.00" value={rates[key]??''} onChange={e=>setRates(p=>({...p,[key]:e.target.value}))} className="rate-input" style={{ width:80 }} />
                              </div>
                              <span style={{ marginLeft:'auto',fontSize:13,fontWeight:700,color:rate>0?'#059669':'#94a3b8' }}>{rate>0?fmtCurrency(total):'—'}</span>
                            </div>
                            {item.comments&&<div style={{ fontSize:10.5,color:'#94a3b8',marginTop:3 }}>{item.comments}</div>}
                          </div>
                        );
                      })}
                      {manualItems.map(item=>{
                        const key=`manual__${item.id}`,rate=parseFloat(rates[key])||0,total=item.quantity*rate;
                        return (
                          <div key={`m-${item.id}`} style={{ padding:'9px 14px',borderBottom:'1px solid #f1f5f9',background:'#fffbeb' }}>
                            <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:5 }}>
                              <span style={{ background:'#fef3c7',color:'#92400e',fontSize:10,fontWeight:700,padding:'1px 5px',borderRadius:3 }}>MANUAL</span>
                              <span style={{ fontSize:12.5,fontWeight:600,color:'#0d1b3e',flex:1 }}>{item.description}</span>
                              <button className="qs-btn qs-btn-ghost qs-btn-sm" style={{ color:'#dc2626',padding:'1px 5px',fontSize:11 }}
                                onClick={()=>removeManualItem(item.id)}>✕</button>
                            </div>
                            <div style={{ display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' }}>
                              <span style={{ fontSize:12,fontFamily:'JetBrains Mono,monospace',fontWeight:700,color:'#374151',background:'#fef3c7',padding:'2px 8px',borderRadius:5 }}>{fmt(item.quantity)} {item.unit}</span>
                              <span style={{ color:'#94a3b8',fontSize:11 }}>×</span>
                              <div style={{ display:'flex',alignItems:'center',gap:2 }}>
                                <span style={{ color:'#64748b',fontSize:12 }}>£</span>
                                <input type="number" min="0" step="0.01" placeholder="0.00" value={rates[key]??''} onChange={e=>setRates(p=>({...p,[key]:e.target.value}))} className="rate-input" style={{ width:80 }} />
                              </div>
                              <span style={{ marginLeft:'auto',fontSize:13,fontWeight:700,color:rate>0?'#059669':'#94a3b8' }}>{rate>0?fmtCurrency(total):'—'}</span>
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ padding:'12px 14px',background:'#0d1b3e' }}>
                        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                          <span style={{ fontSize:13,fontWeight:700,color:'#fff' }}>Grand Total</span>
                          <span style={{ fontSize:18,fontWeight:800,color:'#f59e0b' }}>{grandTotal>0?fmtCurrency(grandTotal):'—'}</span>
                        </div>
                      </div>
                      {ManualAddPanel}
                      <div style={{ margin:'4px 14px 14px',padding:'10px 12px',background:'#f0f4ff',borderRadius:7 }}>
                        <div style={{ fontSize:12,fontWeight:700,color:'#0d1b3e',marginBottom:5 }}>Contractor Package</div>
                        <button className="qs-btn qs-btn-navy qs-btn-sm" style={{ width:'100%' }} onClick={exportByTrade}>⬇ Export by Trade (CSV)</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ROOMS TAB */}
              {activeTab==='rooms'&&(
                <div style={{ padding:'12px 14px' }}>
                  {(!results.rooms||results.rooms.length===0)?<EmptyState message="No rooms identified." />:(
                    <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                      {results.rooms.map((room,i)=>(
                        <div key={i} style={{ border:'1.5px solid #e8ecf4',borderRadius:9,padding:'12px 14px',background:'#fff' }}>
                          <div style={{ fontSize:13.5,fontWeight:700,color:'#0d1b3e',marginBottom:8 }}>{room.name}</div>
                          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:room.elements?.length>0?8:0 }}>
                            {[{label:'FLOOR AREA',val:room.area,suf:'m²'},{label:'PERIMETER',val:room.perimeter,suf:'m'}].map(s=>(
                              <div key={s.label} style={{ background:'#f0f4ff',borderRadius:6,padding:'8px 10px' }}>
                                <div style={{ fontSize:10,color:'#64748b',fontWeight:700,marginBottom:2 }}>{s.label}</div>
                                <div style={{ fontSize:18,fontWeight:800,color:'#0d1b3e' }}>{fmt(s.val)}<span style={{ fontSize:10,color:'#64748b',marginLeft:2 }}>{s.suf}</span></div>
                              </div>
                            ))}
                          </div>
                          {room.elements?.length>0&&(
                            <div style={{ display:'flex',gap:5,flexWrap:'wrap' }}>
                              {room.elements.map((code,j)=>(
                                <span key={j} style={{ background:'#f1f5f9',color:'#374151',padding:'2px 7px',borderRadius:5,fontSize:10.5,fontFamily:'JetBrains Mono,monospace',borderLeft:`3px solid ${getElementColor(code)}` }}>{code}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* RATES TAB */}
              {activeTab==='rates'&&(
                <div>
                  <div style={{ padding:'12px 14px',background:'#0d1b3e' }}>
                    <div style={{ fontSize:11,color:'#93c5fd',fontWeight:600,marginBottom:2 }}>TOTAL ESTIMATE</div>
                    <div style={{ fontSize:26,fontWeight:800,color:'#f59e0b',marginBottom:10 }}>{grandTotal>0?fmtCurrency(grandTotal):'£—'}</div>
                    <div style={{ display:'flex',gap:6 }}>
                      <button className="qs-btn qs-btn-sm" style={{ flex:1,background:'rgba(255,255,255,0.12)',color:'#fff',border:'none',fontSize:11 }} onClick={handleLoadRates}>📂 Load Library</button>
                      <button className="qs-btn qs-btn-sm" style={{ flex:1,background:'#f59e0b',color:'#0d1b3e',border:'none',fontSize:11 }} onClick={handleSaveRates}>💾 Save Library</button>
                    </div>
                    {rateLibToast&&(
                      <div style={{ marginTop:8,padding:'6px 10px',borderRadius:5,background:'rgba(255,255,255,0.1)',fontSize:11.5,fontWeight:600,color:'#fff' }}>
                        {rateLibToast==='saved'?'✓ Saved to rate library':rateLibToast==='loaded'?'✓ Rates loaded':'Library is empty — enter rates and save first.'}
                      </div>
                    )}
                  </div>
                  <div style={{ padding:'12px 14px',display:'flex',flexDirection:'column',gap:10 }}>
                    {[...results.takeoff,...manualItems.map(item=>({...item,elementType:'Manual Item',layerCode:'MANUAL'}))].map((item,i)=>{
                      const key=item.id?`manual__${item.id}`:getRateKey(item);
                      const rate=parseFloat(rates[key])||0,total=item.quantity*rate;
                      const color=getElementColor(item.layerCode);
                      return (
                        <div key={i} style={{ border:'1.5px solid #e8ecf4',borderRadius:9,padding:'12px 14px',borderLeft:`4px solid ${color}`,background:'#fff' }}>
                          <div style={{ fontSize:12.5,fontWeight:700,color:'#0d1b3e',marginBottom:2 }}>{item.elementType||item.description}</div>
                          <div style={{ fontSize:10.5,color:'#64748b',fontFamily:'JetBrains Mono,monospace',marginBottom:8 }}>{item.layerCode}</div>
                          <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:6,flexWrap:'wrap' }}>
                            <span style={{ fontSize:13,fontWeight:700,color:'#0d1b3e',background:'#f0f4ff',padding:'2px 8px',borderRadius:5 }}>{fmt(item.quantity)}<span style={{ fontSize:10,color:'#64748b',marginLeft:2 }}>{item.unit}</span></span>
                            <span style={{ color:'#64748b' }}>×</span>
                            <div style={{ display:'flex',alignItems:'center',gap:2 }}>
                              <span style={{ color:'#64748b',fontSize:12 }}>£</span>
                              <input type="number" min="0" step="0.01" placeholder="rate" value={rates[key]??''} onChange={e=>setRates(p=>({...p,[key]:e.target.value}))} className="rate-input" />
                            </div>
                          </div>
                          <div style={{ fontSize:17,fontWeight:800,color:rate>0?'#0d1b3e':'#94a3b8' }}>{rate>0?fmtCurrency(total):'—'}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AUDIT TAB */}
              {activeTab==='audit'&&(
                <div style={{ padding:'10px 14px' }}>
                  {auditLog.length===0?<EmptyState message="No audit events yet." />:(
                    <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
                      {[...auditLog].reverse().map(entry=>(
                        <div key={entry.id} style={{ padding:'9px 12px',borderRadius:7,background:'#f8f9fc' }}>
                          <div style={{ fontSize:10.5,color:'#94a3b8',marginBottom:3 }}>
                            {new Date(entry.timestamp).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                          </div>
                          <div style={{ display:'flex',alignItems:'flex-start',gap:6 }}>
                            <span style={{ display:'inline-block',background:entry.action==='saved'?'#d1fae5':entry.action==='analysed'?'#dbeafe':'#f3f4f6',color:entry.action==='saved'?'#065f46':entry.action==='analysed'?'#1e40af':'#374151',fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:3,flexShrink:0,textTransform:'uppercase' }}>
                              {entry.action.replace('_',' ')}
                            </span>
                            <span style={{ fontSize:12,color:'#374151',lineHeight:1.4 }}>{entry.details}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Panel footer */}
            <div style={{ padding:'10px 14px',borderTop:'1px solid #e2e8f0',background:'#f8f9fc',display:'flex',gap:6,flexShrink:0 }}>
              <button className="qs-btn qs-btn-sm" style={{ flex:1,background:'#f59e0b',color:'#0d1b3e',border:'none',fontSize:11.5 }} onClick={exportCSV}>⬇ CSV</button>
              <button className="qs-btn qs-btn-primary qs-btn-sm" style={{ flex:1,fontSize:11.5 }} onClick={exportPDF}>📄 PDF</button>
              <button className="qs-btn qs-btn-sm" style={{ flex:1,background:savedProjectId?'#10b981':'#0d1b3e',color:'#fff',border:'none',fontSize:11.5 }}
                onClick={handleSaveProject} disabled={isSaving}>
                {isSaving?'⏳':savedProjectId?'✓ Saved':'💾 Save'}
              </button>
            </div>
          </div>

          {/* ── RIGHT PANEL — Interactive canvas ── */}
          <div style={{ flex:1,background:'#111827',position:'relative',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden' }}>
            {canvasSourceUrl ? (
              <>
                {/* Toolbar */}
                <div style={{ position:'absolute',top:12,left:12,zIndex:10,display:'flex',gap:8,flexWrap:'wrap' }}>
                  <button
                    style={{ background:'rgba(13,27,62,0.88)',backdropFilter:'blur(4px)',color:'#fff',border:'1px solid rgba(255,255,255,0.15)',borderRadius:7,padding:'6px 12px',fontSize:12,cursor:'pointer',fontWeight:600 }}
                    onClick={()=>setShowMeasurementLabels(v=>!v)}>
                    🏷 Labels: {showMeasurementLabels?'ON':'OFF'}
                  </button>
                  {selectedElementIdx!==null&&(
                    <div style={{ background:'rgba(245,158,11,0.97)',color:'#0d1b3e',borderRadius:7,padding:'6px 12px',fontSize:12,fontWeight:700,display:'flex',alignItems:'center',gap:8 }}>
                      <div style={{ width:8,height:8,borderRadius:2,background:results.elements[selectedElementIdx]?.colorHex||getElementColor(results.elements[selectedElementIdx]?.layerCode||'DEFAULT'),flexShrink:0 }} />
                      {results.elements[selectedElementIdx]?.elementType}
                      <button style={{ background:'none',border:'none',color:'#0d1b3e',cursor:'pointer',fontSize:14,lineHeight:1,padding:0,marginLeft:2 }} onClick={()=>setSelectedElementIdx(null)}>✕</button>
                    </div>
                  )}
                </div>
                {/* Click hint */}
                {selectedElementIdx===null&&results.elements.some(el=>(el.regions||[]).length>0)&&(
                  <div style={{ position:'absolute',bottom:16,left:'50%',transform:'translateX(-50%)',background:'rgba(13,27,62,0.82)',color:'#93c5fd',borderRadius:20,padding:'6px 16px',fontSize:12,fontWeight:500,pointerEvents:'none',whiteSpace:'nowrap' }}>
                    Click a coloured area to select an element
                  </div>
                )}
                <canvas
                  ref={interactiveCanvasRef}
                  style={{ maxWidth:'100%',maxHeight:'100%',display:'block',cursor:'crosshair' }}
                  onClick={handleInteractiveCanvasClick}
                />
              </>
            ) : (
              <div style={{ textAlign:'center',padding:'0 32px',maxWidth:480 }}>
                <div style={{ fontSize:56,marginBottom:16 }}>📐</div>
                <div style={{ fontSize:16,fontWeight:700,color:'#94a3b8',marginBottom:8 }}>Drawing preview not available</div>
                {results.summary?(
                  <p style={{ fontSize:13,color:'#64748b',lineHeight:1.7,margin:'0 0 20px' }}>{results.summary}</p>
                ):(
                  <p style={{ fontSize:13,color:'#64748b',margin:'0 0 20px' }}>Start a new analysis to see the interactive drawing view.</p>
                )}
                <button className="qs-btn qs-btn-ghost qs-btn-sm" style={{ borderColor:'#475569',color:'#94a3b8' }} onClick={resetAll}>+ New Analysis</button>
              </div>
            )}
          </div>
        </div>

        {/* Save toast */}
        {saveToast&&(
          <div className="fade-in" style={{ position:'fixed',bottom:24,right:24,zIndex:9999,padding:'12px 20px',borderRadius:9,background:saveToast==='saved'?'#059669':saveToast==='error'?'#dc2626':'#0d1b3e',color:'#fff',fontSize:13.5,fontWeight:700,boxShadow:'0 4px 20px rgba(0,0,0,0.25)' }}>
            {saveToast==='saving'?'⏳ Saving project…':saveToast==='saved'?'✓ Project saved — view in My Projects':'✕ Save failed — try again'}
          </div>
        )}
        {SidebarOverlay}
      </div>
    );
  }

  return null;
}

function EmptyState({ message }) {
  return (
    <div style={{ textAlign:'center',padding:'44px 24px',color:'#94a3b8',fontSize:14 }}>
      <div style={{ fontSize:38,marginBottom:10 }}>🔍</div>{message}
    </div>
  );
}
