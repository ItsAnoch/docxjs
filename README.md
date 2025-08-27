[![npm version](https://badge.fury.io/js/docx-preview.svg)](https://www.npmjs.com/package/docx-preview)

# docxjs
Docx rendering library

Demo - https://volodymyrbaydalka.github.io/docxjs/

## Fork and credits

This repository is a fork of the original docxjs project by Volodymyr Baydalka.

- Original repository: https://github.com/VolodymyrBaydalka/docxjs
- All credit for the original design and most of the implementation goes to the upstream author and contributors.

Goal
----
Goal of this project is to render/convert DOCX document into HTML document with keeping HTML semantic as much as possible. 
That means library is limited by HTML capabilities (for example Google Docs renders *.docx document on canvas as an image).

Installation
-----
```
npm install docx-preview
```

Usage
-----
```html
<!--lib uses jszip-->
<script src="https://unpkg.com/jszip/dist/jszip.min.js"></script>
<script src="docx-preview.min.js"></script>
<script>
    var docData = <document Blob>;

    docx.renderAsync(docData, document.getElementById("container"))
        .then(x => console.log("docx: finished"));
</script>
<body>
    ...
    <div id="container"></div>
    ...
</body>
```
API
---
```ts
// renders document into specified element
renderAsync(
    document: Blob | ArrayBuffer | Uint8Array, // could be any type that supported by JSZip.loadAsync
    bodyContainer: HTMLElement, //element to render document content,
    styleContainer: HTMLElement, //element to render document styles, numbeings, fonts. If null, bodyContainer will be used.
    options: {
        className: string = "docx", //class name/prefix for default and document style classes
        inWrapper: boolean = true, //enables rendering of wrapper around document content
        hideWrapperOnPrint: boolean = false, //disable wrapper styles on print
        ignoreWidth: boolean = false, //disables rendering width of page
        ignoreHeight: boolean = false, //disables rendering height of page
        ignoreFonts: boolean = false, //disables fonts rendering
        breakPages: boolean = true, //enables page breaking on page breaks
        ignoreLastRenderedPageBreak: boolean = true, //disables page breaking on lastRenderedPageBreak elements
        experimental: boolean = false, //enables experimental features (tab stops calculation)
        trimXmlDeclaration: boolean = true, //if true, xml declaration will be removed from xml documents before parsing
        useBase64URL: boolean = false, //if true, images, fonts, etc. will be converted to base 64 URL, otherwise URL.createObjectURL is used
        renderChanges: false, //enables experimental rendering of document changes (inserions/deletions)
        renderHeaders: true, //enables headers rendering
        renderFooters: true, //enables footers rendering
        renderFootnotes: true, //enables footnotes rendering
        renderEndnotes: true, //enables endnotes rendering
        renderComments: false, //enables experimental comments rendering
        renderAltChunks: true, //enables altChunks (html parts) rendering
        debug: boolean = false, //enables additional logging
    }): Promise<WordDocument>

/// ==== experimental / internal API ===
// this API could be used to modify document before rendering
// renderAsync = parseAsync + renderDocument

// parse document and return internal document object
parseAsync(
    document: Blob | ArrayBuffer | Uint8Array,
    options: Options
): Promise<WordDocument>

// render internal document object into specified container
renderDocument(
    wordDocument: WordDocument,
    bodyContainer: HTMLElement,
    styleContainer: HTMLElement,
    options: Options
): Promise<void>
```

Thumbnails, TOC and etc.
------
Thumbnails is added only for example and it's not part of library. Library renders DOCX into HTML, so it can't be efficiently used for thumbnails. 

Table of contents is built using the TOC fields and there is no efficient way to get table of contents at this point, since fields is not supported yet (http://officeopenxml.com/WPtableOfContents.php)

Breaks
------
Currently library does break pages:
- if user/manual page break `<w:br w:type="page"/>` is inserted - when user insert page break
- if application page break `<w:lastRenderedPageBreak/>` is inserted - could be inserted by editor application like MS word (`ignoreLastRenderedPageBreak` should be set to false)
- if page settings for paragraph is changed - ex: user change settings from portrait to landscape page

Realtime page breaking is not implemented because it's requires re-calculation of sizes on each insertion and that could affect performance a lot. 

If page breaking is crutual for you, I would recommend:
- try to insert manual break point as much as you could
- try use editors like MS Word, that inserts `<w:lastRenderedPageBreak/>` break points

NOTE: by default `ignoreLastRenderedPageBreak` is set to `true`. You may need to set it to `false`, to make library break by `<w:lastRenderedPageBreak/>` break points

Status and stability
------
So far I can't come up with final approach of parsing documents and final structure of API. Only **renderAsync** function is stable and definition shouldn't be changed in future. Inner implementation of parsing and rendering may be changed at any point of time.

Contributing
------
Please do not include contents of `./dist` folder in your PR's. Otherwise I most likely will reject it due to stability and security concerns.

## Math equations (OMML → MathML) rendering

What was broken
----------------
Modern browsers, especially Chromium-based, implement MathML Core, which removes or ignores a number of legacy/deprecated MathML features. Our previous OMML→Math rendering path could emit deprecated MathML like `<mfenced>` for parentheses/brackets and separators. As a result, equations sometimes rendered without fences/separators or with inconsistent spacing.

What we changed
----------------
- Replaced the entire equation rendering pipeline: we now convert OMML to MathML using `omml2mathml`, and then run a normalization pass in `src/omml-renderer.ts`.
- The normalizer rewrites deprecated `<mfenced>` nodes to standard MathML Core-friendly structure using `<mrow>` with explicit `<mo>` operators for:
    - opening fence (e.g., `(`, `[`, `|`)
    - separators between arguments (e.g., `,`)
    - closing fence (e.g., `)`, `]`, `|`)

Previously, only some equations would render; now they all properly render. This makes generated MathML more robust across engines that don’t support `<mfenced>`.

Known edge cases and limitations
--------------------------------
The normalization focuses on the most common breakage (fences/separators). Some MathML constructs emitted by converters are partially or not supported in MathML Core and may still need special handling:

- mtable/mtr/mtd (matrices, cases)
    - Support varies in Core. Rich alignment/lines can fail. We currently don’t rewrite tables; very complex matrices/cases may render inconsistently.

- mstyle and presentational attributes (mathcolor, mathbackground, mathsize, displaystyle, scriptlevel, etc.)
    - Not part of MathML Core; may be ignored by some engines. Styling could appear lost unless mirrored in CSS. Future work: unwrap `mstyle` and move styling to CSS.

- semantics/annotation-xml
    - `annotation-xml` is not widely supported. If present, it can interfere with rendering. Future work: unwrap to the first renderable child.

- mfrac with bevelled="true"
    - Bevelled fractions are not in Core. Future work: linearize as `mrow <numerator> <mo>/</mo> <denominator>`.

- mathvariant for special alphabets (double‑struck, fraktur, script)
    - Not reliably supported without fonts. Consider using Unicode code points or CSS/webfonts.

- mmultiscripts (general tensor indices)
    - Not in Core and hard to rewrite generically. Future work: map simple cases to `msubsup` where possible.

- Operator attributes (largeop, movablelimits, lspace/rspace, linebreak, form, fence/separator flags)
    - Many are ignored in Core; spacing/limits behavior may differ. Prefer structural elements (`munderover`, `msubsup`) and CSS spacing.

Troubleshooting tips
--------------------
- If equations appear without parentheses/separators, ensure you’re using a build including `src/omml-renderer.ts` normalization (version ≥ the commit that mentions “equation rendering”).
- For matrices/cases that look off, consider rendering to HTML tables or opening an issue with a minimal DOCX.
- If stylistic differences show up (colors/sizes), mirror styles via CSS on the MathML elements.

Notes
-----
- The core fix is safe: converting `<mfenced>` to `<mrow>` with explicit `<mo>` mirrors standard MathML examples and avoids deprecated constructs.
- We’ll iterate on additional normalizations as needed; feel free to file issues with sample documents.
