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

// Choose black or white text depending on how light the background colour is,
// so text on the brand colour stays readable for any client palette.
function getContrastTextColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

// Blend a colour toward white to produce a soft tint (t = 0 → white, 1 → colour).
function tint(rgb: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(255 - (255 - rgb[0]) * t),
    Math.round(255 - (255 - rgb[1]) * t),
    Math.round(255 - (255 - rgb[2]) * t)
  ];
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

  // ---- Palette ----
  const primary = hexToRgb(CLIENT_CONFIG.primaryColor);
  const onPrimary = hexToRgb(getContrastTextColor(CLIENT_CONFIG.primaryColor)); // #000 or #fff
  const infoBg = tint(primary, 0.15); // 15% brand tint on white
  const pillBg: [number, number, number] = [242, 242, 244];
  const dark: [number, number, number] = [30, 30, 30];
  const muted: [number, number, number] = [120, 120, 120];
  const hairline: [number, number, number] = [228, 228, 232];

  const setFill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

  const padX = 20;
  const contentX = padX;
  const contentW = pageW - padX * 2;

  let y = 0;

  // =====================================================================
  // HEADER BLOCK — full-width primaryColor band
  // =====================================================================
  const headerH = 78; // ~15px top/bottom padding around the content
  setFill(primary);
  doc.rect(0, 0, pageW, headerH, 'F');

  const headerPadTop = 15;
  const headerCenterY = headerH / 2;

  // Left: logo (optional) then company name + ABN
  let leftCursor = padX;
  const logo = await loadLogo(CLIENT_CONFIG.logoFileName);
  if (logo) {
    const maxH = 40;
    const maxW = 80;
    const scale = Math.min(maxW / logo.w, maxH / logo.h);
    const w = logo.w * scale;
    const h = logo.h * scale;
    try {
      doc.addImage(logo.dataUrl, logo.format, leftCursor, headerCenterY - h / 2, w, h);
      leftCursor += w + 12;
    } catch {
      // Unrenderable format → fall through; the company name takes the space.
    }
  }

  setText(onPrimary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(CLIENT_CONFIG.companyName, leftCursor, headerCenterY + 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`ABN ${CLIENT_CONFIG.companyABN}`, leftCursor, headerCenterY + 13);

  // Right: "QUOTE" + quote number
  const rightX = pageW - padX;
  setText(onPrimary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text('QUOTE', rightX, headerPadTop + 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(data.quoteNumber, rightX, headerPadTop + 34, { align: 'right' });

  y = headerH;

  // =====================================================================
  // INFO BAR — light brand tint, two columns
  // =====================================================================
  const infoPadTop = 10;
  const infoLineH = 12;
  const infoRows = 4;
  const infoH = infoPadTop * 2 + 16 + infoRows * infoLineH;
  setFill(infoBg);
  doc.rect(0, y, pageW, infoH, 'F');

  const colGap = 20;
  const colW = (contentW - colGap) / 2;
  const leftColX = contentX;
  const rightColX = contentX + colW + colGap;
  const infoY = y + infoPadTop + 8;

  const drawInfoCol = (x: number, label: string, rows: string[]) => {
    let cy = infoY;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setText(primary);
    doc.text(label, x, cy);
    cy += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(dark);
    rows.forEach((r) => {
      if (r) {
        const line = (doc.splitTextToSize(r, colW) as string[])[0] || r;
        doc.text(line, x, cy);
      }
      cy += infoLineH;
    });
  };

  drawInfoCol(leftColX, 'PREPARED FOR', [
    data.customer.name,
    data.customer.phone,
    data.customer.email,
    data.customer.address
  ]);
  drawInfoCol(rightColX, 'QUOTE DETAILS', [
    `Date: ${data.dateStr}`,
    `Valid Until: ${data.expiryStr}`,
    `Ref: ${data.quoteNumber}`,
    ''
  ]);

  y += infoH;

  // Section label in the brand colour
  const sectionLabel = (text: string, yy: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setText(primary);
    doc.text(text, contentX, yy);
  };

  // =====================================================================
  // FENCE SPECIFICATION — grey pill row
  // =====================================================================
  y += 24;
  sectionLabel('FENCE SPECIFICATION', y);
  y += 12;

  const pills: [string, string][] = [
    ['MATERIAL', data.spec.material],
    ['HEIGHT', `${data.spec.height}mm`],
    ['COLOUR', data.spec.color],
    ['LENGTH', `${data.spec.totalMeters}m`],
    ['GATES', `${data.spec.gatesCount}`]
  ];
  const pillGap = 8;
  const pillW = (contentW - pillGap * (pills.length - 1)) / pills.length;
  const pillH = 34;
  pills.forEach(([label, value], i) => {
    const px = contentX + i * (pillW + pillGap);
    setFill(pillBg);
    doc.roundedRect(px, y, pillW, pillH, 3, 3, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    setText(muted);
    doc.text(label, px + 6, y + 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setText(dark);
    const val = (doc.splitTextToSize(value, pillW - 12) as string[])[0] || '';
    doc.text(val, px + 6, y + 25);
  });

  y += pillH;

  // =====================================================================
  // COST BREAKDOWN — clean minimal table with bullet squares
  // =====================================================================
  y += 26;
  sectionLabel('COST BREAKDOWN', y);
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setText(muted);
  doc.text('DESCRIPTION', contentX, y);
  doc.text('AMOUNT', pageW - padX, y, { align: 'right' });
  y += 6;
  setDraw(hairline);
  doc.setLineWidth(0.5);
  doc.line(contentX, y, pageW - padX, y);
  y += 15;

  const rowH = 18;
  const bullet = 5;
  data.lineItems.forEach((item) => {
    setFill(primary);
    doc.rect(contentX, y - bullet, bullet, bullet, 'F'); // brand-colour bullet square
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setText(dark);
    doc.text(item.label, contentX + bullet + 6, y);
    doc.text(money(item.amount), pageW - padX, y, { align: 'right' });
    setDraw(hairline);
    doc.setLineWidth(0.5);
    doc.line(contentX, y + 6, pageW - padX, y + 6); // thin separator
    y += rowH;
  });

  // =====================================================================
  // TOTAL BAR — full-width brand band
  // =====================================================================
  y += 8;
  const totalH = 40;
  setFill(primary);
  doc.rect(0, y, pageW, totalH, 'F');
  setText(onPrimary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total (inc. GST)', contentX, y + totalH / 2 + 4);
  doc.setFontSize(18);
  doc.text(money(data.total), pageW - padX, y + totalH / 2 + 5, { align: 'right' });
  y += totalH;

  // =====================================================================
  // FOOTER — pinned near the bottom, muted grey
  // =====================================================================
  const footerBottom = pageH - 18;
  const termsColor: [number, number, number] = [90, 90, 90]; // darker than `muted` so the terms stay legible
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setText(termsColor);
  const termsLines = doc.splitTextToSize(CLIENT_CONFIG.quoteTerms, contentW) as string[];
  const contactLine = [
    CLIENT_CONFIG.companyPhone,
    CLIENT_CONFIG.companyEmail,
    CLIENT_CONFIG.companyWebsite
  ]
    .filter(Boolean)
    .join('  ·  ');

  const legalGap = 12;
  const contactGap = 12;
  const termsBlockH = termsLines.length * 11;
  const footerTop = footerBottom - (termsBlockH + legalGap + contactGap);
  const startFooterY = Math.max(y + 24, footerTop);

  setDraw(hairline);
  doc.setLineWidth(0.5);
  doc.line(contentX, startFooterY - 10, pageW - padX, startFooterY - 10);

  let fy = startFooterY;
  doc.text(termsLines, contentX, fy);
  fy += termsBlockH + legalGap;

  setText(muted);
  doc.setFontSize(7);
  doc.text(CLIENT_CONFIG.companyLegalShort, contentX, fy);

  doc.text(contactLine, pageW / 2, footerBottom, { align: 'center' });

  return doc;
}
