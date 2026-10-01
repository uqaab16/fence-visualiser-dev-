import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import Pii from './components/Pii';

// SR-06 guard. Customer and contractor identity text must render inside <Pii> (PostHog session replay masks it),
// and must never sit in attributes PostHog click capture records. If this fails, wrap the value in <Pii>.
// Form values (value= / defaultValue=) are fine: PostHog's maskAllInputs covers them.

const IDENTITY = new Set([
  'fullName', 'email', 'phone', 'address', 'message', 'emailInput', 'userEmail',
  'clientName', 'customerName', 'customer_name', 'customer_email', 'customer_phone', 'customer_address',
  'authError', // Supabase auth errors can echo the typed email address
]);
const NOT_IDENTITY_MESSAGE_OWNERS = /^(error|err|e)$/;
const RISKY_ATTRIBUTE = /^(title|alt|aria-label|aria-description|href|id|name)$|^data-/;
const FORM_VALUE_ATTRIBUTES = new Set(['value', 'defaultValue', 'checked', 'defaultChecked']);
const ALLOWED: { file: string; text: string; why: string }[] = [
  { file: 'components/SatelliteModal.tsx', text: 'yard.address', why: 'sandbox preset yards are fake demo data' },
];

function renderedIdentityRefs(e: ts.Node, out: string[]): void {
  if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e)) return renderedIdentityRefs(e.expression, out);
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return; // checked on its own
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return;
  if (ts.isBinaryExpression(e)) {
    if (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return renderedIdentityRefs(e.right, out); // left side is only a condition
    renderedIdentityRefs(e.left, out);
    return renderedIdentityRefs(e.right, out);
  }
  if (ts.isConditionalExpression(e)) {
    renderedIdentityRefs(e.whenTrue, out);
    return renderedIdentityRefs(e.whenFalse, out);
  }
  if (ts.isPropertyAccessExpression(e)) {
    const name = e.name.text;
    const safeMessage = name === 'message' && NOT_IDENTITY_MESSAGE_OWNERS.test(e.expression.getText());
    if (IDENTITY.has(name) && !safeMessage) out.push(name);
    return renderedIdentityRefs(e.expression, out);
  }
  if (ts.isIdentifier(e)) {
    if (IDENTITY.has(e.text)) out.push(e.text);
    return;
  }
  if (ts.isTemplateExpression(e)) {
    e.templateSpans.forEach((s) => renderedIdentityRefs(s.expression, out));
    return;
  }
  if (ts.isCallExpression(e)) {
    renderedIdentityRefs(e.expression, out);
    e.arguments.forEach((a) => renderedIdentityRefs(a, out));
    return;
  }
  ts.forEachChild(e, (c) => renderedIdentityRefs(c, out));
}

function insidePii(n: ts.Node): boolean {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) && p.openingElement.tagName.getText() === 'Pii') return true;
  }
  return false;
}

function findViolations(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const report = (n: ts.JsxExpression, where: string) => {
    const refs: string[] = [];
    renderedIdentityRefs(n.expression!, refs);
    if (!refs.length) return;
    const text = n.expression!.getText();
    if (ALLOWED.some((a) => file.endsWith(a.file) && a.text === text)) return;
    const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
    found.push(`${file}:${line + 1}  {${text}} (${refs.join(', ')}) ${where}`);
  };
  const visit = (n: ts.Node) => {
    if (ts.isJsxExpression(n) && n.expression) {
      const parent = n.parent;
      if (ts.isJsxAttribute(parent)) {
        const attr = parent.name.getText();
        if (!FORM_VALUE_ATTRIBUTES.has(attr) && RISKY_ATTRIBUTE.test(attr)) report(n, `in attribute "${attr}", which PostHog click capture records`);
      } else if ((ts.isJsxElement(parent) || ts.isJsxFragment(parent)) && !insidePii(n)) {
        report(n, 'is shown as text outside <Pii>');
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

describe('<Pii>', () => {
  it('adds the ph-mask class PostHog masks by default and keeps the caller classes', () => {
    expect(renderToStaticMarkup(createElement(Pii, { className: 'font-mono' }, 'x'))).toBe('<span class="ph-mask font-mono">x</span>');
    expect(renderToStaticMarkup(createElement(Pii, null, 'x'))).toBe('<span class="ph-mask">x</span>');
  });
});

describe('PII guard: the checker itself', () => {
  const bad = (jsx: string) => findViolations('fixture.tsx', `const A = () => ${jsx};`);
  it('flags identity text outside <Pii>', () => {
    expect(bad('<p>{inq.fullName}</p>')).toHaveLength(1);
    expect(bad('<p>Address: {inq.address}</p>')).toHaveLength(1);
    expect(bad('<p>{`Hi ${inq.fullName}`}</p>')).toHaveLength(1);
    expect(bad('<p>{emailInput}</p>')).toHaveLength(1);
    expect(bad('<p>{authError}</p>')).toHaveLength(1);
    expect(bad('<p>{inq.notes?.length ? 1 : selected.message}</p>')).toHaveLength(1);
  });
  it('flags identity values in attributes that click capture records', () => {
    expect(bad('<div title={inq.address} />')).toHaveLength(1);
    expect(bad('<button aria-label={`Call ${inq.phone}`} />')).toHaveLength(1);
    expect(bad('<div data-name={inq.fullName} />')).toHaveLength(1);
  });
  it('accepts identity text inside <Pii>', () => {
    expect(bad('<p><Pii>{inq.fullName}</Pii></p>')).toHaveLength(0);
    expect(bad('<p>Address: <Pii className="x">{inq.address}</Pii></p>')).toHaveLength(0);
    expect(bad('<p>"<Pii>{selected.message}</Pii>"</p>')).toHaveLength(0);
  });
  it('accepts form values, conditions, and unrelated text', () => {
    expect(bad('<input value={email} onChange={(e) => set(e.target.value)} />')).toHaveLength(0);
    expect(bad('<div>{selected.message && (<p><Pii>{selected.message}</Pii></p>)}</div>')).toHaveLength(0);
    expect(bad('<p>{error.message}</p>')).toHaveLength(0);
    expect(bad('<p>{count} items for {company.name}</p>')).toHaveLength(0);
    expect(bad('<div title="Click to view" />')).toHaveLength(0);
  });
});

describe('PII guard: the app', () => {
  it('renders no customer or contractor identity text outside <Pii>', () => {
    const srcDir = fileURLToPath(new URL('./', import.meta.url));
    const violations = sourceFiles(srcDir).flatMap((f) => findViolations(relative(srcDir, f), readFileSync(f, 'utf8')));
    expect(violations, `Wrap these in <Pii> (src/components/Pii.tsx):\n${violations.join('\n')}`).toEqual([]);
  });
});
