# Equation Rendering Location Guide

This document answers the question: **"Where is equation rendering (OMML, LaTeX, MML, etc.) handled in DocxJS?"**

## Quick Answer

Equation rendering in DocxJS is handled in **three main files**:

1. **`src/document-parser.ts`** - Parses OMML from DOCX files
2. **`src/html-renderer.ts`** - Renders equations as MathML
3. **`src/document/dom.ts`** - Defines equation DOM types

## Detailed Locations

### 1. OMML Parsing (`src/document-parser.ts`)

**Lines 29-55**: `mmlTagMap` - Maps OMML XML tags to internal types
```typescript
const mmlTagMap = {
    "oMath": DomType.MmlMath,
    "oMathPara": DomType.MmlMathParagraph,
    "f": DomType.MmlFraction,
    // ... 22 more equation element types
}
```

**Lines 536-539**: Paragraph parser detects math elements
```typescript
case "oMath":
case "oMathPara":
    result.children.push(this.parseMathElement(el));
    break;
```

**Lines 750-769**: `parseMathElement()` - Main OMML parsing function
**Lines 771-786**: `parseMathProperies()` - Extracts math properties

### 2. MathML Rendering (`src/html-renderer.ts`)

**Lines 797-863**: Main equation rendering switch cases
```typescript
case DomType.MmlMath:
    return this.renderContainerNS(elem, ns.mathML, "math", { xmlns: ns.mathML });
case DomType.MmlFraction:
    return this.renderContainerNS(elem, ns.mathML, "mfrac");
// ... handles all 25+ equation types
```

**Lines 1297-1404**: Specialized rendering methods
- `renderMmlRadical()` - Square roots and nth roots
- `renderMmlDelimiter()` - Parentheses and brackets  
- `renderMmlNary()` - Integrals, sums, products
- `renderMmlPreSubSuper()` - Sub/superscripts
- `renderMmlGroupChar()` - Grouping characters
- `renderMmlBar()` - Over/underlines
- `renderMmlRun()` - Text within equations
- `renderMllList()` - Equation arrays

### 3. DOM Type Definitions (`src/document/dom.ts`)

**Lines 29-54**: Defines all equation-related DOM types
```typescript
export enum DomType {
    MmlMath = "mmlMath",
    MmlMathParagraph = "mmlMathParagraph",
    MmlFraction = "mmlFraction",
    MmlSuperscript = "mmlSuperscript",
    // ... 22 more MML types
}
```

### 4. Namespace Configuration (`src/document/common.ts`)

**Lines 4-10**: Math namespace definitions
```typescript
export const ns = {
    // ...
    math: "http://schemas.openxmlformats.org/officeDocument/2006/math"
}
```

## Equation Flow Summary

1. **Input**: OMML from Word documents (`<m:oMath>` elements in DOCX XML)
2. **Detection**: Paragraph parser identifies math elements (lines 536-539)
3. **Parsing**: `parseMathElement()` recursively processes OMML tree
4. **Internal**: Converts to MML DOM types (25+ different math element types)
5. **Integration**: Math elements become part of document paragraph children
6. **Rendering**: `renderElement()` switch routes to appropriate MathML renderers
7. **Output**: Complete MathML markup (`<math>` elements) in HTML

## Supported Formats

- ✅ **OMML** (Office Math Markup Language) - Input from DOCX
- ✅ **MathML** - Output for web browsers
- ❌ **LaTeX** - Not directly supported
- ❌ **AsciiMath** - Not supported

## Test Location

- **`tests/render-test/equation/`** - Contains test DOCX and expected HTML output

The system successfully converts complex mathematical notation including fractions, radicals, integrals, matrices, and more from Word documents into web-ready MathML.