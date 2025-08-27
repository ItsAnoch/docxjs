// Centralized OMML -> HTML renderer entry point.
// This is a placeholder. It will eventually call an external library (e.g., omml2mathml)
// with the original OMML <m:oMath*> Element and return the resulting HTML string.
// For now, it returns an empty string so the caller can safely fall back to existing logic.

import omml2mathml from 'omml2mathml';

// Transform deprecated MathML constructs to modern equivalents.
// Currently, replaces <mfenced> with <mrow><mo>(</mo> … <mo>)</mo></mrow>
// and inserts <mo> separators between arguments.
function normalizeMathML(input: Element | string): string {
    const MML_NS = 'http://www.w3.org/1998/Math/MathML';

    // Parse into a DOM Element we can mutate
    let rootEl: Element | null = null;
    if (typeof input === 'string') {
        try {
            // Replace HTML named entities that aren't defined in XML (e.g., &nbsp;)
            // Use Unicode characters to keep the content valid for XML parsing.
            const sanitizeToXmlSafe = (s: string) => {
                const map: Record<string, string> = {
                    '&nbsp;': '\u00A0',
                    '&ensp;': '\u2002',
                    '&emsp;': '\u2003',
                    '&thinsp;': '\u2009',
                    '&times;': '\u00D7',
                    '&middot;': '\u00B7',
                    '&minus;': '\u2212'
                };
                return s.replace(/&[a-zA-Z]+;/g, (m) => map[m] ?? m);
            };

            const parser = new DOMParser();
            const safe = sanitizeToXmlSafe(input);
            const doc = parser.parseFromString(safe, 'application/xml');
            // Guard against parsererror documents (DOMParser doesn't throw for XML errors)
            const isParserError = doc.getElementsByTagName('parsererror').length > 0
                || doc.documentElement?.localName?.toLowerCase() === 'parsererror';
            if (isParserError) {
                return input; // fall back to original string without normalization
            }
            rootEl = (doc.documentElement?.nodeType === 1 ? doc.documentElement as Element : null);
        } catch {
            // If parsing fails, just return the original string
            return typeof input === 'string' ? input : (input as any)?.outerHTML ?? '';
        }
    } else {
        rootEl = input;
    }

    if (!rootEl) {
        return '';
    }

    // Utility: create <mo>text</mo>
    const createMo = (text: string) => {
        const mo = rootEl!.ownerDocument!.createElementNS(MML_NS, 'mo');
        // text can be empty (e.g., when open/close="") — in that case, omit caller-side append
        mo.textContent = text;
        return mo;
    };

    // Replace a single <mfenced> element with an <mrow> that uses <mo> for fences and separators
    const transformMfenced = (mfenced: Element) => {
        const doc = mfenced.ownerDocument!;
        const mrow = doc.createElementNS(MML_NS, 'mrow');

        // Carry over generic attributes except mfenced-specific ones
        for (let i = 0; i < mfenced.attributes.length; i++) {
            const attr = mfenced.attributes[i];
            if (attr.name === 'open' || attr.name === 'close' || attr.name === 'separators') continue;
            mrow.setAttribute(attr.name, attr.value);
        }

        const open = mfenced.getAttribute('open');
        const close = mfenced.getAttribute('close');
        const sepsAttr = mfenced.getAttribute('separators');

        // Defaults per legacy mfenced behavior
        const openStr = open !== null ? open : '(';
        const closeStr = close !== null ? close : ')';
        const separatorsStr = sepsAttr !== null ? sepsAttr : ',';

        // Children to fence (elements only, preserving order)
        const children: Element[] = Array.from(mfenced.children) as Element[];

        // Left fence
        if (openStr.length > 0) {
            mrow.appendChild(createMo(openStr));
        }

        // Build separators as a sequence of characters; if fewer than needed, repeat last
        const sepChars = Array.from(separatorsStr);

        children.forEach((child, idx) => {
            mrow.appendChild(child);
            const needSep = idx < children.length - 1;
            if (!needSep) return;
            if (sepChars.length === 0) return; // no separators
            const sep = sepChars[Math.min(idx, sepChars.length - 1)];
            if (sep && sep.length > 0) {
                mrow.appendChild(createMo(sep));
            }
        });

        // Right fence
        if (closeStr.length > 0) {
            mrow.appendChild(createMo(closeStr));
        }

        // Replace in DOM
        mfenced.replaceWith(mrow);
    };

    // Collect mfenced nodes first (avoid live traversal issues while replacing)
    const toTransform: Element[] = [];
    // include descendants
    toTransform.push(...Array.from(rootEl.getElementsByTagName('mfenced')));
    // include root if it is <mfenced>
    if (rootEl.localName && rootEl.localName.toLowerCase() === 'mfenced') {
        toTransform.push(rootEl);
    }

    // Apply transformations from deepest to shallowest to keep indices stable
    for (let i = toTransform.length - 1; i >= 0; i--) {
        transformMfenced(toTransform[i]);
    }

    // Serialize back to string
    const serialized = (rootEl as any).outerHTML ?? new XMLSerializer().serializeToString(rootEl);
    return serialized;
}

export function renderOmmlToHtml(omml: Element | null | undefined): string {
    if (!omml) return '';
    try {
    const node: any = omml2mathml(omml);
    if (!node) return '';
    console.log(node);
    // Normalize deprecated MathML to modern constructs (e.g., replace <mfenced>)
    const mathml = typeof node === 'string' ? node : (node.outerHTML ?? '');
    return normalizeMathML(mathml);
    } catch (e) {
        console.log(e);
        return '';
    }
}
