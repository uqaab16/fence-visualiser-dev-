/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { CLIENT_CONFIG } from './clientConfig';

// Shape of the already-computed values handed to the PDF builder. Every value
// here is READ from what EstimateSummary already displays on screen — nothing
// is recalculated or re-derived inside this module.
export interface QuotePdfData {
  quoteNumber: string;
  dateStr: string;
  expiryStr: string;
  customer: { name: string; email: string; phone: string; address: string };
  spec: {
    material: string;
    height: number;
    color: string;
    totalMeters: number;
    gatesCount: number;
  };
  lineItems: { label: string; amount: number }[];
  total: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function money(n: number): string {
  return '$' + n.toLocaleString();
}

// Fetch the logo from the public folder and convert it to a base64 data URL so
// it embeds reliably in the downloaded PDF. Returns null (never throws) if the
// logo is missing or is not a valid image, so PDF generation degrades gracefully.
async function loadLogo(
  fileName: string
): Promise<{ dataUrl: string; w: number; h: number; format: string } | null> {
  try {
    const base = (import.meta as any).env?.BASE_URL || '/';
    const url = `${base}${fileName}`.replace(/([^:])\/\//g, '$1/');
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;

    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(new Error('logo read error'));
      fr.readAsDataURL(blob);
    });

    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error('logo decode error'));
      img.src = dataUrl;
    });

    const mime = dataUrl.substring(dataUrl.indexOf('/') + 1, dataUrl.indexOf(';'));
    return { dataUrl, w: dims.w, h: dims.h, format: mime.toUpperCase() };
  } catch {
    return null;
  }
}

export async function buildQuotePdf(data: QuotePdfData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'px', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;

  const [pr, pg, pb] = hexToRgb(CLIENT_CONFIG.primaryColor);
  const gray: [number, number, number] = [90, 90, 90];
  const dark: [number, number, number] = [30, 30, 30];

  const drawSectionHeader = (text: string, x: number, yy: number, width: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(pr, pg, pb);
    doc.text(text.toUpperCase(), x, yy);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(x, yy + 5, x + width, yy + 5);
  };

  let y = margin;
  const rightX = pageW - margin;

  // ---- Header: logo (left) + company details (right) ----
  const logo = await loadLogo(CLIENT_CONFIG.logoFileName);
  let headerBottom = y;

  if (logo) {
    const maxW = 180;
    const maxH = 80;
    const scale = Math.min(maxW / logo.w, maxH / logo.h);
    const w = logo.w * scale;
    const h = logo.h * scale;
    try {
      doc.addImage(logo.dataUrl, logo.format, margin, y, w, h);
      headerBottom = Math.max(headerBottom, y + h);
    } catch {
      // If jsPDF cannot render the format, skip the logo silently.
    }
  }

  let cy = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(pr, pg, pb);
  doc.text(CLIENT_CONFIG.companyName, rightX, cy + 14, { align: 'right' });
  cy += 24;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(gray[0], gray[1], gray[2]);
  const companyLines = [
    CLIENT_CONFIG.companyPhone,
    CLIENT_CONFIG.companyEmail,
    CLIENT_CONFIG.companyWebsite,
    CLIENT_CONFIG.companyAddress,
    `ABN ${CLIENT_CONFIG.companyABN}`,
  ];
  companyLines.forEach((line) => {
    doc.text(line, rightX, cy + 8, { align: 'right' });
    cy += 13;
  });
  headerBottom = Math.max(headerBottom, cy);

  y = headerBottom + 14;
  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(2);
  doc.line(margin, y, pageW - margin, y);
  y += 26;

  // ---- Title + quote meta ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.text('QUOTE', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let my = y - 12;
  const metaRows: [string, string][] = [
    ['Quote No:', data.quoteNumber],
    ['Date:', data.dateStr],
    ['Valid Until:', data.expiryStr],
  ];
  metaRows.forEach(([label, val]) => {
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text(label, rightX - 120, my);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text(val, rightX, my, { align: 'right' });
    my += 15;
  });
  y = Math.max(y, my) + 22;

  // ---- Two columns: Prepared For + Fence Specification ----
  const colGap = 20;
  const colW = (contentW - colGap) / 2;
  const leftX = margin;
  const rcolX = margin + colW + colGap;
  const sectionTop = y;

  drawSectionHeader('Prepared For', leftX, sectionTop, colW);
  drawSectionHeader('Fence Specification', rcolX, sectionTop, colW);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const blankLine = '____________________';

  let ly = sectionTop + 20;
  const custRows: [string, string][] = [
    ['Name', data.customer.name],
    ['Phone', data.customer.phone],
    ['Email', data.customer.email],
    ['Site', data.customer.address],
  ];
  custRows.forEach(([label, val]) => {
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text(`${label}:`, leftX, ly);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    const text = val && val.trim() ? val : blankLine;
    const wrapped = doc.splitTextToSize(text, colW - 42) as string[];
    doc.text(wrapped, leftX + 42, ly);
    ly += 15 * wrapped.length;
  });

  let ry = sectionTop + 20;
  const specRows: [string, string][] = [
    ['Material', data.spec.material],
    ['Height', `${data.spec.height}mm`],
    ['Colour', data.spec.color],
    ['Total Length', `${data.spec.totalMeters}m`],
    ['Gates', `${data.spec.gatesCount}`],
  ];
  specRows.forEach(([label, val]) => {
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text(`${label}:`, rcolX, ry);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    const wrapped = doc.splitTextToSize(val, colW - 72) as string[];
    doc.text(wrapped, rcolX + 72, ry);
    ry += 15 * wrapped.length;
  });

  y = Math.max(ly, ry) + 20;

  // ---- Itemised cost breakdown + total ----
  drawSectionHeader('Cost Breakdown', margin, y, contentW);
  y += 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(gray[0], gray[1], gray[2]);
  doc.text('Description', margin, y);
  doc.text('Amount', pageW - margin, y, { align: 'right' });
  y += 6;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(dark[0], dark[1], dark[2]);
  data.lineItems.forEach((item) => {
    doc.text(item.label, margin, y);
    doc.text(money(item.amount), pageW - margin, y, { align: 'right' });
    y += 16;
  });

  y += 4;
  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(1);
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.text('Total (inc. GST)', margin, y);
  doc.setTextColor(pr, pg, pb);
  doc.text(money(data.total), pageW - margin, y, { align: 'right' });

  // ---- Footer: terms + legal name pinned near the bottom ----
  const legalY = pageH - margin;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(gray[0], gray[1], gray[2]);
  const termsLines = doc.splitTextToSize(CLIENT_CONFIG.quoteTerms, contentW) as string[];
  const termsHeight = termsLines.length * 11;
  const termsY = Math.max(y + 30, legalY - 22 - termsHeight);

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(margin, termsY - 12, pageW - margin, termsY - 12);
  doc.text(termsLines, margin, termsY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.text(CLIENT_CONFIG.companyLegalShort, pageW / 2, legalY, { align: 'center' });

  return doc;
}
