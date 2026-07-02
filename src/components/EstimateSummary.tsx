/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FenceMaterial, FenceHeight, ColorOption, Post, Segment, QuoteInquiry, DynamicPricing } from '../types';
import { estimateFencingCosts, FENCE_PRICES } from '../utils';
import { CLIENT_CONFIG } from '../clientConfig';
import type { QuotePdfData } from '../pdfQuote';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  FileCheck,
  Calculator,
  Sparkles,
  Info,
  CheckCircle,
  Truck,
  Wrench,
  X,
  History,
  FileSpreadsheet,
  Download,
  Share2
} from 'lucide-react';

interface EstimateSummaryProps {
  material: FenceMaterial;
  height: FenceHeight;
  color: ColorOption;
  postColor: ColorOption;
  posts: Post[];
  segments: Segment[];
  propertyFrontage: number;
  setIsRightPanelOpen?: (val: boolean) => void;
  customPricing?: DynamicPricing;
}

export default function EstimateSummary({
  material,
  height,
  color,
  postColor,
  posts,
  segments,
  propertyFrontage,
  setIsRightPanelOpen,
  customPricing
}: EstimateSummaryProps) {
  // Option: Include installation
  const [includeInstall, setIncludeInstall] = useState(true);

  // Quote form state
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [remarks, setRemarks] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  // Local persistent inbox/CRM history for the fencer!
  const [sentInquiries, setSentInquiries] = useState<QuoteInquiry[]>([]);
  const [showCRMInbox, setShowCRMInbox] = useState(false);
  const [selectedPastInquiry, setSelectedPastInquiry] = useState<QuoteInquiry | null>(null);

  // Load inquiries on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('fencing_pro_quotes');
      if (stored) {
        setSentInquiries(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Unable to load quotes from localStorage', e);
    }
  }, []);

  // Billing is bound directly to the locked map measurement (propertyFrontage), never to the
  // on-canvas post/segment geometry. The canvas is a visual preview only — how a fence line is
  // drawn (straight, diagonal, or following the roofline) must never change the quoted price.
  const gatesList = segments.filter(s => s.hasGate).map(s => ({ type: s.gateType }));

  const estimate = estimateFencingCosts(
    material,
    propertyFrontage,
    posts,
    gatesList,
    includeInstall,
    customPricing
  );

  // Branded PDF quote generation state
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfStatus, setPdfStatus] = useState('');

  // Assemble the exact same line items already displayed in the estimate panel.
  // These mirror the on-screen rows one-for-one — nothing is recalculated here.
  const buildPdfLineItems = (): { label: string; amount: number }[] => {
    const items: { label: string; amount: number }[] = [
      { label: `Boundary Panels (${estimate.totalMeters}m)`, amount: estimate.materialCost },
      { label: 'Structural Post Upgrades', amount: estimate.postsCost }
    ];
    if (estimate.gatesCost > 0) {
      items.push({ label: 'Premium Swing Gates', amount: estimate.gatesCost });
    }
    items.push({ label: `Fast-Set Concrete (${estimate.concreteBagsCount} bags)`, amount: estimate.concreteCost });
    if (includeInstall) {
      items.push({ label: 'Certified Installation Crew', amount: estimate.laborCost });
    }
    return items;
  };

  const buildPdfData = (): QuotePdfData => {
    const now = new Date();
    const expiry = new Date(now.getTime() + CLIENT_CONFIG.quoteValidityDays * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return {
      quoteNumber: `${CLIENT_CONFIG.proposalIdPrefix}-${Date.now().toString().slice(-5)}`,
      dateStr: fmt(now),
      expiryStr: fmt(expiry),
      customer: { name: fullName, email, phone, address },
      spec: {
        material: FENCE_PRICES[material].label,
        height,
        color: color.name,
        totalMeters: estimate.totalMeters,
        gatesCount: gatesList.length
      },
      lineItems: buildPdfLineItems(),
      total: estimate.totalPrice
    };
  };

  const pdfFileName = () => {
    const safeName = (fullName || 'Fence').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'Fence';
    const dateFile = new Date().toLocaleDateString('en-AU').replace(/\//g, '-');
    return `Quote-${safeName}-${dateFile}.pdf`;
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    setPdfStatus('');
    try {
      // Lazy-load jsPDF + the builder only when actually generating a PDF.
      const { buildQuotePdf } = await import('../pdfQuote');
      const doc = await buildQuotePdf(buildPdfData());
      doc.save(pdfFileName());
      setPdfStatus('PDF downloaded — you can now attach it in WhatsApp or email.');
    } catch (err) {
      console.error('PDF generation failed', err);
      setPdfStatus('Could not generate the PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSharePdf = async () => {
    setIsGeneratingPdf(true);
    setPdfStatus('');
    try {
      // Lazy-load jsPDF + the builder only when actually generating a PDF.
      const { buildQuotePdf } = await import('../pdfQuote');
      const doc = await buildQuotePdf(buildPdfData());
      const fileName = pdfFileName();
      const blob = doc.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `${CLIENT_CONFIG.companyName} Quote`,
            text: `Fence quote from ${CLIENT_CONFIG.companyName}`
          });
        } catch (shareErr: any) {
          // User dismissing the native share sheet is not an error we surface.
          if (shareErr && shareErr.name !== 'AbortError') {
            doc.save(fileName);
            setPdfStatus('PDF downloaded — you can now attach it in WhatsApp or email.');
          }
        }
      } else {
        // Web Share (with files) unsupported — fall back to a plain download.
        doc.save(fileName);
        setPdfStatus('PDF downloaded — you can now attach it in WhatsApp or email.');
      }
    } catch (err) {
      console.error('PDF share failed', err);
      setPdfStatus('Could not generate the PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // ---- PDF generation for an already-saved proposal record (Proposal Log) ----
  // These read the EXACT values stored in the proposal when it was created —
  // no cost or spec is recalculated. Newer records persist a full itemised
  // breakdown (rendered as-is); older records only stored the final total, so
  // they fall back to a single "as quoted" line.
  const [isGeneratingRecordPdf, setIsGeneratingRecordPdf] = useState(false);
  const [recordPdfStatus, setRecordPdfStatus] = useState('');

  const buildPdfDataFromInquiry = (inq: QuoteInquiry): QuotePdfData => {
    // The record id is `inquiry_<timestamp>`; recover the creation timestamp
    // from it so the quote/expiry dates reflect when it was actually saved.
    const digits = inq.id.replace(/[^0-9]/g, '');
    const baseTs = digits ? parseInt(digits, 10) : Date.now();
    const baseDate = new Date(baseTs);
    const expiry = new Date(baseDate.getTime() + CLIENT_CONFIG.quoteValidityDays * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return {
      quoteNumber: `${CLIENT_CONFIG.proposalIdPrefix}-${(digits || `${baseTs}`).slice(-5)}`,
      dateStr: fmt(baseDate),
      expiryStr: fmt(expiry),
      customer: { name: inq.fullName, email: inq.email, phone: inq.phone, address: inq.address },
      // Fallbacks mirror exactly what the record modal already displays on screen.
      spec: {
        material: inq.planSummary?.material || 'Slat Fencing',
        height: inq.planSummary?.height || 1200,
        color: inq.planSummary?.colorName || 'Monument',
        totalMeters: inq.fenceLength,
        gatesCount: inq.planSummary?.gatesCount || 0
      },
      // New proposals persist a full itemised breakdown — render it exactly as
      // stored. Old proposals (saved before this field existed) fall back to the
      // single "as quoted" line so they still generate a valid PDF.
      lineItems:
        inq.costBreakdown && inq.costBreakdown.length > 0
          ? inq.costBreakdown.map((item) => ({ label: item.description, amount: item.amount }))
          : [{ label: 'Fence supply & installation (as quoted)', amount: inq.totalCost }],
      total: inq.totalCost
    };
  };

  const recordPdfFileName = (inq: QuoteInquiry) => {
    const safeName = (inq.fullName || 'Fence').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'Fence';
    const digits = inq.id.replace(/[^0-9]/g, '');
    const baseTs = digits ? parseInt(digits, 10) : Date.now();
    const dateFile = new Date(baseTs).toLocaleDateString('en-AU').replace(/\//g, '-');
    return `Quote-${safeName}-${dateFile}.pdf`;
  };

  const handleDownloadRecordPdf = async (inq: QuoteInquiry) => {
    setIsGeneratingRecordPdf(true);
    setRecordPdfStatus('');
    try {
      // Lazy-load jsPDF + the builder only when actually generating a PDF.
      const { buildQuotePdf } = await import('../pdfQuote');
      const doc = await buildQuotePdf(buildPdfDataFromInquiry(inq));
      doc.save(recordPdfFileName(inq));
      setRecordPdfStatus('PDF downloaded — you can now attach it in WhatsApp or email.');
    } catch (err) {
      console.error('PDF generation failed', err);
      setRecordPdfStatus('Could not generate the PDF. Please try again.');
    } finally {
      setIsGeneratingRecordPdf(false);
    }
  };

  const handleShareRecordPdf = async (inq: QuoteInquiry) => {
    setIsGeneratingRecordPdf(true);
    setRecordPdfStatus('');
    try {
      // Lazy-load jsPDF + the builder only when actually generating a PDF.
      const { buildQuotePdf } = await import('../pdfQuote');
      const doc = await buildQuotePdf(buildPdfDataFromInquiry(inq));
      const fileName = recordPdfFileName(inq);
      const blob = doc.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `${CLIENT_CONFIG.companyName} Quote`,
            text: `Fence quote from ${CLIENT_CONFIG.companyName}`
          });
        } catch (shareErr: any) {
          // User dismissing the native share sheet is not an error we surface.
          if (shareErr && shareErr.name !== 'AbortError') {
            doc.save(fileName);
            setRecordPdfStatus('PDF downloaded — you can now attach it in WhatsApp or email.');
          }
        }
      } else {
        // Web Share (with files) unsupported — fall back to a plain download.
        doc.save(fileName);
        setRecordPdfStatus('PDF downloaded — you can now attach it in WhatsApp or email.');
      }
    } catch (err) {
      console.error('PDF share failed', err);
      setRecordPdfStatus('Could not generate the PDF. Please try again.');
    } finally {
      setIsGeneratingRecordPdf(false);
    }
  };

  // Submit quote to CRM handler
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !phone || !address) return;

    setIsSubmitting(true);

    const newInquiry: QuoteInquiry = {
      id: `inquiry_${Date.now()}`,
      fullName,
      email,
      phone,
      address,
      fenceLength: estimate.totalMeters,
      totalCost: estimate.totalPrice,
      // Persist the same itemised rows currently displayed in the estimate
      // panel so future PDFs of this record show a full cost table. This only
      // captures already-computed values — nothing is recalculated here.
      costBreakdown: buildPdfLineItems().map(({ label, amount }) => ({
        description: label,
        amount
      })),
      message: remarks,
      status: 'pending',
      createdAt: new Date().toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      planSummary: {
        material: FENCE_PRICES[material].label,
        height,
        colorName: color.name,
        segmentsCount: segments.length,
        gatesCount: gatesList.length
      }
    };

    // Simulate server side post latency
    setTimeout(() => {
      const updated = [newInquiry, ...sentInquiries];
      setSentInquiries(updated);
      try {
        localStorage.setItem('fencing_pro_quotes', JSON.stringify(updated));
      } catch (err) {
        console.error(err);
      }
      setIsSubmitting(false);
      setIsSubmitted(true);
      
      // Clear inputs
      // Note: We clear the input variables so they are empty for the next form.
      // But we preserve the values of fullName and address for the success screen rendering right below.
    }, 1200);
  };

  const clearCRMInboxes = () => {
    if (window.confirm('Are you sure you want to clear historic inquiries?')) {
      localStorage.removeItem('fencing_pro_quotes');
      setSentInquiries([]);
    }
  };

  return (
    <div className="flex flex-col w-80 sm:w-92 shrink-0 p-5.5 h-full overflow-y-auto gap-4 relative z-20 bg-[#1f2125] text-zinc-100 border-l border-[#2f3136]">
      
      {/* Title block */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-rose-500 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-zinc-400" />
          Live Cost Breakdown
        </h4>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] bg-rose-950/40 text-rose-400 font-bold border border-rose-900/30 px-2 py-0.5 rounded font-mono uppercase">
            {CLIENT_CONFIG.companyName} Rate Card
          </span>
          {setIsRightPanelOpen && (
            <button
              onClick={() => setIsRightPanelOpen(false)}
              className="p-1 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded transition cursor-pointer"
              title="Collapse estimate panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Basic configurations line summary */}
      <div className="bg-[#18191c] p-3.5 rounded-xl border border-zinc-800 flex flex-col gap-2">
        <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white tracking-tight">{FENCE_PRICES[material].label}</span>
            <span className="text-[10px] text-zinc-400 font-semibold">{height}mm height &bull; {color.name} finish</span>
          </div>
          <span className="text-xs font-bold text-rose-400 font-mono text-right">{estimate.totalMeters}m</span>
        </div>

        <div className="flex justify-between text-[11px] text-zinc-400">
          <span>Boundary Posts:</span>
          <span className="font-mono text-zinc-300 font-semibold">{estimate.postCount} pillars</span>
        </div>

        <div className="flex justify-between text-[11px] text-zinc-400">
          <span>Gates integrated:</span>
          <span className="font-mono text-zinc-300 font-semibold">{gatesList.length} swing gates</span>
        </div>
      </div>

      {/* Core installation toggle */}
      <div className="flex items-center justify-between bg-zinc-900/40 border border-zinc-800 rounded-xl p-3">
        <div className="flex gap-2">
          <Wrench className="w-4.5 h-4.5 text-rose-500 mt-0.5 shrink-0" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white">Include Assembly & Labour</span>
          </div>
        </div>
        <input
          type="checkbox"
          checked={includeInstall}
          onChange={(e) => setIncludeInstall(e.target.checked)}
          className="w-4 h-4 bg-[#1a1b1f] border-zinc-700 rounded cursor-pointer"
          style={{ accentColor: CLIENT_CONFIG.primaryColor }}
        />
      </div>

      {/* Detailed line item estimations bill */}
      <div className="flex flex-col gap-2.5 mt-1">
        {/* Item 1: Panels */}
        <div className="flex justify-between text-xs text-zinc-400">
          <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-zinc-500" /> Boundary Panels ({estimate.totalMeters}m)</span>
          <span className="font-mono text-zinc-200">${estimate.materialCost.toLocaleString()}</span>
        </div>
        
        {/* Item 2: Upgrades */}
        <div className="flex justify-between text-xs text-zinc-400">
          <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-zinc-500" /> Structural Post Upgrades</span>
          <span className="font-mono text-zinc-200">${estimate.postsCost.toLocaleString()}</span>
        </div>

        {/* Item 3: Gates */}
        {estimate.gatesCost > 0 && (
          <div className="flex justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-1.5"><FileCheck className="w-3.5 h-3.5 text-zinc-500" /> Premium Swing Gates</span>
            <span className="font-mono text-zinc-200">${estimate.gatesCost.toLocaleString()}</span>
          </div>
        )}

        {/* Item 4: Ancillaries (Concrete / Fasteners) */}
        <div className="flex justify-between text-xs text-zinc-400">
          <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-zinc-500" /> Fast-Set Concrete ({estimate.concreteBagsCount} bags)</span>
          <span className="font-mono text-zinc-200">${estimate.concreteCost.toLocaleString()}</span>
        </div>

        {/* Item 5: Installer labour */}
        {includeInstall && (
          <div className="flex justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5 text-zinc-500" /> Certified Installation Crew</span>
            <span className="font-mono text-zinc-200">${estimate.laborCost.toLocaleString()}</span>
          </div>
        )}

        {/* Grand Total visual strip */}
        <div className="bg-[#141517] p-4 rounded-xl border border-[#2f3136] w-full text-left mt-3 relative overflow-hidden">
          <div className="flex justify-between items-center text-xs font-bold text-white">
            <span>Calculated Bid Proposal:</span>
            <span className="text-teal-400 font-mono text-sm">${estimate.totalPrice.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Button to show model */}
      <button
        onClick={() => {
          setIsSubmitted(false);
          setShowQuoteModal(true);
        }}
        className="w-full py-3 hover:opacity-90 text-white font-bold rounded-xl text-xs uppercase tracking-widest cursor-pointer shadow-lg transition-colors mt-2"
        style={{ backgroundColor: CLIENT_CONFIG.primaryColor }}
      >
        Compile & Request Proposal
      </button>

      {/* Branded PDF quote: download + native share */}
      <div className="flex flex-col gap-2 mt-2">
        <div className="flex gap-2">
          <button
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="flex-1 py-2.5 bg-[#18191c] hover:bg-zinc-800 border border-[#2f3136] text-zinc-100 font-bold rounded-xl text-[11px] uppercase tracking-wider cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isGeneratingPdf ? (
              <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Generate PDF Quote</span>
          </button>
          <button
            onClick={handleSharePdf}
            disabled={isGeneratingPdf}
            className="px-4 py-2.5 bg-[#18191c] hover:bg-zinc-800 border border-[#2f3136] text-zinc-100 font-bold rounded-xl text-[11px] uppercase tracking-wider cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
            title="Share the PDF via WhatsApp, email, etc."
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>
        </div>
        {pdfStatus && (
          <p className="text-[10px] text-zinc-400 leading-relaxed text-center px-1">{pdfStatus}</p>
        )}
      </div>

      {/* Extra CRM Historic inquiries drawer button */}
      <div className="mt-auto border-t border-zinc-800 pt-3 flex flex-col gap-2.5 relative z-30 pointer-events-auto">
        <button
          onClick={() => setShowCRMInbox(!showCRMInbox)}
          className="flex w-full items-center justify-between text-xs text-zinc-400 hover:text-white transition cursor-pointer py-1 relative z-30 pointer-events-auto"
        >
          <span className="flex items-center gap-1.5">
            <History className="w-4 h-4 text-rose-500" />
            <span className="font-bold">{CLIENT_CONFIG.companyName} Proposal Log</span>
          </span>
          <span className="font-mono text-[10px] bg-zinc-800 text-zinc-400 px-2.5 py-0.5 rounded-full">
            {sentInquiries.length} Inquiries
          </span>
        </button>

        {showCRMInbox && (
          <div className="flex flex-col gap-2 p-3 rounded-xl border max-h-52 overflow-y-auto bg-[#18191c] border-zinc-800 relative z-30 pointer-events-auto">
            <div className="flex justify-between items-center text-[10px] border-b pb-1.5 mb-1.5 border-zinc-800">
              <span className="font-semibold uppercase text-zinc-400">Interactive Ledger</span>
              <button onClick={clearCRMInboxes} className="text-red-500 hover:text-red-400 text-[10px] font-sans font-medium cursor-pointer">
                Clear All
              </button>
            </div>

            {sentInquiries.length === 0 ? (
              <span className="text-[10px] text-zinc-500 text-center py-4 italic">No submitted designs yet. Submit custom requests to log them here.</span>
            ) : (
              sentInquiries.map((inq) => (
                <div 
                  key={inq.id}
                  onClick={() => { setSelectedPastInquiry(inq); setRecordPdfStatus(''); }}
                  title="Click to view full inquiry details"
                  className="text-[10px] border-b pb-2 flex flex-col gap-1 px-2 py-2 rounded transition-all text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-white cursor-pointer"
                >
                  <div className="flex justify-between font-bold leading-tight text-white mb-0.5">
                    <span className="underline decoration-dotted text-rose-400">{inq.fullName}</span>
                    <span className="text-emerald-400 font-mono">${inq.totalCost.toLocaleString()}</span>
                  </div>
                  <div className="text-[9px] text-zinc-500 flex items-center justify-between mt-0.5 font-sans">
                    <span>{inq.planSummary?.material || "Fence Block"} ({inq.fenceLength}m)</span>
                    <span className="text-zinc-500 font-mono">{inq.createdAt}</span>
                  </div>
                  <p className="text-[9.5px] leading-relaxed mt-1 italic font-light p-1.5 rounded border text-zinc-300 bg-[#121315] border-zinc-800/80 line-clamp-1">
                    Address: {inq.address}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* MODAL WINDOW: PAST PROPOSAL DETAIL VIEWERS */}
      {selectedPastInquiry && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1f2125] border border-zinc-700 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#2f3136] bg-[#141517] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-teal-400 animate-pulse" />
                <h3 className="text-sm font-extrabold font-sans text-white uppercase tracking-wider">Proposal Record Details</h3>
              </div>
              <button 
                onClick={() => setSelectedPastInquiry(null)}
                className="text-zinc-400 hover:text-white transition p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-5">
              <div className="bg-[#18191c] p-4 rounded-xl border border-zinc-800 flex flex-col gap-2">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Layout Specifications</span>
                <ul className="text-xs text-zinc-300 grid grid-cols-2 gap-y-1.5 gap-x-3.5 list-disc pl-4">
                  <li>Material: <b className="text-white">{selectedPastInquiry.planSummary?.material || "Slat Fencing"}</b></li>
                  <li>Height: <b className="text-white">{selectedPastInquiry.planSummary?.height || 1200}mm</b></li>
                  <li>Color: <b className="text-white">{selectedPastInquiry.planSummary?.colorName || "Monument"}</b></li>
                  <li>Total Distance: <b className="text-white font-mono">{selectedPastInquiry.fenceLength}m</b></li>
                  <li>Segments: <b className="text-white font-mono">{selectedPastInquiry.planSummary?.segmentsCount || 0}</b></li>
                  <li>Gates: <b className="text-white font-mono">{selectedPastInquiry.planSummary?.gatesCount || 0}</b></li>
                </ul>
                <div className="border-t border-zinc-800/60 pt-2.5 mt-1.5 flex justify-between items-center text-xs font-bold text-white">
                  <span>Calculated Bid Proposal:</span>
                  <span className="text-teal-400 font-mono text-sm">${selectedPastInquiry.totalCost.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3.5">
                <span className="text-xs font-bold text-rose-500 uppercase tracking-widest leading-none">Client & Site Information</span>
                
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-[#18191c] p-3 rounded-lg border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 font-medium block">Full Name</span>
                    <span className="text-white font-semibold">{selectedPastInquiry.fullName}</span>
                  </div>
                  <div className="bg-[#18191c] p-3 rounded-lg border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 font-medium block">Phone</span>
                    <span className="text-white font-mono">{selectedPastInquiry.phone}</span>
                  </div>
                </div>

                <div className="bg-[#18191c] p-3 rounded-lg border border-zinc-800 text-xs">
                  <span className="text-[10px] text-zinc-500 font-medium block">Email Address</span>
                  <span className="text-white font-mono">{selectedPastInquiry.email}</span>
                </div>

                <div className="bg-[#18191c] p-3 rounded-lg border border-zinc-800 text-xs">
                  <span className="text-[10px] text-zinc-500 font-medium block">{CLIENT_CONFIG.regionState + " Site Address"}</span>
                  <span className="text-white">{selectedPastInquiry.address}</span>
                </div>

                {selectedPastInquiry.message && (
                  <div className="bg-[#18191c] p-3 rounded-lg border border-zinc-800 text-xs">
                    <span className="text-[10px] text-zinc-500 font-medium block">Site Remarks / Notes</span>
                    <p className="text-zinc-300 italic mt-1 font-light leading-relaxed">
                      "{selectedPastInquiry.message}"
                    </p>
                  </div>
                )}
               
                <div className="text-[10px] text-zinc-500 font-mono text-right mt-1">
                  Submitted On: {selectedPastInquiry.createdAt}
                </div>
              </div>

              {/* Branded PDF for this saved proposal: download + native share */}
              <div className="flex flex-col gap-2 border-t border-[#2f3136] pt-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownloadRecordPdf(selectedPastInquiry)}
                    disabled={isGeneratingRecordPdf}
                    className="flex-1 py-2.5 bg-[#18191c] hover:bg-zinc-800 border border-[#2f3136] text-zinc-100 font-bold rounded-xl text-[11px] uppercase tracking-wider cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isGeneratingRecordPdf ? (
                      <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Generate PDF</span>
                  </button>
                  <button
                    onClick={() => handleShareRecordPdf(selectedPastInquiry)}
                    disabled={isGeneratingRecordPdf}
                    className="px-4 py-2.5 bg-[#18191c] hover:bg-zinc-800 border border-[#2f3136] text-zinc-100 font-bold rounded-xl text-[11px] uppercase tracking-wider cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Share the PDF via WhatsApp, email, etc."
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>
                </div>
                {recordPdfStatus && (
                  <p className="text-[10px] text-zinc-400 leading-relaxed text-center px-1">{recordPdfStatus}</p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[#2f3136] bg-[#141517] flex justify-end">
              <button 
                onClick={() => setSelectedPastInquiry(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold py-2.5 px-5 rounded-lg text-xs uppercase cursor-pointer"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL WINDOW: QUOTATION REQUEST CAPTURE MODULE */}
      {showQuoteModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1f2125] border border-zinc-700 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#2f3136] bg-[#141517] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-rose-500 animate-bounce" />
                <h3 className="text-sm font-extrabold font-sans text-white uppercase tracking-wider">{CLIENT_CONFIG.companyName} Proposal Engine</h3>
              </div>
              <button 
                onClick={() => setShowQuoteModal(false)}
                className="text-zinc-400 hover:text-white transition p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal content body */}
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-5">
              
              {!isSubmitted ? (
                <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
                  <div className="bg-[#18191c] p-4 rounded-xl border border-zinc-800 flex flex-col gap-2">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Configured Layout Specifications</span>
                    <ul className="text-xs text-zinc-300 grid grid-cols-2 gap-y-1.5 gap-x-3.5 list-disc pl-4">
                      <li>Material: <b className="text-white">{FENCE_PRICES[material].label}</b></li>
                      <li>Height: <b className="text-white">{height}mm</b></li>
                      <li>Color: <b className="text-white">{color.name}</b></li>
                      <li>Calculated Frontage: <b className="text-white font-mono">{estimate.totalMeters}m</b></li>
                      <li>Post Pillars: <b className="text-white font-mono">{estimate.postCount}</b></li>
                      <li>Labor: <b className="text-white">{includeInstall ? 'Supply & Install' : 'Raw Materials (DIY)'}</b></li>
                    </ul>
                    <div className="border-t border-zinc-800/60 pt-2.5 mt-1.5 flex justify-between items-center text-xs font-bold text-white">
                      <span>{CLIENT_CONFIG.companyName} Level Bid Proposal:</span>
                      <span className="text-rose-400 font-mono text-sm">${estimate.totalPrice.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3.5">
                    <span className="text-xs font-bold text-rose-500 uppercase tracking-widest leading-none pt-1">Client & Site Information</span>
                    
                    {/* Full Name field */}
                    <div className="flex flex-col gap-1">
                      <label htmlFor="customer_full_name" className="text-[10px] text-zinc-400 font-medium">Customer Full Name*</label>
                      <input
                        id="customer_full_name"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Jack Taylor"
                        className="w-full text-xs bg-[#18191c] border border-[#2f3136] text-white px-3 py-2.5 rounded-lg focus:outline-none focus:border-rose-500 transition"
                      />
                    </div>

                    {/* Contact grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label htmlFor="customer_email" className="text-[10px] text-zinc-400 font-medium">Email Address*</label>
                        <input
                          id="customer_email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="client@gmail.com"
                          className="w-full text-xs bg-[#18191c] border border-[#2f3136] text-white px-3 py-2.5 rounded-lg focus:outline-none focus:border-rose-500 transition"
                        />
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <label htmlFor="customer_phone" className="text-[10px] text-zinc-400 font-medium">Australian Mobile*</label>
                        <input
                          id="customer_phone"
                          type="text"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+61 400 000 000"
                          className="w-full text-xs bg-[#18191c] border border-[#2f3136] text-white px-3 py-2.5 rounded-lg focus:outline-none focus:border-rose-500 transition"
                        />
                      </div>
                    </div>

                    {/* Site Boundary address */}
                    <div className="flex flex-col gap-1">
                      <label htmlFor="site_location" className="text-[10px] text-zinc-400 font-medium">{CLIENT_CONFIG.regionState + " Site Address*"}</label>
                      <input
                        id="site_location"
                        type="text"
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="29 Belmore Road, Randwick NSW 2031"
                        className="w-full text-xs bg-[#18191c] border border-[#2f3136] text-white px-3 py-2.5 rounded-lg focus:outline-none focus:border-rose-500 transition"
                      />
                    </div>

                    {/* Direct instructions memo */}
                    <div className="flex flex-col gap-1">
                      <label htmlFor="quote_enquiry_message" className="text-[10px] text-zinc-400 font-medium">Additional Site Notes</label>
                      <textarea
                        id="quote_enquiry_message"
                        rows={2.5}
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="Driveway slope, sand ground conditions, or gate remote electrical requirements etc."
                        className="w-full text-xs bg-[#18191c] border border-[#2f3136] text-white px-3 py-2.5 rounded-lg focus:outline-none focus:border-rose-500 transition resize-none"
                      />
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex justify-end gap-2.5 pt-3.5 border-t border-[#2f3136]">
                    <button
                      type="button"
                      onClick={() => setShowQuoteModal(false)}
                      className="px-4 py-2.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-750 transition cursor-pointer font-bold uppercase select-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer uppercase select-none"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Generating..</span>
                        </>
                      ) : (
                        <span>Verify & Save Design</span>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                /* Success screen */
                <div className="flex flex-col items-center text-center py-7 px-4 gap-4">
                  <div className="w-14 h-14 bg-emerald-950/40 text-emerald-400 border-2 border-emerald-500/30 rounded-full flex items-center justify-center shadow-lg">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-white font-sans uppercase">Proposal Generated!</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed mt-2.5 max-w-[340px] mx-auto">
                      Thank you! Clear-cut costings have been saved inside the interactive fencer log ledger below. Your business bid is formatted for printing.
                    </p>
                  </div>

                  <div className="bg-[#18191c] p-4 rounded-xl border border-zinc-800 w-full text-left mt-3">
                    <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-widest block mb-1">{CLIENT_CONFIG.companyName} Proposal Receipt</span>
                    <span className="text-[9.5px] text-zinc-500 font-extrabold uppercase block mb-3 font-mono">{CLIENT_CONFIG.companyLegalShort}</span>
                    <div className="grid grid-cols-2 gap-y-1.5 text-[11px] text-zinc-300">
                      <span>Proposal ID:</span>
                      <span className="font-mono text-rose-450 text-right font-bold">#{CLIENT_CONFIG.proposalIdPrefix}-{Date.now().toString().slice(-5)}</span>

                      <span>Project Estimate:</span>
                      <span className="font-mono text-rose-450 text-right font-bold font-sans">${estimate.totalPrice.toLocaleString()}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowQuoteModal(false)}
                    className="mt-4 bg-rose-600 text-white hover:bg-rose-500 font-bold px-6 py-2.5 rounded-lg text-xs uppercase cursor-pointer"
                  >
                    Return to Designer Studio
                  </button>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
