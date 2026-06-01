'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const SCALES = [
  '1:20', '1:25', '1:50', '1:100', '1:200',
  '1:250', '1:500', '1:1000', '1:1250', '1:2500',
];

const UNITS = ['m', 'mm', 'ft'];

const ELEMENT_COLORS = {
  'A-WALL-INT':   '#ef4444',
  'A-FLOOR':      '#3b82f6',
  'A-CEIL':       '#22c55e',
  'A-DECO':       '#a855f7',
  'A-WALL-EXT':   '#f97316',
  'A-BRICKWORK':  '#f97316',
  'DEFAULT':      '#64748b',
};

const ANALYSIS_STEPS = [
  'Uploading drawing…',
  'Identifying construction elements…',
  'Measuring quantities…',
  'Building takeoff table…',
  'Complete',
];

const MAX_FILE_SIZE_MB = 25;

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

function confidenceBadge(conf) {
  const c = (conf || 'MEDIUM').toUpperCase();
  if (c === 'HIGH')   return <span className="badge-high">HIGH</span>;
  if (c === 'LOW')    return <span className="badge-low">LOW</span>;
  return <span className="badge-medium">MEDIUM</span>;
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export default function QSDrawingAnalyser() {

  // ── Navigation ──
  const [screen, setScreen] = useState('upload'); // 'upload' | 'analysing' | 'results'

  // ── File state ──
  const [file, setFile]               = useState(null);
  const [fileBase64, setFileBase64]   = useState('');
  const [fileMediaType, setFileMediaType] = useState('');
  const [isDragging, setIsDragging]   = useState(false);
  const [previewUrl, setPreviewUrl]   = useState('');
  const [fileIsImage, setFileIsImage] = useState(false);
  const [fileIsPdf, setFileIsPdf]     = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(''); // canvas-rendered PDF page

  // ── Company info ──
  const [companyName,  setCompanyName]  = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');

  // ── Project settings ──
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
  const [exportSecs, setExportSecs] = useState({
    lengths: true, rooms: true, takeoff: true,
  });

  // ── Analysis ──
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStepIdx,  setAnalysisStepIdx]  = useState(0);
  const [analysisError,    setAnalysisError]    = useState('');

  // ── Results ──
  const [results,     setResults]     = useState(null);
  const [activeTab,   setActiveTab]   = useState('lengths');
  const [rates,       setRates]       = useState({});
  const [showOverlay, setShowOverlay] = useState(false);

  // ── Refs ──
  const calibCanvasRef  = useRef(null);
  const calibImgRef     = useRef(null);
  const overlayCanvasRef = useRef(null);
  const fileInputRef    = useRef(null);
  const progressTimer   = useRef(null);

  // ─────────────────────────────────────────────
  // File processing
  // ─────────────────────────────────────────────
  const processFile = useCallback((f) => {
    if (!f) return;

    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`File is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_SIZE_MB} MB.`);
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

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setPreviewUrl(dataUrl);
      // Strip the data URL prefix to get just the base64
      const base64 = dataUrl.split(',')[1];
      setFileBase64(base64);

      // For PDFs: render page 1 via pdfjs for calibration
      if (isPdf) {
        renderPdfToCanvas(dataUrl).then(setPdfPreviewUrl).catch(console.warn);
      }
    };
    reader.readAsDataURL(f);
  }, []);

  // Render first page of PDF to a data URL using pdfjs
  const renderPdfToCanvas = async (pdfDataUrl) => {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      // Use local worker via CDN (avoids bundling issues)
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
      }
      const pdfData = pdfDataUrl.split(',')[1];
      const loadingTask = pdfjs.getDocument({ data: atob(pdfData) });
      const pdf  = await loadingTask.promise;
      const page = await pdf.getPage(1);

      const MAX_DIM = 3000;
      const vp0 = page.getViewport({ scale: 1 });
      const scaleFactor = Math.min(2, MAX_DIM / Math.max(vp0.width, vp0.height));
      const viewport = page.getViewport({ scale: scaleFactor });

      const canvas  = document.createElement('canvas');
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas.toDataURL('image/png');
    } catch (err) {
      console.warn('PDF canvas render failed:', err);
      return '';
    }
  };

  // Drop handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, [processFile]);

  const handleFileInputChange = useCallback((e) => {
    const f = e.target.files[0];
    if (f) processFile(f);
    e.target.value = '';
  }, [processFile]);

  // ─────────────────────────────────────────────
  // Canvas calibration
  // ─────────────────────────────────────────────

  // The image to draw on the calibration canvas (image or PDF-rendered)
  const canvasSourceUrl = useMemo(() => {
    if (fileIsImage) return previewUrl;
    if (fileIsPdf && pdfPreviewUrl) return pdfPreviewUrl;
    return '';
  }, [fileIsImage, previewUrl, fileIsPdf, pdfPreviewUrl]);

  // Load the image into calibImgRef whenever the source URL changes
  useEffect(() => {
    if (!canvasSourceUrl) return;
    const img = new Image();
    img.onload = () => {
      calibImgRef.current = img;
      redrawCanvas(img, calibPoints, pixPerUnit);
    };
    img.src = canvasSourceUrl;
  }, [canvasSourceUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const redrawCanvas = useCallback((imgArg, pointsArg, pixPerUnitArg) => {
    const canvas = calibCanvasRef.current;
    const img    = imgArg ?? calibImgRef.current;
    const points = pointsArg ?? calibPoints;
    const ppu    = pixPerUnitArg ?? pixPerUnit;
    if (!canvas || !img) return;

    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const R = Math.max(10, canvas.width / 120); // responsive point radius
    const LW = Math.max(2, canvas.width / 600);
    const FS = Math.max(14, canvas.width / 60);

    // Draw calibration points
    points.forEach((pt, i) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, R, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = LW * 1.5;
      ctx.stroke();

      ctx.fillStyle = '#0d1b3e';
      ctx.font = `bold ${FS}px Sora, sans-serif`;
      ctx.shadowColor = 'rgba(255,255,255,0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText(`P${i + 1}`, pt.x + R + 4, pt.y - R / 2);
      ctx.shadowBlur = 0;
    });

    // Draw measurement line
    if (points.length === 2) {
      const [p1, p2] = points;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = LW * 2;
      ctx.setLineDash([LW * 8, LW * 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Mid-point distance label
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const dist = Math.round(Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2));
      ctx.fillStyle = 'rgba(13,27,62,0.85)';
      const label = `${dist}px`;
      const lw = ctx.measureText(label).width + 12;
      const bx = mx - lw / 2, by = my - FS - 4, bw = lw, bh = FS + 10, br = 4;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(bx, by, bw, bh, br);
      } else {
        ctx.rect(bx, by, bw, bh);
      }
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.font = `bold ${FS * 0.85}px JetBrains Mono, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(label, mx, my);
      ctx.textAlign = 'left';
    }

    // Scale ruler after calibration
    if (ppu && ppu > 0) {
      const rulerRealLen = getRulerLength(canvas.width / ppu);
      const rulerPx = rulerRealLen * ppu;
      const rx = 20, ry = canvas.height - 30;
      const RH = Math.max(8, canvas.height / 80);
      ctx.fillStyle = 'rgba(13,27,62,0.8)';
      ctx.fillRect(rx, ry - RH, rulerPx, RH);
      ctx.fillStyle = '#f59e0b';
      ctx.font = `bold ${FS * 0.85}px Sora, sans-serif`;
      ctx.fillText(`${rulerRealLen}${unit}`, rx + rulerPx + 6, ry);
    }
  }, [calibPoints, pixPerUnit, unit]);

  // Redraw when calibration state changes
  useEffect(() => {
    if (calibImgRef.current) {
      redrawCanvas(calibImgRef.current, calibPoints, pixPerUnit);
    }
  }, [calibPoints, pixPerUnit, redrawCanvas]);

  // Nice round ruler length
  function getRulerLength(maxRealLen) {
    const nice = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
    return nice.find(v => maxRealLen / 5 <= v) || nice[nice.length - 1];
  }

  const getCanvasPoint = (e) => {
    const canvas = calibCanvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const src    = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  };

  const handleCanvasClick = useCallback((e) => {
    if (!calibMode) return;
    e.preventDefault();
    const pt = getCanvasPoint(e);

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
    setCalibPoints([]);
    setPixelDist(null);
    setRealDim('');
    setPixPerUnit(null);
    setCalibMode(false);
    if (calibImgRef.current) {
      redrawCanvas(calibImgRef.current, [], null);
    }
  };

  const confirmCalibration = useCallback(() => {
    const dim = parseFloat(realDim);
    if (calibPoints.length !== 2 || !dim || dim <= 0 || !pixelDist) return;

    const ppu = pixelDist / dim;
    // Warn if scale looks unusual
    const impliedScale = ppu;
    if (impliedScale < 1 || impliedScale > 10000) {
      const ok = window.confirm(
        `Scale validation warning: the calibrated scale gives 1 ${unit} = ${(1 / ppu).toFixed(4)} pixels, which seems unusual. ` +
        'Are you sure you entered the correct real-world dimension? Click OK to proceed or Cancel to re-calibrate.'
      );
      if (!ok) return;
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

    // Animate progress independently of the actual API call
    let progress = 0;
    const targets = [12, 38, 68, 92];
    let stepIdx = 0;

    clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      if (stepIdx < targets.length) {
        if (progress < targets[stepIdx]) {
          progress++;
          setAnalysisProgress(progress);
        } else {
          stepIdx++;
          setAnalysisStepIdx(stepIdx);
        }
      }
    }, 120);

    try {
      const res = await fetch('/api/analyse-drawing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: fileBase64,
          mediaType: fileMediaType,
          projectName,
          scale,
          unit,
          calibration: pixPerUnit
            ? { pixelsPerRealUnit: pixPerUnit, calibUnit: unit }
            : null,
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
        throw new Error('The AI could not identify any construction elements in this drawing. Please check the file and try again.');
      }

      setAnalysisProgress(100);
      setAnalysisStepIdx(4);
      await new Promise(r => setTimeout(r, 700));

      setResults(data);
      setScreen('results');
      setActiveTab('lengths');
    } catch (err) {
      clearInterval(progressTimer.current);
      setAnalysisError(err.message || 'Analysis failed. Please try again.');
      setScreen('upload');
    }
  }, [file, fileBase64, fileMediaType, projectName, scale, unit, pixPerUnit, exportSecs]);

  // Cleanup timer on unmount
  useEffect(() => () => clearInterval(progressTimer.current), []);

  // ─────────────────────────────────────────────
  // Drawing overlay (after results)
  // ─────────────────────────────────────────────
  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const img    = calibImgRef.current;
    if (!canvas || !results?.elements?.length) return;

    const W = img?.naturalWidth  || canvas.parentElement?.offsetWidth  || 800;
    const H = img?.naturalHeight || canvas.parentElement?.offsetHeight || 600;
    canvas.width  = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    results.elements.forEach((el) => {
      const color = el.colorHex || getElementColor(el.layerCode);
      if (!el.regions?.length) return;
      el.regions.forEach((r) => {
        const x = r.x * W, y = r.y * H, w = r.w * W, h = r.h * H;
        ctx.fillStyle = color + '40'; // 25% opacity fill
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);
      });
    });
  }, [results]);

  useEffect(() => {
    if (showOverlay) drawOverlay();
  }, [showOverlay, drawOverlay]);

  // ─────────────────────────────────────────────
  // Grand total
  // ─────────────────────────────────────────────
  const grandTotal = useMemo(() => {
    if (!results?.takeoff) return 0;
    return results.takeoff.reduce((sum, row) => {
      const r = parseFloat(rates[getRateKey(row)]) || 0;
      return sum + row.quantity * r;
    }, 0);
  }, [results, rates]);

  // ─────────────────────────────────────────────
  // CSV Export
  // ─────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    if (!results) return;

    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const rows = [];
    // Company header block (rows 1–5)
    rows.push([companyName, companyEmail, companyPhone, '', '', '', ''].map(esc).join(','));
    rows.push([projectName || 'Unnamed Project', '', '', '', '', '', ''].map(esc).join(','));
    rows.push(['', '', '', '', '', '', ''].map(esc).join(','));
    rows.push(['', '', '', '', '', '', ''].map(esc).join(','));
    // Column headers (row 5)
    rows.push(['Ref', 'Description', 'Quant', 'Unit', 'Rate', 'Total', 'Comments'].map(esc).join(','));
    // Data rows start at row 6
    const dataStart = 6;
    results.takeoff.forEach((item, i) => {
      const rowNum = dataStart + i;
      rows.push([
        i + 1,
        item.description,
        item.quantity,
        item.unit,
        '',                          // Rate — customer fills
        `=C${rowNum}*E${rowNum}`,    // Excel formula for Total
        item.comments || '',
      ].map(esc).join(','));
    });

    const csv  = rows.join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${(projectName || 'qs-takeoff').replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [results, companyName, companyEmail, companyPhone, projectName]);

  // ─────────────────────────────────────────────
  // PDF Report Export
  // ─────────────────────────────────────────────
  const exportPDF = useCallback(() => {
    if (!results) return;

    const dateStr = new Date().toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    const lengthsHTML = exportSecs.lengths ? `
      <div class="section">
        <h2>Total Lengths &amp; Areas</h2>
        <table>
          <thead><tr>
            <th>Element Type</th><th>Code</th>
            <th style="text-align:right">Quantity</th><th>Unit</th><th>Confidence</th>
          </tr></thead>
          <tbody>
            ${results.elements.map(el => `
              <tr>
                <td><span class="swatch" style="background:${el.colorHex || getElementColor(el.layerCode)}"></span>${el.elementType}</td>
                <td><code>${el.layerCode}</code></td>
                <td style="text-align:right">${fmt(el.totalQuantity)}</td>
                <td>${el.unit}</td>
                <td><span class="badge badge-${(el.confidence || 'MEDIUM').toLowerCase()}">${el.confidence || 'MEDIUM'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : '';

    const roomsHTML = exportSecs.rooms && results.rooms?.length ? `
      <div class="section">
        <h2>Room Breakdown</h2>
        <table>
          <thead><tr><th>Room</th><th style="text-align:right">Floor Area (m²)</th><th style="text-align:right">Perimeter (m)</th></tr></thead>
          <tbody>
            ${results.rooms.map(r => `
              <tr>
                <td>${r.name}</td>
                <td style="text-align:right">${fmt(r.area)}</td>
                <td style="text-align:right">${fmt(r.perimeter)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : '';

    const takeoffHTML = exportSecs.takeoff ? `
      <div class="section">
        <h2>Takeoff Table</h2>
        <table>
          <thead><tr>
            <th>Ref</th><th>Description</th>
            <th style="text-align:right">Qty</th><th>Unit</th>
            <th style="text-align:right">Rate £</th><th style="text-align:right">Total £</th>
            <th>Comments</th>
          </tr></thead>
          <tbody>
            ${results.takeoff.map((item, i) => {
              const r = parseFloat(rates[getRateKey(item)]) || 0;
              const tot = item.quantity * r;
              return `
                <tr>
                  <td>${i + 1}</td>
                  <td>${item.description}</td>
                  <td style="text-align:right">${fmt(item.quantity)}</td>
                  <td>${item.unit}</td>
                  <td style="text-align:right">${r > 0 ? `£${fmt(r)}` : '—'}</td>
                  <td style="text-align:right">${r > 0 ? `£${fmt(tot)}` : '—'}</td>
                  <td>${item.comments || ''}</td>
                </tr>`;
            }).join('')}
            <tr class="total-row">
              <td colspan="5" style="text-align:right">Grand Total</td>
              <td style="text-align:right">£${grandTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>` : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${projectName || 'QuantSurv AI'} — QS Takeoff Report</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:24px;color:#1a1a2e;font-size:13px}
  .header{background:#0d1b3e;color:#fff;padding:20px 28px;border-radius:10px;margin-bottom:24px}
  .header h1{font-size:22px;font-weight:800;margin-bottom:8px}
  .header-meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}
  .header-meta p{margin:0;font-size:12px;opacity:.85}
  .header-meta strong{color:#f59e0b}
  .section{margin-bottom:28px}
  h2{font-size:14px;font-weight:700;color:#0d1b3e;border-bottom:2px solid #f59e0b;padding-bottom:6px;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}
  th{background:#0d1b3e;color:#fff;padding:9px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
  td{padding:8px 12px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tr:nth-child(even) td{background:#f8f9fc}
  .total-row td{background:#fff8e7!important;font-weight:700;border-top:2px solid #f59e0b}
  code{font-family:monospace;font-size:11px;background:#f1f5f9;padding:1px 5px;border-radius:3px}
  .swatch{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:middle}
  .badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:12px}
  .badge-high{background:#d1fae5;color:#065f46}
  .badge-medium{background:#fef3c7;color:#92400e}
  .badge-low{background:#fee2e2;color:#991b1b}
  .notice{background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:14px 18px;margin-top:28px;font-size:12px;line-height:1.6}
  .notice strong{color:#92400e}
  .footer{margin-top:24px;font-size:11px;color:#64748b;text-align:center;border-top:1px solid #e5e7eb;padding-top:14px}
  @media print{body{padding:0}.no-print{display:none}}
</style>
</head>
<body>
<div class="header">
  <h1>QuantSurv AI — Takeoff Report</h1>
  <div class="header-meta">
    <p><strong>Project:</strong> ${projectName || '—'}</p>
    <p><strong>Date:</strong> ${dateStr}</p>
    <p><strong>Company:</strong> ${companyName || '—'}</p>
    <p><strong>Scale:</strong> ${scale} | <strong>Unit:</strong> ${unit}</p>
    <p><strong>Email:</strong> ${companyEmail || '—'}</p>
    <p><strong>Phone:</strong> ${companyPhone || '—'}</p>
  </div>
</div>

${results.summary ? `<p style="color:#374151;margin-bottom:24px;line-height:1.6">${results.summary}</p>` : ''}

${lengthsHTML}
${roomsHTML}
${takeoffHTML}

<div class="notice">
  <strong>⚠ QS Accuracy Notice</strong><br>
  These measurements are AI estimates based on visual analysis of the uploaded drawing.
  They should be reviewed and verified by a qualified Quantity Surveyor before use in any
  tender, contract, or formal cost plan. Confidence ratings (HIGH / MEDIUM / LOW) reflect
  the AI's certainty for each measurement. Scale calibration accuracy directly affects all results.
</div>

<div class="footer">
  Generated by QuantSurv AI | ${new Date().toLocaleString('en-GB')}
</div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      alert('Please allow pop-ups to generate the PDF report.');
      return;
    }
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }, [results, companyName, companyEmail, companyPhone, projectName, scale, unit, rates, grandTotal, exportSecs]);

  // ─────────────────────────────────────────────
  // Reset
  // ─────────────────────────────────────────────
  const resetAll = () => {
    setScreen('upload');
    setFile(null);
    setFileBase64('');
    setFileMediaType('');
    setPreviewUrl('');
    setPdfPreviewUrl('');
    setFileIsImage(false);
    setFileIsPdf(false);
    setCalibPoints([]);
    setPixelDist(null);
    setRealDim('');
    setPixPerUnit(null);
    setCalibMode(false);
    setResults(null);
    setAnalysisError('');
    calibImgRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─────────────────────────────────────────────
  // RENDER — Header (shared)
  // ─────────────────────────────────────────────
  const Header = ({ actions }) => (
    <header style={{
      background: '#0d1b3e',
      padding: '0 32px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 64, flexShrink: 0,
      boxShadow: '0 2px 12px rgba(13,27,62,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8,
          background: '#f59e0b',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: 13, color: '#0d1b3e',
          letterSpacing: '-0.5px',
        }}>QS</div>
        <div>
          <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>
            QuantSurv AI
          </div>
          <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 500 }}>
            Drawing Analyser
          </div>
        </div>
      </div>
      {actions}
    </header>
  );

  // ─────────────────────────────────────────────
  // SCREEN 1: Upload
  // ─────────────────────────────────────────────
  const showCalibCanvas = canvasSourceUrl && (fileIsImage || (fileIsPdf && pdfPreviewUrl));
  const canAnalyse = !!file;

  if (screen === 'upload') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#eef2ff' }}>
        <Header />

        <main style={{ flex: 1, maxWidth: 1100, width: '100%', margin: '0 auto', padding: '32px 24px 48px' }}>

          {/* How It Works */}
          <div className="fade-in-up" style={{ marginBottom: 28 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {[
                { n: '01', icon: '⬆', title: 'Upload Drawing', desc: 'Drop a PDF, PNG or JPG construction drawing' },
                { n: '02', icon: '⚙', title: 'Configure', desc: 'Set drawing scale, units, and project details' },
                { n: '03', icon: '🤖', title: 'AI Analysis', desc: 'AI measures every element in seconds' },
                { n: '04', icon: '📄', title: 'Export Takeoff', desc: 'Download professional CSV or PDF report' },
              ].map((s, i) => (
                <div key={i} className="qs-card" style={{
                  padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start',
                  animationDelay: `${i * 60}ms`,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: '#0d1b3e', color: '#f59e0b',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, flexShrink: 0,
                  }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, letterSpacing: '.08em', marginBottom: 3 }}>
                      STEP {s.n}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0d1b3e', marginBottom: 4 }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

            {/* Left: Upload */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Drop Zone */}
              <div className="qs-card fade-in-up" style={{ padding: 0, overflow: 'hidden', animationDelay: '100ms' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0d1b3e' }}>Upload Drawing</h2>
                </div>
                <div style={{ padding: 20 }}>
                  <div
                    className={`qs-drop-zone${isDragging ? ' dragging' : ''}`}
                    style={{ padding: '36px 24px', textAlign: 'center' }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    role="button" tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.gif"
                      onChange={handleFileInputChange}
                      style={{ display: 'none' }}
                    />
                    {file ? (
                      <div className="fade-in">
                        <div style={{ fontSize: 36, marginBottom: 12 }}>
                          {fileIsImage ? '🖼' : '📄'}
                        </div>
                        <div style={{ fontWeight: 700, color: '#0d1b3e', fontSize: 15, marginBottom: 4 }}>
                          {file.name}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                          {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <span style={{
                            background: '#d1fae5', color: '#065f46',
                            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                          }}>✓ Ready to analyse</span>
                          <button
                            className="qs-btn qs-btn-ghost qs-btn-sm"
                            onClick={e => { e.stopPropagation(); resetAll(); }}
                          >✕ Remove</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 40, marginBottom: 14 }}>📐</div>
                        <div style={{ fontWeight: 700, color: '#0d1b3e', fontSize: 15, marginBottom: 6 }}>
                          Drop your drawing here
                        </div>
                        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                          PDF, PNG, JPG, WebP — up to {MAX_FILE_SIZE_MB} MB
                        </div>
                        <button className="qs-btn qs-btn-navy qs-btn-sm">
                          Browse Files
                        </button>
                      </>
                    )}
                  </div>

                  {/* Trust badges */}
                  <div style={{
                    display: 'flex', gap: 8, marginTop: 14,
                    flexWrap: 'wrap',
                  }}>
                    {[
                      { icon: '🔒', text: 'Secure upload' },
                      { icon: '⚡', text: 'AI analysis in seconds' },
                      { icon: '📊', text: 'Professional CSV export' },
                    ].map((b, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: '#f0f4ff', borderRadius: 20,
                        padding: '5px 11px', fontSize: 11.5, color: '#374151', fontWeight: 500,
                      }}>
                        <span>{b.icon}</span><span>{b.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Calibration Panel (image/PDF with preview) */}
              {showCalibCanvas && (
                <div className="qs-card fade-in-up" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{
                    padding: '14px 20px', borderBottom: '1px solid #f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0d1b3e', marginBottom: 2 }}>
                        Scale Calibration
                      </h2>
                      <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                        Click 2 known points on the drawing for precise measurement
                      </p>
                    </div>
                    {pixPerUnit && (
                      <span style={{
                        background: '#d1fae5', color: '#065f46',
                        padding: '4px 11px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      }}>✓ Scale set</span>
                    )}
                  </div>

                  {/* Canvas */}
                  <div style={{ position: 'relative', background: '#1a1a2e', maxHeight: 340, overflow: 'hidden' }}>
                    <canvas
                      ref={calibCanvasRef}
                      className={calibMode ? 'calib-canvas-cursor' : 'calib-canvas-default'}
                      style={{ width: '100%', display: 'block', maxHeight: 340, objectFit: 'contain' }}
                      onClick={handleCanvasClick}
                      onTouchEnd={e => { e.preventDefault(); handleCanvasClick(e); }}
                    />
                    {calibMode && (
                      <div style={{
                        position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(245,158,11,0.95)', color: '#0d1b3e',
                        padding: '7px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700,
                      }}>
                        {calibPoints.length === 0 ? 'Click Point 1 on drawing' : 'Click Point 2 on drawing'}
                      </div>
                    )}
                  </div>

                  {/* Controls */}
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        className="qs-btn qs-btn-navy qs-btn-sm"
                        onClick={() => { setCalibMode(true); setCalibPoints([]); setPixelDist(null); setRealDim(''); setPixPerUnit(null); }}
                        disabled={calibMode}
                      >
                        📍 Pick 2 Points
                      </button>
                      {calibPoints.length > 0 && (
                        <button className="qs-btn qs-btn-ghost qs-btn-sm" onClick={resetCalibration}>
                          ✕ Reset
                        </button>
                      )}
                      {pixelDist && (
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                          Pixel distance: <strong>{Math.round(pixelDist)}px</strong>
                        </span>
                      )}
                    </div>

                    {calibPoints.length === 2 && !pixPerUnit && (
                      <div className="fade-in" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <label className="qs-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Real dimension:</label>
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            placeholder="e.g. 10"
                            value={realDim}
                            onChange={e => setRealDim(e.target.value)}
                            className="qs-input"
                            style={{ width: 100 }}
                          />
                          <select
                            value={unit}
                            onChange={e => setUnit(e.target.value)}
                            className="qs-input qs-select"
                            style={{ width: 75 }}
                          >
                            {UNITS.map(u => <option key={u}>{u}</option>)}
                          </select>
                        </div>
                        <button
                          className="qs-btn qs-btn-primary qs-btn-sm"
                          onClick={confirmCalibration}
                          disabled={!realDim || parseFloat(realDim) <= 0}
                        >
                          Set Scale
                        </button>
                      </div>
                    )}

                    {pixPerUnit && (
                      <div className="fade-in" style={{ fontSize: 12.5, color: '#059669', fontWeight: 600 }}>
                        ✓ Scale calibrated — 1px = {(1 / pixPerUnit).toFixed(5)} {unit}
                        {' '}· all measurements use this calibration
                      </div>
                    )}

                    {!showCalibCanvas && fileIsPdf && !pdfPreviewUrl && (
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        PDF preview loading for calibration…
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PDF scale note (when PDF but no canvas rendered) */}
              {fileIsPdf && !pdfPreviewUrl && !showCalibCanvas && (
                <div className="qs-card fade-in-up" style={{ padding: '16px 20px', background: '#f0f9ff', borderColor: '#bae6fd' }}>
                  <p style={{ fontSize: 13, color: '#0369a1', margin: 0 }}>
                    <strong>PDF uploaded.</strong> Set the drawing scale using the dropdown in Project Settings.
                    PDF drawing preview is loading for calibration…
                  </p>
                </div>
              )}
            </div>

            {/* Right: Settings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Company Info */}
              <div className="qs-card fade-in-up" style={{ padding: 0, overflow: 'hidden', animationDelay: '80ms' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0d1b3e' }}>Company Information</h2>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>Included in CSV header and PDF report</p>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label className="qs-label">Company Name</label>
                    <input className="qs-input" type="text" placeholder="e.g. Smith Contractors Ltd"
                      value={companyName} onChange={e => setCompanyName(e.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="qs-label">Email</label>
                      <input className="qs-input" type="email" placeholder="info@example.com"
                        value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} />
                    </div>
                    <div>
                      <label className="qs-label">Phone</label>
                      <input className="qs-input" type="tel" placeholder="+44 7700 900 123"
                        value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Project Settings */}
              <div className="qs-card fade-in-up" style={{ padding: 0, overflow: 'hidden', animationDelay: '120ms' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0d1b3e' }}>Project Settings</h2>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label className="qs-label">Project Name</label>
                    <input className="qs-input" type="text" placeholder="e.g. Plot 12 — Ground Floor Fit-Out"
                      value={projectName} onChange={e => setProjectName(e.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="qs-label">Drawing Scale</label>
                      <select className="qs-input qs-select" value={scale} onChange={e => setScale(e.target.value)}>
                        {SCALES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="qs-label">Unit</label>
                      <select className="qs-input qs-select" value={unit} onChange={e => setUnit(e.target.value)}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                  {pixPerUnit && (
                    <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, padding: '6px 10px', background: '#f0fdf4', borderRadius: 6 }}>
                      ✓ Using calibrated scale — overrides drawing scale dropdown
                    </div>
                  )}
                </div>
              </div>

              {/* Output Selector */}
              <div className="qs-card fade-in-up" style={{ padding: 0, overflow: 'hidden', animationDelay: '160ms' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0d1b3e' }}>Output Sections</h2>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>Choose what to include in your export</p>
                </div>
                <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { key: 'lengths', label: 'Total Lengths & Areas', desc: 'Element cards with confidence ratings' },
                    { key: 'rooms',   label: 'Room Breakdown',         desc: 'Per-room area, perimeter, elements' },
                    { key: 'takeoff', label: 'Takeoff Table',          desc: 'Line items with rate inputs and totals' },
                  ].map(s => (
                    <label key={s.key} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      cursor: 'pointer', padding: '10px 14px',
                      borderRadius: 8, background: exportSecs[s.key] ? '#f0f4ff' : '#f8fafc',
                      border: `1.5px solid ${exportSecs[s.key] ? '#c7d2fe' : '#e2e8f0'}`,
                      transition: 'all 0.15s',
                    }}>
                      <input
                        type="checkbox"
                        checked={exportSecs[s.key]}
                        onChange={e => setExportSecs(prev => ({ ...prev, [s.key]: e.target.checked }))}
                        style={{ marginTop: 2, accentColor: '#0d1b3e', cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1a1a2e' }}>{s.label}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{s.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Error message */}
              {analysisError && (
                <div className="qs-card fade-in" style={{
                  padding: '14px 18px', background: '#fef2f2',
                  border: '1.5px solid #fecaca', borderRadius: 10,
                }}>
                  <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4, fontSize: 13.5 }}>
                    ⚠ Analysis Error
                  </div>
                  <div style={{ fontSize: 13, color: '#991b1b', lineHeight: 1.6 }}>{analysisError}</div>
                  <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>
                    Check your ANTHROPIC_API_KEY in .env.local and try again.
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Analyse Button */}
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <button
              className="qs-btn qs-btn-primary qs-btn-lg"
              onClick={runAnalysis}
              disabled={!canAnalyse}
              style={{ minWidth: 260, fontSize: 17 }}
            >
              {canAnalyse ? '🤖 Analyse Drawing' : '↑ Upload a Drawing First'}
            </button>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
              Analysis typically takes 15–45 seconds
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // SCREEN 2: Analysing
  // ─────────────────────────────────────────────
  if (screen === 'analysing') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        background: '#0d1b3e',
      }}>
        <Header />
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '40px 24px',
        }}>
          <div className="fade-in" style={{
            maxWidth: 520, width: '100%', textAlign: 'center',
          }}>
            {/* Logo spinner */}
            <div style={{
              width: 80, height: 80, borderRadius: 16,
              background: '#f59e0b',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 900, color: '#0d1b3e',
              margin: '0 auto 28px',
              animation: 'pulse-dot 2s ease-in-out infinite',
            }}>QS</div>

            <h1 style={{ color: '#ffffff', fontSize: 26, fontWeight: 800, marginBottom: 8 }}>
              Analysing your drawing…
            </h1>
            <p style={{ color: '#93c5fd', fontSize: 14, marginBottom: 36 }}>
              {projectName && <><strong style={{ color: '#f59e0b' }}>{projectName}</strong> · </>}
              AI is measuring every element
            </p>

            {/* Progress bar */}
            <div style={{ marginBottom: 36 }}>
              <div className="qs-progress-track" style={{ height: 10, marginBottom: 10 }}>
                <div className="qs-progress-fill" style={{ width: `${analysisProgress}%` }} />
              </div>
              <div style={{ color: '#f59e0b', fontSize: 14, fontWeight: 700 }}>
                {analysisProgress}%
              </div>
            </div>

            {/* Step list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
              {ANALYSIS_STEPS.slice(0, 4).map((step, i) => {
                const done    = i < analysisStepIdx;
                const active  = i === analysisStepIdx && analysisProgress < 100;
                const pending = i > analysisStepIdx;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div className={`step-dot ${done ? 'done' : active ? 'active' : 'pending'}`} />
                    <span style={{
                      fontSize: 14, fontWeight: done ? 500 : active ? 700 : 400,
                      color: done ? '#10b981' : active ? '#ffffff' : '#475569',
                    }}>{step}</span>
                    {done && <span style={{ marginLeft: 'auto', fontSize: 13, color: '#10b981' }}>✓</span>}
                  </div>
                );
              })}
            </div>

            <p style={{ color: '#475569', fontSize: 12, marginTop: 32 }}>
              Large drawings may take up to 60 seconds
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // SCREEN 3: Results
  // ─────────────────────────────────────────────
  if (screen === 'results' && results) {

    const tabs = [
      { id: 'lengths', label: '📏 Total Lengths' },
      { id: 'rooms',   label: '🏠 Room Breakdown' },
      { id: 'takeoff', label: '📋 Takeoff Table' },
      { id: 'rates',   label: '💷 Cost Rates' },
    ];

    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#eef2ff' }}>
        <Header actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="qs-btn qs-btn-ghost qs-btn-sm" onClick={resetAll} style={{ color: '#93c5fd' }}>
              ← New Analysis
            </button>
            <button className="qs-btn qs-btn-outline qs-btn-sm" onClick={exportCSV}
              style={{ borderColor: '#f59e0b', color: '#f59e0b', background: 'transparent' }}>
              ⬇ CSV
            </button>
            <button className="qs-btn qs-btn-primary qs-btn-sm" onClick={exportPDF}>
              📄 PDF Report
            </button>
          </div>
        } />

        <main style={{ flex: 1, maxWidth: 1100, width: '100%', margin: '0 auto', padding: '24px 24px 48px' }}>

          {/* Project info bar */}
          <div className="fade-in-up qs-card" style={{
            marginBottom: 20, padding: '12px 20px',
            display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
          }}>
            <div>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Project</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0d1b3e' }}>{projectName || 'Unnamed Project'}</div>
            </div>
            {companyName && <div>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Company</span>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{companyName}</div>
            </div>}
            <div>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Scale</span>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{scale}</div>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Unit</span>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{unit}</div>
            </div>
            {pixPerUnit && <div style={{ marginLeft: 'auto' }}>
              <span style={{ background: '#d1fae5', color: '#065f46', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                ✓ Scale calibrated
              </span>
            </div>}
            <div style={{ marginLeft: 'auto' }}>
              <span style={{ background: '#0d1b3e', color: '#ffffff', padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                Grand Total: {grandTotal > 0 ? fmtCurrency(grandTotal) : '—'}
              </span>
            </div>
          </div>

          {/* Summary */}
          {results.summary && (
            <div className="fade-in-up qs-card" style={{
              marginBottom: 20, padding: '14px 20px',
              background: '#f0f4ff', borderColor: '#c7d2fe',
              animationDelay: '50ms',
            }}>
              <p style={{ fontSize: 13.5, color: '#374151', margin: 0, lineHeight: 1.6 }}>
                <strong style={{ color: '#0d1b3e' }}>AI Summary: </strong>{results.summary}
              </p>
            </div>
          )}

          {/* Main results card with tabs */}
          <div className="qs-card fade-in-up" style={{ padding: 0, overflow: 'hidden', animationDelay: '80ms' }}>

            {/* Tab Navigation */}
            <div style={{
              display: 'flex', borderBottom: '1px solid #e8ecf4',
              overflowX: 'auto', flexShrink: 0,
              background: '#f8f9fc',
            }}>
              {tabs.map(t => (
                <button
                  key={t.id}
                  className={`qs-tab ${activeTab === t.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ padding: 24 }}>

              {/* TAB: Total Lengths */}
              {activeTab === 'lengths' && (
                <div className="fade-in">
                  {results.elements.length === 0 ? (
                    <EmptyState message="No elements were detected in this drawing." />
                  ) : (
                    <>
                      {/* Overlay toggle if preview available */}
                      {canvasSourceUrl && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#1a1a2e' }}>
                            {/* Base image */}
                            <img
                              src={canvasSourceUrl}
                              alt="Drawing preview"
                              style={{ width: '100%', display: 'block', maxHeight: 300, objectFit: 'contain' }}
                            />
                            {/* Overlay canvas */}
                            {showOverlay && (
                              <canvas
                                ref={overlayCanvasRef}
                                style={{
                                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                                  pointerEvents: 'none',
                                }}
                              />
                            )}
                            <button className="overlay-toggle" onClick={() => setShowOverlay(v => !v)}>
                              {showOverlay ? '🔍 Hide Overlay' : '🔍 Show Element Overlay'}
                            </button>
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                        {results.elements.map((el, i) => {
                          const color = el.colorHex || getElementColor(el.layerCode);
                          return (
                            <div key={i} style={{
                              border: '1.5px solid #e8ecf4', borderRadius: 10,
                              padding: '16px 18px',
                              borderLeft: `4px solid ${color}`,
                              background: '#ffffff',
                              transition: 'box-shadow 0.15s',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{
                                    width: 14, height: 14, borderRadius: 3,
                                    background: color, flexShrink: 0,
                                  }} />
                                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0d1b3e' }}>
                                    {el.elementType}
                                  </span>
                                </div>
                                {confidenceBadge(el.confidence)}
                              </div>
                              <div style={{ fontSize: 11.5, color: '#64748b', fontFamily: 'JetBrains Mono, monospace', marginBottom: 10 }}>
                                {el.layerCode}
                              </div>
                              <div style={{ fontSize: 26, fontWeight: 800, color: '#0d1b3e', marginBottom: 2 }}>
                                {fmt(el.totalQuantity)}
                                <span style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginLeft: 4 }}>{el.unit}</span>
                              </div>
                              {el.description && (
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>
                                  {el.description}
                                </div>
                              )}
                              {el.specNote && (
                                <div style={{
                                  fontSize: 11.5, color: '#374151', marginTop: 8,
                                  background: '#f8f9fc', borderRadius: 6, padding: '5px 9px',
                                  fontStyle: 'italic',
                                }}>
                                  Spec: {el.specNote}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB: Room Breakdown */}
              {activeTab === 'rooms' && (
                <div className="fade-in">
                  {(!results.rooms || results.rooms.length === 0) ? (
                    <EmptyState message="No individual rooms were identified in this drawing." />
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                      {results.rooms.map((room, i) => (
                        <div key={i} style={{
                          border: '1.5px solid #e8ecf4', borderRadius: 10, padding: '18px 20px',
                          background: '#ffffff',
                        }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#0d1b3e', marginBottom: 12 }}>
                            {room.name}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                            <div style={{ background: '#f0f4ff', borderRadius: 8, padding: '10px 14px' }}>
                              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 3 }}>FLOOR AREA</div>
                              <div style={{ fontSize: 20, fontWeight: 800, color: '#0d1b3e' }}>
                                {fmt(room.area)}
                                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 3 }}>m²</span>
                              </div>
                            </div>
                            <div style={{ background: '#f0f4ff', borderRadius: 8, padding: '10px 14px' }}>
                              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 3 }}>PERIMETER</div>
                              <div style={{ fontSize: 20, fontWeight: 800, color: '#0d1b3e' }}>
                                {fmt(room.perimeter)}
                                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 3 }}>m</span>
                              </div>
                            </div>
                          </div>
                          {room.elements?.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {room.elements.map((code, j) => (
                                <span key={j} style={{
                                  background: '#f1f5f9', color: '#374151',
                                  padding: '3px 8px', borderRadius: 6,
                                  fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 500,
                                  borderLeft: `3px solid ${getElementColor(code)}`,
                                }}>{code}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Takeoff Table */}
              {activeTab === 'takeoff' && (
                <div className="fade-in">
                  {results.takeoff.length === 0 ? (
                    <EmptyState message="No takeoff items were generated." />
                  ) : (
                    <>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="qs-table">
                          <thead>
                            <tr>
                              <th style={{ width: 50 }}>Ref</th>
                              <th>Description</th>
                              <th style={{ textAlign: 'right', width: 90 }}>Qty</th>
                              <th style={{ width: 60 }}>Unit</th>
                              <th style={{ width: 110 }}>Rate £</th>
                              <th style={{ textAlign: 'right', width: 110 }}>Total £</th>
                              <th className="hide-mobile">Comments</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.takeoff.map((item, i) => {
                              const key   = getRateKey(item);
                              const rate  = parseFloat(rates[key]) || 0;
                              const total = item.quantity * rate;
                              return (
                                <tr key={i}>
                                  <td style={{ color: '#64748b', fontWeight: 700 }}>{item.ref ?? i + 1}</td>
                                  <td>
                                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0d1b3e' }}>
                                      {item.description}
                                    </div>
                                  </td>
                                  <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                                    {fmt(item.quantity)}
                                  </td>
                                  <td style={{ color: '#64748b', fontWeight: 600 }}>{item.unit}</td>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <span style={{ color: '#64748b', fontSize: 13 }}>£</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={rates[key] ?? ''}
                                        onChange={e => setRates(prev => ({ ...prev, [key]: e.target.value }))}
                                        className="rate-input"
                                      />
                                    </div>
                                  </td>
                                  <td style={{
                                    textAlign: 'right',
                                    fontFamily: 'JetBrains Mono, monospace',
                                    fontWeight: 700,
                                    color: rate > 0 ? '#0d1b3e' : '#94a3b8',
                                  }}>
                                    {rate > 0 ? fmtCurrency(total) : '—'}
                                  </td>
                                  <td className="hide-mobile" style={{ fontSize: 12, color: '#64748b', maxWidth: 180 }}>
                                    {item.comments}
                                  </td>
                                </tr>
                              );
                            })}
                            <tr className="total-row">
                              <td colSpan={5} style={{ textAlign: 'right', fontSize: 14 }}>
                                <strong>Grand Total</strong>
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 16 }}>
                                <strong>{grandTotal > 0 ? fmtCurrency(grandTotal) : '—'}</strong>
                              </td>
                              <td className="hide-mobile" />
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 12, textAlign: 'right' }}>
                        Enter £/unit rates above to calculate totals. Rates are saved per element type.
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* TAB: Cost Rates */}
              {activeTab === 'rates' && (
                <div className="fade-in">
                  {/* Grand total banner */}
                  <div style={{
                    background: '#0d1b3e', borderRadius: 10, padding: '16px 22px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 24, flexWrap: 'wrap', gap: 12,
                  }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#93c5fd', fontWeight: 600, marginBottom: 3 }}>TOTAL PROJECT COST ESTIMATE</div>
                      <div style={{ fontSize: 30, fontWeight: 800, color: '#f59e0b' }}>
                        {grandTotal > 0 ? fmtCurrency(grandTotal) : '£—'}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', maxWidth: 300 }}>
                      Enter rates for each element type below. Totals update automatically.
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                    {results.takeoff.map((item, i) => {
                      const key   = getRateKey(item);
                      const rate  = parseFloat(rates[key]) || 0;
                      const total = item.quantity * rate;
                      const color = getElementColor(item.layerCode);
                      return (
                        <div key={i} style={{
                          border: '1.5px solid #e8ecf4', borderRadius: 10, padding: '16px 18px',
                          background: '#ffffff', borderLeft: `4px solid ${color}`,
                        }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0d1b3e', marginBottom: 4 }}>
                            {item.elementType}
                          </div>
                          <div style={{ fontSize: 11.5, color: '#64748b', fontFamily: 'JetBrains Mono, monospace', marginBottom: 12 }}>
                            {item.layerCode}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div style={{
                              fontSize: 15, fontWeight: 800, color: '#0d1b3e',
                              padding: '4px 12px', background: '#f0f4ff', borderRadius: 6,
                            }}>
                              {fmt(item.quantity)} <span style={{ fontSize: 11, color: '#64748b' }}>{item.unit}</span>
                            </div>
                            <div style={{ fontSize: 13, color: '#64748b' }}>×</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 13, color: '#64748b' }}>£</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="rate"
                                value={rates[key] ?? ''}
                                onChange={e => setRates(prev => ({ ...prev, [key]: e.target.value }))}
                                className="rate-input"
                              />
                              <span style={{ fontSize: 12, color: '#64748b' }}>/{item.unit}</span>
                            </div>
                          </div>
                          <div style={{
                            fontSize: 18, fontWeight: 800,
                            color: rate > 0 ? '#0d1b3e' : '#94a3b8',
                          }}>
                            {rate > 0 ? fmtCurrency(total) : '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* QS Accuracy Notice */}
          <div className="qs-card fade-in-up" style={{
            marginTop: 20, padding: '16px 20px',
            background: '#fffbeb', borderColor: '#fde68a',
            animationDelay: '120ms',
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                  QS Accuracy Notice
                </div>
                <p style={{ fontSize: 12.5, color: '#78350f', margin: 0, lineHeight: 1.7 }}>
                  These measurements are AI estimates based on visual analysis of the uploaded drawing.
                  They should be reviewed and verified by a qualified Quantity Surveyor before use in any
                  tender, contract, or formal cost plan.
                  Confidence ratings (HIGH / MEDIUM / LOW) indicate the AI&apos;s certainty for each measurement.
                  Scale calibration accuracy directly affects all computed quantities.
                </p>
              </div>
            </div>
          </div>

          {/* Export buttons (bottom) */}
          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="qs-btn qs-btn-navy" onClick={exportCSV}>
              ⬇ Download CSV Takeoff
            </button>
            <button className="qs-btn qs-btn-primary" onClick={exportPDF}>
              📄 Generate PDF Report
            </button>
            <button className="qs-btn qs-btn-outline" onClick={resetAll}>
              ← Start New Analysis
            </button>
          </div>

        </main>
      </div>
    );
  }

  return null;
}

// ─────────────────────────────────────────────
// Empty State helper
// ─────────────────────────────────────────────
function EmptyState({ message }) {
  return (
    <div style={{
      textAlign: 'center', padding: '48px 24px',
      color: '#94a3b8', fontSize: 14,
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
      {message}
    </div>
  );
}
