// Centralized OMML -> HTML renderer entry point.
// This is a placeholder. It will eventually call an external library (e.g., omml2mathml)
// with the original OMML <m:oMath*> Element and return the resulting HTML string.
// For now, it returns an empty string so the caller can safely fall back to existing logic.

import omml2mathml from 'omml2mathml';

export function renderOmmlToHtml(omml: Element | null | undefined): string {
    if (!omml) return '';
    try {
        const node: any = omml2mathml(omml);
        if (!node) return '';
        console.log(node);
        // Prefer outerHTML if node is Element; otherwise if string, return it.
        return typeof node === 'string' ? node : (node.outerHTML ?? '');
    } catch {
        return '';
    }
}
