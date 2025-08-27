(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('jszip')) :
    typeof define === 'function' && define.amd ? define(['exports', 'jszip'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.docx = {}, global.JSZip));
})(this, (function (exports, JSZip) { 'use strict';

    var RelationshipTypes;
    (function (RelationshipTypes) {
        RelationshipTypes["OfficeDocument"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
        RelationshipTypes["FontTable"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable";
        RelationshipTypes["Image"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
        RelationshipTypes["Numbering"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering";
        RelationshipTypes["Styles"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
        RelationshipTypes["StylesWithEffects"] = "http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects";
        RelationshipTypes["Theme"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme";
        RelationshipTypes["Settings"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings";
        RelationshipTypes["WebSettings"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings";
        RelationshipTypes["Hyperlink"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
        RelationshipTypes["Footnotes"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes";
        RelationshipTypes["Endnotes"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes";
        RelationshipTypes["Footer"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer";
        RelationshipTypes["Header"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header";
        RelationshipTypes["ExtendedProperties"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties";
        RelationshipTypes["CoreProperties"] = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
        RelationshipTypes["CustomProperties"] = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/custom-properties";
        RelationshipTypes["Comments"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
        RelationshipTypes["CommentsExtended"] = "http://schemas.microsoft.com/office/2011/relationships/commentsExtended";
        RelationshipTypes["AltChunk"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk";
    })(RelationshipTypes || (RelationshipTypes = {}));
    function parseRelationships(root, xml) {
        return xml.elements(root).map(e => ({
            id: xml.attr(e, "Id"),
            type: xml.attr(e, "Type"),
            target: xml.attr(e, "Target"),
            targetMode: xml.attr(e, "TargetMode")
        }));
    }

    function escapeClassName(className) {
        return className?.replace(/[ .]+/g, '-').replace(/[&]+/g, 'and').toLowerCase();
    }
    function encloseFontFamily(fontFamily) {
        return /^[^"'].*\s.*[^"']$/.test(fontFamily) ? `'${fontFamily}'` : fontFamily;
    }
    function splitPath(path) {
        let si = path.lastIndexOf('/') + 1;
        let folder = si == 0 ? "" : path.substring(0, si);
        let fileName = si == 0 ? path : path.substring(si);
        return [folder, fileName];
    }
    function resolvePath(path, base) {
        try {
            const prefix = "http://docx/";
            const url = new URL(path, prefix + base).toString();
            return url.substring(prefix.length);
        }
        catch {
            return `${base}${path}`;
        }
    }
    function keyBy(array, by) {
        return array.reduce((a, x) => {
            a[by(x)] = x;
            return a;
        }, {});
    }
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => reject();
            reader.readAsDataURL(blob);
        });
    }
    function isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }
    function isString(item) {
        return typeof item === 'string' || item instanceof String;
    }
    function mergeDeep(target, ...sources) {
        if (!sources.length)
            return target;
        const source = sources.shift();
        if (isObject(target) && isObject(source)) {
            for (const key in source) {
                if (isObject(source[key])) {
                    const val = target[key] ?? (target[key] = {});
                    mergeDeep(val, source[key]);
                }
                else {
                    target[key] = source[key];
                }
            }
        }
        return mergeDeep(target, ...sources);
    }
    function asArray(val) {
        return Array.isArray(val) ? val : [val];
    }
    function clamp(val, min, max) {
        return min > val ? min : (max < val ? max : val);
    }

    const ns$1 = {
        wordml: "http://schemas.openxmlformats.org/wordprocessingml/2006/main"};
    const LengthUsage = {
        Dxa: { mul: 0.05, unit: "pt" },
        Emu: { mul: 1 / 12700, unit: "pt" },
        FontSize: { mul: 0.5, unit: "pt" },
        Border: { mul: 0.125, unit: "pt", min: 0.25, max: 12 },
        Point: { mul: 1, unit: "pt" },
        Percent: { mul: 0.02, unit: "%" }};
    function convertLength(val, usage = LengthUsage.Dxa) {
        if (val == null || /.+(p[xt]|[%])$/.test(val)) {
            return val;
        }
        var num = parseInt(val) * usage.mul;
        if (usage.min && usage.max)
            num = clamp(num, usage.min, usage.max);
        return `${num.toFixed(2)}${usage.unit}`;
    }
    function convertBoolean(v, defaultValue = false) {
        switch (v) {
            case "1": return true;
            case "0": return false;
            case "on": return true;
            case "off": return false;
            case "true": return true;
            case "false": return false;
            default: return defaultValue;
        }
    }
    function parseCommonProperty(elem, props, xml) {
        if (elem.namespaceURI != ns$1.wordml)
            return false;
        switch (elem.localName) {
            case "color":
                props.color = xml.attr(elem, "val");
                break;
            case "sz":
                props.fontSize = xml.lengthAttr(elem, "val", LengthUsage.FontSize);
                break;
            default:
                return false;
        }
        return true;
    }

    function parseXmlString(xmlString, trimXmlDeclaration = false) {
        if (trimXmlDeclaration)
            xmlString = xmlString.replace(/<[?].*[?]>/, "");
        xmlString = removeUTF8BOM(xmlString);
        const result = new DOMParser().parseFromString(xmlString, "application/xml");
        const errorText = hasXmlParserError(result);
        if (errorText)
            throw new Error(errorText);
        return result;
    }
    function hasXmlParserError(doc) {
        return doc.getElementsByTagName("parsererror")[0]?.textContent;
    }
    function removeUTF8BOM(data) {
        return data.charCodeAt(0) === 0xFEFF ? data.substring(1) : data;
    }
    function serializeXmlString(elem) {
        return new XMLSerializer().serializeToString(elem);
    }
    class XmlParser {
        elements(elem, localName = null) {
            const result = [];
            for (let i = 0, l = elem.childNodes.length; i < l; i++) {
                let c = elem.childNodes.item(i);
                if (c.nodeType == 1 && (localName == null || c.localName == localName))
                    result.push(c);
            }
            return result;
        }
        element(elem, localName) {
            for (let i = 0, l = elem.childNodes.length; i < l; i++) {
                let c = elem.childNodes.item(i);
                if (c.nodeType == 1 && c.localName == localName)
                    return c;
            }
            return null;
        }
        elementAttr(elem, localName, attrLocalName) {
            var el = this.element(elem, localName);
            return el ? this.attr(el, attrLocalName) : undefined;
        }
        attrs(elem) {
            return Array.from(elem.attributes);
        }
        attr(elem, localName) {
            for (let i = 0, l = elem.attributes.length; i < l; i++) {
                let a = elem.attributes.item(i);
                if (a.localName == localName)
                    return a.value;
            }
            return null;
        }
        intAttr(node, attrName, defaultValue = null) {
            var val = this.attr(node, attrName);
            return val ? parseInt(val) : defaultValue;
        }
        hexAttr(node, attrName, defaultValue = null) {
            var val = this.attr(node, attrName);
            return val ? parseInt(val, 16) : defaultValue;
        }
        floatAttr(node, attrName, defaultValue = null) {
            var val = this.attr(node, attrName);
            return val ? parseFloat(val) : defaultValue;
        }
        boolAttr(node, attrName, defaultValue = null) {
            return convertBoolean(this.attr(node, attrName), defaultValue);
        }
        lengthAttr(node, attrName, usage = LengthUsage.Dxa) {
            return convertLength(this.attr(node, attrName), usage);
        }
    }
    const globalXmlParser = new XmlParser();

    class Part {
        constructor(_package, path) {
            this._package = _package;
            this.path = path;
        }
        async load() {
            this.rels = await this._package.loadRelationships(this.path);
            const xmlText = await this._package.load(this.path);
            const xmlDoc = this._package.parseXmlDocument(xmlText);
            if (this._package.options.keepOrigin) {
                this._xmlDocument = xmlDoc;
            }
            this.parseXml(xmlDoc.firstElementChild);
        }
        save() {
            this._package.update(this.path, serializeXmlString(this._xmlDocument));
        }
        parseXml(root) {
        }
    }

    const embedFontTypeMap = {
        embedRegular: 'regular',
        embedBold: 'bold',
        embedItalic: 'italic',
        embedBoldItalic: 'boldItalic',
    };
    function parseFonts(root, xml) {
        return xml.elements(root).map(el => parseFont(el, xml));
    }
    function parseFont(elem, xml) {
        let result = {
            name: xml.attr(elem, "name"),
            embedFontRefs: []
        };
        for (let el of xml.elements(elem)) {
            switch (el.localName) {
                case "family":
                    result.family = xml.attr(el, "val");
                    break;
                case "altName":
                    result.altName = xml.attr(el, "val");
                    break;
                case "embedRegular":
                case "embedBold":
                case "embedItalic":
                case "embedBoldItalic":
                    result.embedFontRefs.push(parseEmbedFontRef(el, xml));
                    break;
            }
        }
        return result;
    }
    function parseEmbedFontRef(elem, xml) {
        return {
            id: xml.attr(elem, "id"),
            key: xml.attr(elem, "fontKey"),
            type: embedFontTypeMap[elem.localName]
        };
    }

    class FontTablePart extends Part {
        parseXml(root) {
            this.fonts = parseFonts(root, this._package.xmlParser);
        }
    }

    class OpenXmlPackage {
        constructor(_zip, options) {
            this._zip = _zip;
            this.options = options;
            this.xmlParser = new XmlParser();
        }
        get(path) {
            const p = normalizePath(path);
            return this._zip.files[p] ?? this._zip.files[p.replace(/\//g, '\\')];
        }
        update(path, content) {
            this._zip.file(path, content);
        }
        static async load(input, options) {
            const zip = await JSZip.loadAsync(input);
            return new OpenXmlPackage(zip, options);
        }
        save(type = "blob") {
            return this._zip.generateAsync({ type });
        }
        load(path, type = "string") {
            return this.get(path)?.async(type) ?? Promise.resolve(null);
        }
        async loadRelationships(path = null) {
            let relsPath = `_rels/.rels`;
            if (path != null) {
                const [f, fn] = splitPath(path);
                relsPath = `${f}_rels/${fn}.rels`;
            }
            const txt = await this.load(relsPath);
            return txt ? parseRelationships(this.parseXmlDocument(txt).firstElementChild, this.xmlParser) : null;
        }
        parseXmlDocument(txt) {
            return parseXmlString(txt, this.options.trimXmlDeclaration);
        }
    }
    function normalizePath(path) {
        return path.startsWith('/') ? path.substr(1) : path;
    }

    class DocumentPart extends Part {
        constructor(pkg, path, parser) {
            super(pkg, path);
            this._documentParser = parser;
        }
        parseXml(root) {
            this.body = this._documentParser.parseDocumentFile(root);
        }
    }

    function parseBorder(elem, xml) {
        return {
            type: xml.attr(elem, "val"),
            color: xml.attr(elem, "color"),
            size: xml.lengthAttr(elem, "sz", LengthUsage.Border),
            offset: xml.lengthAttr(elem, "space", LengthUsage.Point),
            frame: xml.boolAttr(elem, 'frame'),
            shadow: xml.boolAttr(elem, 'shadow')
        };
    }
    function parseBorders(elem, xml) {
        var result = {};
        for (let e of xml.elements(elem)) {
            switch (e.localName) {
                case "left":
                    result.left = parseBorder(e, xml);
                    break;
                case "top":
                    result.top = parseBorder(e, xml);
                    break;
                case "right":
                    result.right = parseBorder(e, xml);
                    break;
                case "bottom":
                    result.bottom = parseBorder(e, xml);
                    break;
            }
        }
        return result;
    }

    var SectionType;
    (function (SectionType) {
        SectionType["Continuous"] = "continuous";
        SectionType["NextPage"] = "nextPage";
        SectionType["NextColumn"] = "nextColumn";
        SectionType["EvenPage"] = "evenPage";
        SectionType["OddPage"] = "oddPage";
    })(SectionType || (SectionType = {}));
    function parseSectionProperties(elem, xml = globalXmlParser) {
        var section = {};
        for (let e of xml.elements(elem)) {
            switch (e.localName) {
                case "pgSz":
                    section.pageSize = {
                        width: xml.lengthAttr(e, "w"),
                        height: xml.lengthAttr(e, "h"),
                        orientation: xml.attr(e, "orient")
                    };
                    break;
                case "type":
                    section.type = xml.attr(e, "val");
                    break;
                case "pgMar":
                    section.pageMargins = {
                        left: xml.lengthAttr(e, "left"),
                        right: xml.lengthAttr(e, "right"),
                        top: xml.lengthAttr(e, "top"),
                        bottom: xml.lengthAttr(e, "bottom"),
                        header: xml.lengthAttr(e, "header"),
                        footer: xml.lengthAttr(e, "footer"),
                        gutter: xml.lengthAttr(e, "gutter"),
                    };
                    break;
                case "cols":
                    section.columns = parseColumns(e, xml);
                    break;
                case "headerReference":
                    (section.headerRefs ?? (section.headerRefs = [])).push(parseFooterHeaderReference(e, xml));
                    break;
                case "footerReference":
                    (section.footerRefs ?? (section.footerRefs = [])).push(parseFooterHeaderReference(e, xml));
                    break;
                case "titlePg":
                    section.titlePage = xml.boolAttr(e, "val", true);
                    break;
                case "pgBorders":
                    section.pageBorders = parseBorders(e, xml);
                    break;
                case "pgNumType":
                    section.pageNumber = parsePageNumber(e, xml);
                    break;
            }
        }
        return section;
    }
    function parseColumns(elem, xml) {
        return {
            numberOfColumns: xml.intAttr(elem, "num"),
            space: xml.lengthAttr(elem, "space"),
            separator: xml.boolAttr(elem, "sep"),
            equalWidth: xml.boolAttr(elem, "equalWidth", true),
            columns: xml.elements(elem, "col")
                .map(e => ({
                width: xml.lengthAttr(e, "w"),
                space: xml.lengthAttr(e, "space")
            }))
        };
    }
    function parsePageNumber(elem, xml) {
        return {
            chapSep: xml.attr(elem, "chapSep"),
            chapStyle: xml.attr(elem, "chapStyle"),
            format: xml.attr(elem, "fmt"),
            start: xml.intAttr(elem, "start")
        };
    }
    function parseFooterHeaderReference(elem, xml) {
        return {
            id: xml.attr(elem, "id"),
            type: xml.attr(elem, "type"),
        };
    }

    function parseLineSpacing(elem, xml) {
        return {
            before: xml.lengthAttr(elem, "before"),
            after: xml.lengthAttr(elem, "after"),
            line: xml.intAttr(elem, "line"),
            lineRule: xml.attr(elem, "lineRule")
        };
    }

    function parseRunProperties(elem, xml) {
        let result = {};
        for (let el of xml.elements(elem)) {
            parseRunProperty(el, result, xml);
        }
        return result;
    }
    function parseRunProperty(elem, props, xml) {
        if (parseCommonProperty(elem, props, xml))
            return true;
        return false;
    }

    function parseParagraphProperties(elem, xml) {
        let result = {};
        for (let el of xml.elements(elem)) {
            parseParagraphProperty(el, result, xml);
        }
        return result;
    }
    function parseParagraphProperty(elem, props, xml) {
        if (elem.namespaceURI != ns$1.wordml)
            return false;
        if (parseCommonProperty(elem, props, xml))
            return true;
        switch (elem.localName) {
            case "tabs":
                props.tabs = parseTabs(elem, xml);
                break;
            case "sectPr":
                props.sectionProps = parseSectionProperties(elem, xml);
                break;
            case "numPr":
                props.numbering = parseNumbering$1(elem, xml);
                break;
            case "spacing":
                props.lineSpacing = parseLineSpacing(elem, xml);
                return false;
            case "textAlignment":
                props.textAlignment = xml.attr(elem, "val");
                return false;
            case "keepLines":
                props.keepLines = xml.boolAttr(elem, "val", true);
                break;
            case "keepNext":
                props.keepNext = xml.boolAttr(elem, "val", true);
                break;
            case "pageBreakBefore":
                props.pageBreakBefore = xml.boolAttr(elem, "val", true);
                break;
            case "outlineLvl":
                props.outlineLevel = xml.intAttr(elem, "val");
                break;
            case "pStyle":
                props.styleName = xml.attr(elem, "val");
                break;
            case "rPr":
                props.runProps = parseRunProperties(elem, xml);
                break;
            default:
                return false;
        }
        return true;
    }
    function parseTabs(elem, xml) {
        return xml.elements(elem, "tab")
            .map(e => ({
            position: xml.lengthAttr(e, "pos"),
            leader: xml.attr(e, "leader"),
            style: xml.attr(e, "val")
        }));
    }
    function parseNumbering$1(elem, xml) {
        var result = {};
        for (let e of xml.elements(elem)) {
            switch (e.localName) {
                case "numId":
                    result.id = xml.attr(e, "val");
                    break;
                case "ilvl":
                    result.level = xml.intAttr(e, "val");
                    break;
            }
        }
        return result;
    }

    function parseNumberingPart(elem, xml) {
        let result = {
            numberings: [],
            abstractNumberings: [],
            bulletPictures: []
        };
        for (let e of xml.elements(elem)) {
            switch (e.localName) {
                case "num":
                    result.numberings.push(parseNumbering(e, xml));
                    break;
                case "abstractNum":
                    result.abstractNumberings.push(parseAbstractNumbering(e, xml));
                    break;
                case "numPicBullet":
                    result.bulletPictures.push(parseNumberingBulletPicture(e, xml));
                    break;
            }
        }
        return result;
    }
    function parseNumbering(elem, xml) {
        let result = {
            id: xml.attr(elem, 'numId'),
            overrides: []
        };
        for (let e of xml.elements(elem)) {
            switch (e.localName) {
                case "abstractNumId":
                    result.abstractId = xml.attr(e, "val");
                    break;
                case "lvlOverride":
                    result.overrides.push(parseNumberingLevelOverrride(e, xml));
                    break;
            }
        }
        return result;
    }
    function parseAbstractNumbering(elem, xml) {
        let result = {
            id: xml.attr(elem, 'abstractNumId'),
            levels: []
        };
        for (let e of xml.elements(elem)) {
            switch (e.localName) {
                case "name":
                    result.name = xml.attr(e, "val");
                    break;
                case "multiLevelType":
                    result.multiLevelType = xml.attr(e, "val");
                    break;
                case "numStyleLink":
                    result.numberingStyleLink = xml.attr(e, "val");
                    break;
                case "styleLink":
                    result.styleLink = xml.attr(e, "val");
                    break;
                case "lvl":
                    result.levels.push(parseNumberingLevel(e, xml));
                    break;
            }
        }
        return result;
    }
    function parseNumberingLevel(elem, xml) {
        let result = {
            level: xml.intAttr(elem, 'ilvl')
        };
        for (let e of xml.elements(elem)) {
            switch (e.localName) {
                case "start":
                    result.start = xml.attr(e, "val");
                    break;
                case "lvlRestart":
                    result.restart = xml.intAttr(e, "val");
                    break;
                case "numFmt":
                    result.format = xml.attr(e, "val");
                    break;
                case "lvlText":
                    result.text = xml.attr(e, "val");
                    break;
                case "lvlJc":
                    result.justification = xml.attr(e, "val");
                    break;
                case "lvlPicBulletId":
                    result.bulletPictureId = xml.attr(e, "val");
                    break;
                case "pStyle":
                    result.paragraphStyle = xml.attr(e, "val");
                    break;
                case "pPr":
                    result.paragraphProps = parseParagraphProperties(e, xml);
                    break;
                case "rPr":
                    result.runProps = parseRunProperties(e, xml);
                    break;
            }
        }
        return result;
    }
    function parseNumberingLevelOverrride(elem, xml) {
        let result = {
            level: xml.intAttr(elem, 'ilvl')
        };
        for (let e of xml.elements(elem)) {
            switch (e.localName) {
                case "startOverride":
                    result.start = xml.intAttr(e, "val");
                    break;
                case "lvl":
                    result.numberingLevel = parseNumberingLevel(e, xml);
                    break;
            }
        }
        return result;
    }
    function parseNumberingBulletPicture(elem, xml) {
        var pict = xml.element(elem, "pict");
        var shape = pict && xml.element(pict, "shape");
        var imagedata = shape && xml.element(shape, "imagedata");
        return imagedata ? {
            id: xml.attr(elem, "numPicBulletId"),
            referenceId: xml.attr(imagedata, "id"),
            style: xml.attr(shape, "style")
        } : null;
    }

    class NumberingPart extends Part {
        constructor(pkg, path, parser) {
            super(pkg, path);
            this._documentParser = parser;
        }
        parseXml(root) {
            Object.assign(this, parseNumberingPart(root, this._package.xmlParser));
            this.domNumberings = this._documentParser.parseNumberingFile(root);
        }
    }

    class StylesPart extends Part {
        constructor(pkg, path, parser) {
            super(pkg, path);
            this._documentParser = parser;
        }
        parseXml(root) {
            this.styles = this._documentParser.parseStylesFile(root);
        }
    }

    var DomType;
    (function (DomType) {
        DomType["Document"] = "document";
        DomType["Paragraph"] = "paragraph";
        DomType["Run"] = "run";
        DomType["Break"] = "break";
        DomType["NoBreakHyphen"] = "noBreakHyphen";
        DomType["Table"] = "table";
        DomType["Row"] = "row";
        DomType["Cell"] = "cell";
        DomType["Hyperlink"] = "hyperlink";
        DomType["SmartTag"] = "smartTag";
        DomType["Drawing"] = "drawing";
        DomType["Image"] = "image";
        DomType["Text"] = "text";
        DomType["Tab"] = "tab";
        DomType["Symbol"] = "symbol";
        DomType["BookmarkStart"] = "bookmarkStart";
        DomType["BookmarkEnd"] = "bookmarkEnd";
        DomType["Footer"] = "footer";
        DomType["Header"] = "header";
        DomType["FootnoteReference"] = "footnoteReference";
        DomType["EndnoteReference"] = "endnoteReference";
        DomType["Footnote"] = "footnote";
        DomType["Endnote"] = "endnote";
        DomType["SimpleField"] = "simpleField";
        DomType["ComplexField"] = "complexField";
        DomType["Instruction"] = "instruction";
        DomType["VmlPicture"] = "vmlPicture";
        DomType["MmlMath"] = "mmlMath";
        DomType["MmlMathParagraph"] = "mmlMathParagraph";
        DomType["MmlFraction"] = "mmlFraction";
        DomType["MmlFunction"] = "mmlFunction";
        DomType["MmlFunctionName"] = "mmlFunctionName";
        DomType["MmlNumerator"] = "mmlNumerator";
        DomType["MmlDenominator"] = "mmlDenominator";
        DomType["MmlRadical"] = "mmlRadical";
        DomType["MmlBase"] = "mmlBase";
        DomType["MmlDegree"] = "mmlDegree";
        DomType["MmlSuperscript"] = "mmlSuperscript";
        DomType["MmlSubscript"] = "mmlSubscript";
        DomType["MmlPreSubSuper"] = "mmlPreSubSuper";
        DomType["MmlSubArgument"] = "mmlSubArgument";
        DomType["MmlSuperArgument"] = "mmlSuperArgument";
        DomType["MmlNary"] = "mmlNary";
        DomType["MmlDelimiter"] = "mmlDelimiter";
        DomType["MmlRun"] = "mmlRun";
        DomType["MmlEquationArray"] = "mmlEquationArray";
        DomType["MmlLimit"] = "mmlLimit";
        DomType["MmlLimitLower"] = "mmlLimitLower";
        DomType["MmlMatrix"] = "mmlMatrix";
        DomType["MmlMatrixRow"] = "mmlMatrixRow";
        DomType["MmlBox"] = "mmlBox";
        DomType["MmlBar"] = "mmlBar";
        DomType["MmlGroupChar"] = "mmlGroupChar";
        DomType["VmlElement"] = "vmlElement";
        DomType["Inserted"] = "inserted";
        DomType["Deleted"] = "deleted";
        DomType["DeletedText"] = "deletedText";
        DomType["Comment"] = "comment";
        DomType["CommentReference"] = "commentReference";
        DomType["CommentRangeStart"] = "commentRangeStart";
        DomType["CommentRangeEnd"] = "commentRangeEnd";
        DomType["AltChunk"] = "altChunk";
    })(DomType || (DomType = {}));
    class OpenXmlElementBase {
        constructor() {
            this.children = [];
            this.cssStyle = {};
        }
    }

    class WmlHeader extends OpenXmlElementBase {
        constructor() {
            super(...arguments);
            this.type = DomType.Header;
        }
    }
    class WmlFooter extends OpenXmlElementBase {
        constructor() {
            super(...arguments);
            this.type = DomType.Footer;
        }
    }

    class BaseHeaderFooterPart extends Part {
        constructor(pkg, path, parser) {
            super(pkg, path);
            this._documentParser = parser;
        }
        parseXml(root) {
            this.rootElement = this.createRootElement();
            this.rootElement.children = this._documentParser.parseBodyElements(root);
        }
    }
    class HeaderPart extends BaseHeaderFooterPart {
        createRootElement() {
            return new WmlHeader();
        }
    }
    class FooterPart extends BaseHeaderFooterPart {
        createRootElement() {
            return new WmlFooter();
        }
    }

    function parseExtendedProps(root, xmlParser) {
        const result = {};
        for (let el of xmlParser.elements(root)) {
            switch (el.localName) {
                case "Template":
                    result.template = el.textContent;
                    break;
                case "Pages":
                    result.pages = safeParseToInt(el.textContent);
                    break;
                case "Words":
                    result.words = safeParseToInt(el.textContent);
                    break;
                case "Characters":
                    result.characters = safeParseToInt(el.textContent);
                    break;
                case "Application":
                    result.application = el.textContent;
                    break;
                case "Lines":
                    result.lines = safeParseToInt(el.textContent);
                    break;
                case "Paragraphs":
                    result.paragraphs = safeParseToInt(el.textContent);
                    break;
                case "Company":
                    result.company = el.textContent;
                    break;
                case "AppVersion":
                    result.appVersion = el.textContent;
                    break;
            }
        }
        return result;
    }
    function safeParseToInt(value) {
        if (typeof value === 'undefined')
            return;
        return parseInt(value);
    }

    class ExtendedPropsPart extends Part {
        parseXml(root) {
            this.props = parseExtendedProps(root, this._package.xmlParser);
        }
    }

    function parseCoreProps(root, xmlParser) {
        const result = {};
        for (let el of xmlParser.elements(root)) {
            switch (el.localName) {
                case "title":
                    result.title = el.textContent;
                    break;
                case "description":
                    result.description = el.textContent;
                    break;
                case "subject":
                    result.subject = el.textContent;
                    break;
                case "creator":
                    result.creator = el.textContent;
                    break;
                case "keywords":
                    result.keywords = el.textContent;
                    break;
                case "language":
                    result.language = el.textContent;
                    break;
                case "lastModifiedBy":
                    result.lastModifiedBy = el.textContent;
                    break;
                case "revision":
                    el.textContent && (result.revision = parseInt(el.textContent));
                    break;
            }
        }
        return result;
    }

    class CorePropsPart extends Part {
        parseXml(root) {
            this.props = parseCoreProps(root, this._package.xmlParser);
        }
    }

    class DmlTheme {
    }
    function parseTheme(elem, xml) {
        var result = new DmlTheme();
        var themeElements = xml.element(elem, "themeElements");
        for (let el of xml.elements(themeElements)) {
            switch (el.localName) {
                case "clrScheme":
                    result.colorScheme = parseColorScheme(el, xml);
                    break;
                case "fontScheme":
                    result.fontScheme = parseFontScheme(el, xml);
                    break;
            }
        }
        return result;
    }
    function parseColorScheme(elem, xml) {
        var result = {
            name: xml.attr(elem, "name"),
            colors: {}
        };
        for (let el of xml.elements(elem)) {
            var srgbClr = xml.element(el, "srgbClr");
            var sysClr = xml.element(el, "sysClr");
            if (srgbClr) {
                result.colors[el.localName] = xml.attr(srgbClr, "val");
            }
            else if (sysClr) {
                result.colors[el.localName] = xml.attr(sysClr, "lastClr");
            }
        }
        return result;
    }
    function parseFontScheme(elem, xml) {
        var result = {
            name: xml.attr(elem, "name"),
        };
        for (let el of xml.elements(elem)) {
            switch (el.localName) {
                case "majorFont":
                    result.majorFont = parseFontInfo(el, xml);
                    break;
                case "minorFont":
                    result.minorFont = parseFontInfo(el, xml);
                    break;
            }
        }
        return result;
    }
    function parseFontInfo(elem, xml) {
        return {
            latinTypeface: xml.elementAttr(elem, "latin", "typeface"),
            eaTypeface: xml.elementAttr(elem, "ea", "typeface"),
            csTypeface: xml.elementAttr(elem, "cs", "typeface"),
        };
    }

    class ThemePart extends Part {
        constructor(pkg, path) {
            super(pkg, path);
        }
        parseXml(root) {
            this.theme = parseTheme(root, this._package.xmlParser);
        }
    }

    class WmlBaseNote {
    }
    class WmlFootnote extends WmlBaseNote {
        constructor() {
            super(...arguments);
            this.type = DomType.Footnote;
        }
    }
    class WmlEndnote extends WmlBaseNote {
        constructor() {
            super(...arguments);
            this.type = DomType.Endnote;
        }
    }

    class BaseNotePart extends Part {
        constructor(pkg, path, parser) {
            super(pkg, path);
            this._documentParser = parser;
        }
    }
    class FootnotesPart extends BaseNotePart {
        constructor(pkg, path, parser) {
            super(pkg, path, parser);
        }
        parseXml(root) {
            this.notes = this._documentParser.parseNotes(root, "footnote", WmlFootnote);
        }
    }
    class EndnotesPart extends BaseNotePart {
        constructor(pkg, path, parser) {
            super(pkg, path, parser);
        }
        parseXml(root) {
            this.notes = this._documentParser.parseNotes(root, "endnote", WmlEndnote);
        }
    }

    function parseSettings(elem, xml) {
        var result = {};
        for (let el of xml.elements(elem)) {
            switch (el.localName) {
                case "defaultTabStop":
                    result.defaultTabStop = xml.lengthAttr(el, "val");
                    break;
                case "footnotePr":
                    result.footnoteProps = parseNoteProperties(el, xml);
                    break;
                case "endnotePr":
                    result.endnoteProps = parseNoteProperties(el, xml);
                    break;
                case "autoHyphenation":
                    result.autoHyphenation = xml.boolAttr(el, "val");
                    break;
            }
        }
        return result;
    }
    function parseNoteProperties(elem, xml) {
        var result = {
            defaultNoteIds: []
        };
        for (let el of xml.elements(elem)) {
            switch (el.localName) {
                case "numFmt":
                    result.nummeringFormat = xml.attr(el, "val");
                    break;
                case "footnote":
                case "endnote":
                    result.defaultNoteIds.push(xml.attr(el, "id"));
                    break;
            }
        }
        return result;
    }

    class SettingsPart extends Part {
        constructor(pkg, path) {
            super(pkg, path);
        }
        parseXml(root) {
            this.settings = parseSettings(root, this._package.xmlParser);
        }
    }

    function parseCustomProps(root, xml) {
        return xml.elements(root, "property").map(e => {
            const firstChild = e.firstChild;
            return {
                formatId: xml.attr(e, "fmtid"),
                name: xml.attr(e, "name"),
                type: firstChild.nodeName,
                value: firstChild.textContent
            };
        });
    }

    class CustomPropsPart extends Part {
        parseXml(root) {
            this.props = parseCustomProps(root, this._package.xmlParser);
        }
    }

    class CommentsPart extends Part {
        constructor(pkg, path, parser) {
            super(pkg, path);
            this._documentParser = parser;
        }
        parseXml(root) {
            this.comments = this._documentParser.parseComments(root);
            this.commentMap = keyBy(this.comments, x => x.id);
        }
    }

    class CommentsExtendedPart extends Part {
        constructor(pkg, path) {
            super(pkg, path);
            this.comments = [];
        }
        parseXml(root) {
            const xml = this._package.xmlParser;
            for (let el of xml.elements(root, "commentEx")) {
                this.comments.push({
                    paraId: xml.attr(el, 'paraId'),
                    paraIdParent: xml.attr(el, 'paraIdParent'),
                    done: xml.boolAttr(el, 'done')
                });
            }
            this.commentMap = keyBy(this.comments, x => x.paraId);
        }
    }

    const topLevelRels = [
        { type: RelationshipTypes.OfficeDocument, target: "word/document.xml" },
        { type: RelationshipTypes.ExtendedProperties, target: "docProps/app.xml" },
        { type: RelationshipTypes.CoreProperties, target: "docProps/core.xml" },
        { type: RelationshipTypes.CustomProperties, target: "docProps/custom.xml" },
    ];
    class WordDocument {
        constructor() {
            this.parts = [];
            this.partsMap = {};
        }
        static async load(blob, parser, options) {
            var d = new WordDocument();
            d._options = options;
            d._parser = parser;
            d._package = await OpenXmlPackage.load(blob, options);
            d.rels = await d._package.loadRelationships();
            await Promise.all(topLevelRels.map(rel => {
                const r = d.rels.find(x => x.type === rel.type) ?? rel;
                return d.loadRelationshipPart(r.target, r.type);
            }));
            return d;
        }
        save(type = "blob") {
            return this._package.save(type);
        }
        async loadRelationshipPart(path, type) {
            if (this.partsMap[path])
                return this.partsMap[path];
            if (!this._package.get(path))
                return null;
            let part = null;
            switch (type) {
                case RelationshipTypes.OfficeDocument:
                    this.documentPart = part = new DocumentPart(this._package, path, this._parser);
                    break;
                case RelationshipTypes.FontTable:
                    this.fontTablePart = part = new FontTablePart(this._package, path);
                    break;
                case RelationshipTypes.Numbering:
                    this.numberingPart = part = new NumberingPart(this._package, path, this._parser);
                    break;
                case RelationshipTypes.Styles:
                    this.stylesPart = part = new StylesPart(this._package, path, this._parser);
                    break;
                case RelationshipTypes.Theme:
                    this.themePart = part = new ThemePart(this._package, path);
                    break;
                case RelationshipTypes.Footnotes:
                    this.footnotesPart = part = new FootnotesPart(this._package, path, this._parser);
                    break;
                case RelationshipTypes.Endnotes:
                    this.endnotesPart = part = new EndnotesPart(this._package, path, this._parser);
                    break;
                case RelationshipTypes.Footer:
                    part = new FooterPart(this._package, path, this._parser);
                    break;
                case RelationshipTypes.Header:
                    part = new HeaderPart(this._package, path, this._parser);
                    break;
                case RelationshipTypes.CoreProperties:
                    this.corePropsPart = part = new CorePropsPart(this._package, path);
                    break;
                case RelationshipTypes.ExtendedProperties:
                    this.extendedPropsPart = part = new ExtendedPropsPart(this._package, path);
                    break;
                case RelationshipTypes.CustomProperties:
                    part = new CustomPropsPart(this._package, path);
                    break;
                case RelationshipTypes.Settings:
                    this.settingsPart = part = new SettingsPart(this._package, path);
                    break;
                case RelationshipTypes.Comments:
                    this.commentsPart = part = new CommentsPart(this._package, path, this._parser);
                    break;
                case RelationshipTypes.CommentsExtended:
                    this.commentsExtendedPart = part = new CommentsExtendedPart(this._package, path);
                    break;
            }
            if (part == null)
                return Promise.resolve(null);
            this.partsMap[path] = part;
            this.parts.push(part);
            await part.load();
            if (part.rels?.length > 0) {
                const [folder] = splitPath(part.path);
                await Promise.all(part.rels.map(rel => this.loadRelationshipPart(resolvePath(rel.target, folder), rel.type)));
            }
            return part;
        }
        async loadDocumentImage(id, part) {
            const x = await this.loadResource(part ?? this.documentPart, id, "blob");
            return this.blobToURL(x);
        }
        async loadNumberingImage(id) {
            const x = await this.loadResource(this.numberingPart, id, "blob");
            return this.blobToURL(x);
        }
        async loadFont(id, key) {
            const x = await this.loadResource(this.fontTablePart, id, "uint8array");
            return x ? this.blobToURL(new Blob([deobfuscate(x, key)])) : x;
        }
        async loadAltChunk(id, part) {
            return await this.loadResource(part ?? this.documentPart, id, "string");
        }
        blobToURL(blob) {
            if (!blob)
                return null;
            if (this._options.useBase64URL) {
                return blobToBase64(blob);
            }
            return URL.createObjectURL(blob);
        }
        findPartByRelId(id, basePart = null) {
            var rel = (basePart.rels ?? this.rels).find(r => r.id == id);
            const folder = basePart ? splitPath(basePart.path)[0] : '';
            return rel ? this.partsMap[resolvePath(rel.target, folder)] : null;
        }
        getPathById(part, id) {
            const rel = part.rels.find(x => x.id == id);
            const [folder] = splitPath(part.path);
            return rel ? resolvePath(rel.target, folder) : null;
        }
        loadResource(part, id, outputType) {
            const path = this.getPathById(part, id);
            return path ? this._package.load(path, outputType) : Promise.resolve(null);
        }
    }
    function deobfuscate(data, guidKey) {
        const len = 16;
        const trimmed = guidKey.replace(/{|}|-/g, "");
        const numbers = new Array(len);
        for (let i = 0; i < len; i++)
            numbers[len - i - 1] = parseInt(trimmed.substr(i * 2, 2), 16);
        for (let i = 0; i < 32; i++)
            data[i] = data[i] ^ numbers[i % len];
        return data;
    }

    function parseBookmarkStart(elem, xml) {
        return {
            type: DomType.BookmarkStart,
            id: xml.attr(elem, "id"),
            name: xml.attr(elem, "name"),
            colFirst: xml.intAttr(elem, "colFirst"),
            colLast: xml.intAttr(elem, "colLast")
        };
    }
    function parseBookmarkEnd(elem, xml) {
        return {
            type: DomType.BookmarkEnd,
            id: xml.attr(elem, "id")
        };
    }

    class VmlElement extends OpenXmlElementBase {
        constructor() {
            super(...arguments);
            this.type = DomType.VmlElement;
            this.attrs = {};
        }
    }
    function parseVmlElement(elem, parser) {
        var result = new VmlElement();
        switch (elem.localName) {
            case "rect":
                result.tagName = "rect";
                Object.assign(result.attrs, { width: '100%', height: '100%' });
                break;
            case "oval":
                result.tagName = "ellipse";
                Object.assign(result.attrs, { cx: "50%", cy: "50%", rx: "50%", ry: "50%" });
                break;
            case "line":
                result.tagName = "line";
                break;
            case "shape":
                result.tagName = "g";
                break;
            case "textbox":
                result.tagName = "foreignObject";
                Object.assign(result.attrs, { width: '100%', height: '100%' });
                break;
            default:
                return null;
        }
        for (const at of globalXmlParser.attrs(elem)) {
            switch (at.localName) {
                case "style":
                    result.cssStyleText = at.value;
                    break;
                case "fillcolor":
                    result.attrs.fill = at.value;
                    break;
                case "from":
                    const [x1, y1] = parsePoint(at.value);
                    Object.assign(result.attrs, { x1, y1 });
                    break;
                case "to":
                    const [x2, y2] = parsePoint(at.value);
                    Object.assign(result.attrs, { x2, y2 });
                    break;
            }
        }
        for (const el of globalXmlParser.elements(elem)) {
            switch (el.localName) {
                case "stroke":
                    Object.assign(result.attrs, parseStroke(el));
                    break;
                case "fill":
                    Object.assign(result.attrs, parseFill());
                    break;
                case "imagedata":
                    result.tagName = "image";
                    Object.assign(result.attrs, { width: '100%', height: '100%' });
                    result.imageHref = {
                        id: globalXmlParser.attr(el, "id"),
                        title: globalXmlParser.attr(el, "title"),
                    };
                    break;
                case "txbxContent":
                    result.children.push(...parser.parseBodyElements(el));
                    break;
                default:
                    const child = parseVmlElement(el, parser);
                    child && result.children.push(child);
                    break;
            }
        }
        return result;
    }
    function parseStroke(el) {
        return {
            'stroke': globalXmlParser.attr(el, "color"),
            'stroke-width': globalXmlParser.lengthAttr(el, "weight", LengthUsage.Emu) ?? '1px'
        };
    }
    function parseFill(el) {
        return {};
    }
    function parsePoint(val) {
        return val.split(",");
    }

    class WmlComment extends OpenXmlElementBase {
        constructor() {
            super(...arguments);
            this.type = DomType.Comment;
        }
    }
    class WmlCommentReference extends OpenXmlElementBase {
        constructor(id) {
            super();
            this.id = id;
            this.type = DomType.CommentReference;
        }
    }
    class WmlCommentRangeStart extends OpenXmlElementBase {
        constructor(id) {
            super();
            this.id = id;
            this.type = DomType.CommentRangeStart;
        }
    }
    class WmlCommentRangeEnd extends OpenXmlElementBase {
        constructor(id) {
            super();
            this.id = id;
            this.type = DomType.CommentRangeEnd;
        }
    }

    var autos = {
        shd: "inherit",
        color: "black",
        borderColor: "black",
        highlight: "transparent"
    };
    const supportedNamespaceURIs = [];
    const mmlTagMap = {
        "oMath": DomType.MmlMath,
        "oMathPara": DomType.MmlMathParagraph,
        "f": DomType.MmlFraction,
        "func": DomType.MmlFunction,
        "fName": DomType.MmlFunctionName,
        "num": DomType.MmlNumerator,
        "den": DomType.MmlDenominator,
        "rad": DomType.MmlRadical,
        "deg": DomType.MmlDegree,
        "e": DomType.MmlBase,
        "sSup": DomType.MmlSuperscript,
        "sSub": DomType.MmlSubscript,
        "sPre": DomType.MmlPreSubSuper,
        "sup": DomType.MmlSuperArgument,
        "sub": DomType.MmlSubArgument,
        "d": DomType.MmlDelimiter,
        "nary": DomType.MmlNary,
        "eqArr": DomType.MmlEquationArray,
        "lim": DomType.MmlLimit,
        "limLow": DomType.MmlLimitLower,
        "m": DomType.MmlMatrix,
        "mr": DomType.MmlMatrixRow,
        "box": DomType.MmlBox,
        "bar": DomType.MmlBar,
        "groupChr": DomType.MmlGroupChar
    };
    class DocumentParser {
        constructor(options) {
            this.options = {
                ignoreWidth: false,
                debug: false,
                ...options
            };
        }
        parseNotes(xmlDoc, elemName, elemClass) {
            var result = [];
            for (let el of globalXmlParser.elements(xmlDoc, elemName)) {
                const node = new elemClass();
                node.id = globalXmlParser.attr(el, "id");
                node.noteType = globalXmlParser.attr(el, "type");
                node.children = this.parseBodyElements(el);
                result.push(node);
            }
            return result;
        }
        parseComments(xmlDoc) {
            var result = [];
            for (let el of globalXmlParser.elements(xmlDoc, "comment")) {
                const item = new WmlComment();
                item.id = globalXmlParser.attr(el, "id");
                item.author = globalXmlParser.attr(el, "author");
                item.initials = globalXmlParser.attr(el, "initials");
                item.date = globalXmlParser.attr(el, "date");
                item.children = this.parseBodyElements(el);
                result.push(item);
            }
            return result;
        }
        parseDocumentFile(xmlDoc) {
            var xbody = globalXmlParser.element(xmlDoc, "body");
            var background = globalXmlParser.element(xmlDoc, "background");
            var sectPr = globalXmlParser.element(xbody, "sectPr");
            return {
                type: DomType.Document,
                children: this.parseBodyElements(xbody),
                props: sectPr ? parseSectionProperties(sectPr, globalXmlParser) : {},
                cssStyle: background ? this.parseBackground(background) : {},
            };
        }
        parseBackground(elem) {
            var result = {};
            var color = xmlUtil.colorAttr(elem, "color");
            if (color) {
                result["background-color"] = color;
            }
            return result;
        }
        parseBodyElements(element) {
            var children = [];
            for (let elem of globalXmlParser.elements(element)) {
                switch (elem.localName) {
                    case "p":
                        children.push(this.parseParagraph(elem));
                        break;
                    case "altChunk":
                        children.push(this.parseAltChunk(elem));
                        break;
                    case "tbl":
                        children.push(this.parseTable(elem));
                        break;
                    case "sdt":
                        children.push(...this.parseSdt(elem, e => this.parseBodyElements(e)));
                        break;
                }
            }
            return children;
        }
        parseStylesFile(xstyles) {
            var result = [];
            xmlUtil.foreach(xstyles, n => {
                switch (n.localName) {
                    case "style":
                        result.push(this.parseStyle(n));
                        break;
                    case "docDefaults":
                        result.push(this.parseDefaultStyles(n));
                        break;
                }
            });
            return result;
        }
        parseDefaultStyles(node) {
            var result = {
                id: null,
                name: null,
                target: null,
                basedOn: null,
                styles: []
            };
            xmlUtil.foreach(node, c => {
                switch (c.localName) {
                    case "rPrDefault":
                        var rPr = globalXmlParser.element(c, "rPr");
                        if (rPr)
                            result.styles.push({
                                target: "span",
                                values: this.parseDefaultProperties(rPr, {})
                            });
                        break;
                    case "pPrDefault":
                        var pPr = globalXmlParser.element(c, "pPr");
                        if (pPr)
                            result.styles.push({
                                target: "p",
                                values: this.parseDefaultProperties(pPr, {})
                            });
                        break;
                }
            });
            return result;
        }
        parseStyle(node) {
            var result = {
                id: globalXmlParser.attr(node, "styleId"),
                isDefault: globalXmlParser.boolAttr(node, "default"),
                name: null,
                target: null,
                basedOn: null,
                styles: [],
                linked: null
            };
            switch (globalXmlParser.attr(node, "type")) {
                case "paragraph":
                    result.target = "p";
                    break;
                case "table":
                    result.target = "table";
                    break;
                case "character":
                    result.target = "span";
                    break;
            }
            xmlUtil.foreach(node, n => {
                switch (n.localName) {
                    case "basedOn":
                        result.basedOn = globalXmlParser.attr(n, "val");
                        break;
                    case "name":
                        result.name = globalXmlParser.attr(n, "val");
                        break;
                    case "link":
                        result.linked = globalXmlParser.attr(n, "val");
                        break;
                    case "next":
                        result.next = globalXmlParser.attr(n, "val");
                        break;
                    case "aliases":
                        result.aliases = globalXmlParser.attr(n, "val").split(",");
                        break;
                    case "pPr":
                        result.styles.push({
                            target: "p",
                            values: this.parseDefaultProperties(n, {})
                        });
                        result.paragraphProps = parseParagraphProperties(n, globalXmlParser);
                        break;
                    case "rPr":
                        result.styles.push({
                            target: "span",
                            values: this.parseDefaultProperties(n, {})
                        });
                        result.runProps = parseRunProperties(n, globalXmlParser);
                        break;
                    case "tblPr":
                    case "tcPr":
                        result.styles.push({
                            target: "td",
                            values: this.parseDefaultProperties(n, {})
                        });
                        break;
                    case "tblStylePr":
                        for (let s of this.parseTableStyle(n))
                            result.styles.push(s);
                        break;
                    case "rsid":
                    case "qFormat":
                    case "hidden":
                    case "semiHidden":
                    case "unhideWhenUsed":
                    case "autoRedefine":
                    case "uiPriority":
                        break;
                    default:
                        this.options.debug && console.warn(`DOCX: Unknown style element: ${n.localName}`);
                }
            });
            return result;
        }
        parseTableStyle(node) {
            var result = [];
            var type = globalXmlParser.attr(node, "type");
            var selector = "";
            var modificator = "";
            switch (type) {
                case "firstRow":
                    modificator = ".first-row";
                    selector = "tr.first-row td";
                    break;
                case "lastRow":
                    modificator = ".last-row";
                    selector = "tr.last-row td";
                    break;
                case "firstCol":
                    modificator = ".first-col";
                    selector = "td.first-col";
                    break;
                case "lastCol":
                    modificator = ".last-col";
                    selector = "td.last-col";
                    break;
                case "band1Vert":
                    modificator = ":not(.no-vband)";
                    selector = "td.odd-col";
                    break;
                case "band2Vert":
                    modificator = ":not(.no-vband)";
                    selector = "td.even-col";
                    break;
                case "band1Horz":
                    modificator = ":not(.no-hband)";
                    selector = "tr.odd-row";
                    break;
                case "band2Horz":
                    modificator = ":not(.no-hband)";
                    selector = "tr.even-row";
                    break;
                default: return [];
            }
            xmlUtil.foreach(node, n => {
                switch (n.localName) {
                    case "pPr":
                        result.push({
                            target: `${selector} p`,
                            mod: modificator,
                            values: this.parseDefaultProperties(n, {})
                        });
                        break;
                    case "rPr":
                        result.push({
                            target: `${selector} span`,
                            mod: modificator,
                            values: this.parseDefaultProperties(n, {})
                        });
                        break;
                    case "tblPr":
                    case "tcPr":
                        result.push({
                            target: selector,
                            mod: modificator,
                            values: this.parseDefaultProperties(n, {})
                        });
                        break;
                }
            });
            return result;
        }
        parseNumberingFile(xnums) {
            var result = [];
            var mapping = {};
            var bullets = [];
            xmlUtil.foreach(xnums, n => {
                switch (n.localName) {
                    case "abstractNum":
                        this.parseAbstractNumbering(n, bullets)
                            .forEach(x => result.push(x));
                        break;
                    case "numPicBullet":
                        bullets.push(this.parseNumberingPicBullet(n));
                        break;
                    case "num":
                        var numId = globalXmlParser.attr(n, "numId");
                        var abstractNumId = globalXmlParser.elementAttr(n, "abstractNumId", "val");
                        mapping[abstractNumId] = numId;
                        break;
                }
            });
            result.forEach(x => x.id = mapping[x.id]);
            return result;
        }
        parseNumberingPicBullet(elem) {
            var pict = globalXmlParser.element(elem, "pict");
            var shape = pict && globalXmlParser.element(pict, "shape");
            var imagedata = shape && globalXmlParser.element(shape, "imagedata");
            return imagedata ? {
                id: globalXmlParser.intAttr(elem, "numPicBulletId"),
                src: globalXmlParser.attr(imagedata, "id"),
                style: globalXmlParser.attr(shape, "style")
            } : null;
        }
        parseAbstractNumbering(node, bullets) {
            var result = [];
            var id = globalXmlParser.attr(node, "abstractNumId");
            xmlUtil.foreach(node, n => {
                switch (n.localName) {
                    case "lvl":
                        result.push(this.parseNumberingLevel(id, n, bullets));
                        break;
                }
            });
            return result;
        }
        parseNumberingLevel(id, node, bullets) {
            var result = {
                id: id,
                level: globalXmlParser.intAttr(node, "ilvl"),
                start: 1,
                pStyleName: undefined,
                pStyle: {},
                rStyle: {},
                suff: "tab"
            };
            xmlUtil.foreach(node, n => {
                switch (n.localName) {
                    case "start":
                        result.start = globalXmlParser.intAttr(n, "val");
                        break;
                    case "pPr":
                        this.parseDefaultProperties(n, result.pStyle);
                        break;
                    case "rPr":
                        this.parseDefaultProperties(n, result.rStyle);
                        break;
                    case "lvlPicBulletId":
                        var id = globalXmlParser.intAttr(n, "val");
                        result.bullet = bullets.find(x => x?.id == id);
                        break;
                    case "lvlText":
                        result.levelText = globalXmlParser.attr(n, "val");
                        break;
                    case "pStyle":
                        result.pStyleName = globalXmlParser.attr(n, "val");
                        break;
                    case "numFmt":
                        result.format = globalXmlParser.attr(n, "val");
                        break;
                    case "suff":
                        result.suff = globalXmlParser.attr(n, "val");
                        break;
                }
            });
            return result;
        }
        parseSdt(node, parser) {
            const sdtContent = globalXmlParser.element(node, "sdtContent");
            return sdtContent ? parser(sdtContent) : [];
        }
        parseInserted(node, parentParser) {
            return {
                type: DomType.Inserted,
                children: parentParser(node)?.children ?? []
            };
        }
        parseDeleted(node, parentParser) {
            return {
                type: DomType.Deleted,
                children: parentParser(node)?.children ?? []
            };
        }
        parseAltChunk(node) {
            return { type: DomType.AltChunk, children: [], id: globalXmlParser.attr(node, "id") };
        }
        parseParagraph(node) {
            var result = { type: DomType.Paragraph, children: [] };
            for (let el of globalXmlParser.elements(node)) {
                switch (el.localName) {
                    case "pPr":
                        this.parseParagraphProperties(el, result);
                        break;
                    case "r":
                        result.children.push(this.parseRun(el, result));
                        break;
                    case "hyperlink":
                        result.children.push(this.parseHyperlink(el, result));
                        break;
                    case "smartTag":
                        result.children.push(this.parseSmartTag(el, result));
                        break;
                    case "bookmarkStart":
                        result.children.push(parseBookmarkStart(el, globalXmlParser));
                        break;
                    case "bookmarkEnd":
                        result.children.push(parseBookmarkEnd(el, globalXmlParser));
                        break;
                    case "commentRangeStart":
                        result.children.push(new WmlCommentRangeStart(globalXmlParser.attr(el, "id")));
                        break;
                    case "commentRangeEnd":
                        result.children.push(new WmlCommentRangeEnd(globalXmlParser.attr(el, "id")));
                        break;
                    case "oMath":
                    case "oMathPara":
                        const mmlNode = this.parseMathElement(el);
                        mmlNode._raw = el;
                        result.children.push(mmlNode);
                        break;
                    case "sdt":
                        result.children.push(...this.parseSdt(el, e => this.parseParagraph(e).children));
                        break;
                    case "ins":
                        result.children.push(this.parseInserted(el, e => this.parseParagraph(e)));
                        break;
                    case "del":
                        result.children.push(this.parseDeleted(el, e => this.parseParagraph(e)));
                        break;
                }
            }
            return result;
        }
        parseParagraphProperties(elem, paragraph) {
            this.parseDefaultProperties(elem, paragraph.cssStyle = {}, null, c => {
                if (parseParagraphProperty(c, paragraph, globalXmlParser))
                    return true;
                switch (c.localName) {
                    case "pStyle":
                        paragraph.styleName = globalXmlParser.attr(c, "val");
                        break;
                    case "cnfStyle":
                        paragraph.className = values.classNameOfCnfStyle(c);
                        break;
                    case "framePr":
                        this.parseFrame(c, paragraph);
                        break;
                    case "rPr":
                        break;
                    default:
                        return false;
                }
                return true;
            });
        }
        parseFrame(node, paragraph) {
            var dropCap = globalXmlParser.attr(node, "dropCap");
            if (dropCap == "drop")
                paragraph.cssStyle["float"] = "left";
        }
        parseHyperlink(node, parent) {
            var result = { type: DomType.Hyperlink, parent: parent, children: [] };
            result.anchor = globalXmlParser.attr(node, "anchor");
            result.id = globalXmlParser.attr(node, "id");
            xmlUtil.foreach(node, c => {
                switch (c.localName) {
                    case "r":
                        result.children.push(this.parseRun(c, result));
                        break;
                }
            });
            return result;
        }
        parseSmartTag(node, parent) {
            var result = { type: DomType.SmartTag, parent, children: [] };
            var uri = globalXmlParser.attr(node, "uri");
            var element = globalXmlParser.attr(node, "element");
            if (uri)
                result.uri = uri;
            if (element)
                result.element = element;
            xmlUtil.foreach(node, c => {
                switch (c.localName) {
                    case "r":
                        result.children.push(this.parseRun(c, result));
                        break;
                }
            });
            return result;
        }
        parseRun(node, parent) {
            var result = { type: DomType.Run, parent: parent, children: [] };
            xmlUtil.foreach(node, c => {
                c = this.checkAlternateContent(c);
                switch (c.localName) {
                    case "t":
                        result.children.push({
                            type: DomType.Text,
                            text: c.textContent
                        });
                        break;
                    case "delText":
                        result.children.push({
                            type: DomType.DeletedText,
                            text: c.textContent
                        });
                        break;
                    case "commentReference":
                        result.children.push(new WmlCommentReference(globalXmlParser.attr(c, "id")));
                        break;
                    case "fldSimple":
                        result.children.push({
                            type: DomType.SimpleField,
                            instruction: globalXmlParser.attr(c, "instr"),
                            lock: globalXmlParser.boolAttr(c, "lock", false),
                            dirty: globalXmlParser.boolAttr(c, "dirty", false)
                        });
                        break;
                    case "instrText":
                        result.fieldRun = true;
                        result.children.push({
                            type: DomType.Instruction,
                            text: c.textContent
                        });
                        break;
                    case "fldChar":
                        result.fieldRun = true;
                        result.children.push({
                            type: DomType.ComplexField,
                            charType: globalXmlParser.attr(c, "fldCharType"),
                            lock: globalXmlParser.boolAttr(c, "lock", false),
                            dirty: globalXmlParser.boolAttr(c, "dirty", false)
                        });
                        break;
                    case "noBreakHyphen":
                        result.children.push({ type: DomType.NoBreakHyphen });
                        break;
                    case "br":
                        result.children.push({
                            type: DomType.Break,
                            break: globalXmlParser.attr(c, "type") || "textWrapping"
                        });
                        break;
                    case "lastRenderedPageBreak":
                        result.children.push({
                            type: DomType.Break,
                            break: "lastRenderedPageBreak"
                        });
                        break;
                    case "sym":
                        result.children.push({
                            type: DomType.Symbol,
                            font: encloseFontFamily(globalXmlParser.attr(c, "font")),
                            char: globalXmlParser.attr(c, "char")
                        });
                        break;
                    case "tab":
                        result.children.push({ type: DomType.Tab });
                        break;
                    case "footnoteReference":
                        result.children.push({
                            type: DomType.FootnoteReference,
                            id: globalXmlParser.attr(c, "id")
                        });
                        break;
                    case "endnoteReference":
                        result.children.push({
                            type: DomType.EndnoteReference,
                            id: globalXmlParser.attr(c, "id")
                        });
                        break;
                    case "drawing":
                        let d = this.parseDrawing(c);
                        if (d)
                            result.children = [d];
                        break;
                    case "pict":
                        result.children.push(this.parseVmlPicture(c));
                        break;
                    case "rPr":
                        this.parseRunProperties(c, result);
                        break;
                }
            });
            return result;
        }
        parseMathElement(elem) {
            const propsTag = `${elem.localName}Pr`;
            const result = { type: mmlTagMap[elem.localName], children: [], _raw: elem };
            for (const el of globalXmlParser.elements(elem)) {
                const childType = mmlTagMap[el.localName];
                if (childType) {
                    result.children.push(this.parseMathElement(el));
                }
                else if (el.localName == "r") {
                    var run = this.parseRun(el);
                    run.type = DomType.MmlRun;
                    result.children.push(run);
                }
                else if (el.localName == propsTag) {
                    result.props = this.parseMathProperies(el);
                }
            }
            return result;
        }
        parseMathProperies(elem) {
            const result = {};
            for (const el of globalXmlParser.elements(elem)) {
                switch (el.localName) {
                    case "chr":
                        result.char = globalXmlParser.attr(el, "val");
                        break;
                    case "vertJc":
                        result.verticalJustification = globalXmlParser.attr(el, "val");
                        break;
                    case "pos":
                        result.position = globalXmlParser.attr(el, "val");
                        break;
                    case "degHide":
                        result.hideDegree = globalXmlParser.boolAttr(el, "val");
                        break;
                    case "begChr":
                        result.beginChar = globalXmlParser.attr(el, "val");
                        break;
                    case "endChr":
                        result.endChar = globalXmlParser.attr(el, "val");
                        break;
                }
            }
            return result;
        }
        parseRunProperties(elem, run) {
            this.parseDefaultProperties(elem, run.cssStyle = {}, null, c => {
                switch (c.localName) {
                    case "rStyle":
                        run.styleName = globalXmlParser.attr(c, "val");
                        break;
                    case "vertAlign":
                        run.verticalAlign = values.valueOfVertAlign(c, true);
                        break;
                    default:
                        return false;
                }
                return true;
            });
        }
        parseVmlPicture(elem) {
            const result = { type: DomType.VmlPicture, children: [] };
            for (const el of globalXmlParser.elements(elem)) {
                const child = parseVmlElement(el, this);
                child && result.children.push(child);
            }
            return result;
        }
        checkAlternateContent(elem) {
            if (elem.localName != 'AlternateContent')
                return elem;
            var choice = globalXmlParser.element(elem, "Choice");
            if (choice) {
                var requires = globalXmlParser.attr(choice, "Requires");
                var namespaceURI = elem.lookupNamespaceURI(requires);
                if (supportedNamespaceURIs.includes(namespaceURI))
                    return choice.firstElementChild;
            }
            return globalXmlParser.element(elem, "Fallback")?.firstElementChild;
        }
        parseDrawing(node) {
            for (var n of globalXmlParser.elements(node)) {
                switch (n.localName) {
                    case "inline":
                    case "anchor":
                        return this.parseDrawingWrapper(n);
                }
            }
        }
        parseDrawingWrapper(node) {
            var result = { type: DomType.Drawing, children: [], cssStyle: {} };
            var isAnchor = node.localName == "anchor";
            let wrapType = null;
            let simplePos = globalXmlParser.boolAttr(node, "simplePos");
            globalXmlParser.boolAttr(node, "behindDoc");
            let posX = { relative: "page", align: "left", offset: "0" };
            let posY = { relative: "page", align: "top", offset: "0" };
            for (var n of globalXmlParser.elements(node)) {
                switch (n.localName) {
                    case "simplePos":
                        if (simplePos) {
                            posX.offset = globalXmlParser.lengthAttr(n, "x", LengthUsage.Emu);
                            posY.offset = globalXmlParser.lengthAttr(n, "y", LengthUsage.Emu);
                        }
                        break;
                    case "extent":
                        result.cssStyle["width"] = globalXmlParser.lengthAttr(n, "cx", LengthUsage.Emu);
                        result.cssStyle["height"] = globalXmlParser.lengthAttr(n, "cy", LengthUsage.Emu);
                        break;
                    case "positionH":
                    case "positionV":
                        if (!simplePos) {
                            let pos = n.localName == "positionH" ? posX : posY;
                            var alignNode = globalXmlParser.element(n, "align");
                            var offsetNode = globalXmlParser.element(n, "posOffset");
                            pos.relative = globalXmlParser.attr(n, "relativeFrom") ?? pos.relative;
                            if (alignNode)
                                pos.align = alignNode.textContent;
                            if (offsetNode)
                                pos.offset = xmlUtil.sizeValue(offsetNode, LengthUsage.Emu);
                        }
                        break;
                    case "wrapTopAndBottom":
                        wrapType = "wrapTopAndBottom";
                        break;
                    case "wrapNone":
                        wrapType = "wrapNone";
                        break;
                    case "graphic":
                        var g = this.parseGraphic(n);
                        if (g)
                            result.children.push(g);
                        break;
                }
            }
            if (wrapType == "wrapTopAndBottom") {
                result.cssStyle['display'] = 'block';
                if (posX.align) {
                    result.cssStyle['text-align'] = posX.align;
                    result.cssStyle['width'] = "100%";
                }
            }
            else if (wrapType == "wrapNone") {
                result.cssStyle['display'] = 'block';
                result.cssStyle['position'] = 'relative';
                result.cssStyle["width"] = "0px";
                result.cssStyle["height"] = "0px";
                if (posX.offset)
                    result.cssStyle["left"] = posX.offset;
                if (posY.offset)
                    result.cssStyle["top"] = posY.offset;
            }
            else if (isAnchor && (posX.align == 'left' || posX.align == 'right')) {
                result.cssStyle["float"] = posX.align;
            }
            return result;
        }
        parseGraphic(elem) {
            var graphicData = globalXmlParser.element(elem, "graphicData");
            for (let n of globalXmlParser.elements(graphicData)) {
                switch (n.localName) {
                    case "pic":
                        return this.parsePicture(n);
                }
            }
            return null;
        }
        parsePicture(elem) {
            var result = { type: DomType.Image, src: "", cssStyle: {} };
            var blipFill = globalXmlParser.element(elem, "blipFill");
            var blip = globalXmlParser.element(blipFill, "blip");
            var srcRect = globalXmlParser.element(blipFill, "srcRect");
            result.src = globalXmlParser.attr(blip, "embed");
            if (srcRect) {
                result.srcRect = [
                    globalXmlParser.intAttr(srcRect, "l", 0) / 100000,
                    globalXmlParser.intAttr(srcRect, "t", 0) / 100000,
                    globalXmlParser.intAttr(srcRect, "r", 0) / 100000,
                    globalXmlParser.intAttr(srcRect, "b", 0) / 100000,
                ];
            }
            var spPr = globalXmlParser.element(elem, "spPr");
            var xfrm = globalXmlParser.element(spPr, "xfrm");
            result.cssStyle["position"] = "relative";
            if (xfrm) {
                result.rotation = globalXmlParser.intAttr(xfrm, "rot", 0) / 60000;
                for (var n of globalXmlParser.elements(xfrm)) {
                    switch (n.localName) {
                        case "ext":
                            result.cssStyle["width"] = globalXmlParser.lengthAttr(n, "cx", LengthUsage.Emu);
                            result.cssStyle["height"] = globalXmlParser.lengthAttr(n, "cy", LengthUsage.Emu);
                            break;
                        case "off":
                            result.cssStyle["left"] = globalXmlParser.lengthAttr(n, "x", LengthUsage.Emu);
                            result.cssStyle["top"] = globalXmlParser.lengthAttr(n, "y", LengthUsage.Emu);
                            break;
                    }
                }
            }
            return result;
        }
        parseTable(node) {
            var result = { type: DomType.Table, children: [] };
            xmlUtil.foreach(node, c => {
                switch (c.localName) {
                    case "tr":
                        result.children.push(this.parseTableRow(c));
                        break;
                    case "tblGrid":
                        result.columns = this.parseTableColumns(c);
                        break;
                    case "tblPr":
                        this.parseTableProperties(c, result);
                        break;
                }
            });
            return result;
        }
        parseTableColumns(node) {
            var result = [];
            xmlUtil.foreach(node, n => {
                switch (n.localName) {
                    case "gridCol":
                        result.push({ width: globalXmlParser.lengthAttr(n, "w") });
                        break;
                }
            });
            return result;
        }
        parseTableProperties(elem, table) {
            table.cssStyle = {};
            table.cellStyle = {};
            this.parseDefaultProperties(elem, table.cssStyle, table.cellStyle, c => {
                switch (c.localName) {
                    case "tblStyle":
                        table.styleName = globalXmlParser.attr(c, "val");
                        break;
                    case "tblLook":
                        table.className = values.classNameOftblLook(c);
                        break;
                    case "tblpPr":
                        this.parseTablePosition(c, table);
                        break;
                    case "tblStyleColBandSize":
                        table.colBandSize = globalXmlParser.intAttr(c, "val");
                        break;
                    case "tblStyleRowBandSize":
                        table.rowBandSize = globalXmlParser.intAttr(c, "val");
                        break;
                    case "hidden":
                        table.cssStyle["display"] = "none";
                        break;
                    default:
                        return false;
                }
                return true;
            });
            switch (table.cssStyle["text-align"]) {
                case "center":
                    delete table.cssStyle["text-align"];
                    table.cssStyle["margin-left"] = "auto";
                    table.cssStyle["margin-right"] = "auto";
                    break;
                case "right":
                    delete table.cssStyle["text-align"];
                    table.cssStyle["margin-left"] = "auto";
                    break;
            }
        }
        parseTablePosition(node, table) {
            var topFromText = globalXmlParser.lengthAttr(node, "topFromText");
            var bottomFromText = globalXmlParser.lengthAttr(node, "bottomFromText");
            var rightFromText = globalXmlParser.lengthAttr(node, "rightFromText");
            var leftFromText = globalXmlParser.lengthAttr(node, "leftFromText");
            table.cssStyle["float"] = 'left';
            table.cssStyle["margin-bottom"] = values.addSize(table.cssStyle["margin-bottom"], bottomFromText);
            table.cssStyle["margin-left"] = values.addSize(table.cssStyle["margin-left"], leftFromText);
            table.cssStyle["margin-right"] = values.addSize(table.cssStyle["margin-right"], rightFromText);
            table.cssStyle["margin-top"] = values.addSize(table.cssStyle["margin-top"], topFromText);
        }
        parseTableRow(node) {
            var result = { type: DomType.Row, children: [] };
            xmlUtil.foreach(node, c => {
                switch (c.localName) {
                    case "tc":
                        result.children.push(this.parseTableCell(c));
                        break;
                    case "trPr":
                    case "tblPrEx":
                        this.parseTableRowProperties(c, result);
                        break;
                }
            });
            return result;
        }
        parseTableRowProperties(elem, row) {
            row.cssStyle = this.parseDefaultProperties(elem, {}, null, c => {
                switch (c.localName) {
                    case "cnfStyle":
                        row.className = values.classNameOfCnfStyle(c);
                        break;
                    case "tblHeader":
                        row.isHeader = globalXmlParser.boolAttr(c, "val");
                        break;
                    case "gridBefore":
                        row.gridBefore = globalXmlParser.intAttr(c, "val");
                        break;
                    case "gridAfter":
                        row.gridAfter = globalXmlParser.intAttr(c, "val");
                        break;
                    default:
                        return false;
                }
                return true;
            });
        }
        parseTableCell(node) {
            var result = { type: DomType.Cell, children: [] };
            xmlUtil.foreach(node, c => {
                switch (c.localName) {
                    case "tbl":
                        result.children.push(this.parseTable(c));
                        break;
                    case "p":
                        result.children.push(this.parseParagraph(c));
                        break;
                    case "tcPr":
                        this.parseTableCellProperties(c, result);
                        break;
                }
            });
            return result;
        }
        parseTableCellProperties(elem, cell) {
            cell.cssStyle = this.parseDefaultProperties(elem, {}, null, c => {
                switch (c.localName) {
                    case "gridSpan":
                        cell.span = globalXmlParser.intAttr(c, "val", null);
                        break;
                    case "vMerge":
                        cell.verticalMerge = globalXmlParser.attr(c, "val") ?? "continue";
                        break;
                    case "cnfStyle":
                        cell.className = values.classNameOfCnfStyle(c);
                        break;
                    default:
                        return false;
                }
                return true;
            });
            this.parseTableCellVerticalText(elem, cell);
        }
        parseTableCellVerticalText(elem, cell) {
            const directionMap = {
                "btLr": {
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)"
                },
                "lrTb": {
                    writingMode: "vertical-lr",
                    transform: "none"
                },
                "tbRl": {
                    writingMode: "vertical-rl",
                    transform: "none"
                }
            };
            xmlUtil.foreach(elem, c => {
                if (c.localName === "textDirection") {
                    const direction = globalXmlParser.attr(c, "val");
                    const style = directionMap[direction] || { writingMode: "horizontal-tb" };
                    cell.cssStyle["writing-mode"] = style.writingMode;
                    cell.cssStyle["transform"] = style.transform;
                }
            });
        }
        parseDefaultProperties(elem, style = null, childStyle = null, handler = null) {
            style = style || {};
            xmlUtil.foreach(elem, c => {
                if (handler?.(c))
                    return;
                switch (c.localName) {
                    case "jc":
                        style["text-align"] = values.valueOfJc(c);
                        break;
                    case "textAlignment":
                        style["vertical-align"] = values.valueOfTextAlignment(c);
                        break;
                    case "color":
                        style["color"] = xmlUtil.colorAttr(c, "val", null, autos.color);
                        break;
                    case "sz":
                        style["font-size"] = style["min-height"] = globalXmlParser.lengthAttr(c, "val", LengthUsage.FontSize);
                        break;
                    case "shd":
                        style["background-color"] = xmlUtil.colorAttr(c, "fill", null, autos.shd);
                        break;
                    case "highlight":
                        style["background-color"] = xmlUtil.colorAttr(c, "val", null, autos.highlight);
                        break;
                    case "vertAlign":
                        break;
                    case "position":
                        style.verticalAlign = globalXmlParser.lengthAttr(c, "val", LengthUsage.FontSize);
                        break;
                    case "tcW":
                        if (this.options.ignoreWidth)
                            break;
                    case "tblW":
                        style["width"] = values.valueOfSize(c, "w");
                        break;
                    case "trHeight":
                        this.parseTrHeight(c, style);
                        break;
                    case "strike":
                        style["text-decoration"] = globalXmlParser.boolAttr(c, "val", true) ? "line-through" : "none";
                        break;
                    case "b":
                        style["font-weight"] = globalXmlParser.boolAttr(c, "val", true) ? "bold" : "normal";
                        break;
                    case "i":
                        style["font-style"] = globalXmlParser.boolAttr(c, "val", true) ? "italic" : "normal";
                        break;
                    case "caps":
                        style["text-transform"] = globalXmlParser.boolAttr(c, "val", true) ? "uppercase" : "none";
                        break;
                    case "smallCaps":
                        style["font-variant"] = globalXmlParser.boolAttr(c, "val", true) ? "small-caps" : "none";
                        break;
                    case "u":
                        this.parseUnderline(c, style);
                        break;
                    case "ind":
                    case "tblInd":
                        this.parseIndentation(c, style);
                        break;
                    case "rFonts":
                        this.parseFont(c, style);
                        break;
                    case "tblBorders":
                        this.parseBorderProperties(c, childStyle || style);
                        break;
                    case "tblCellSpacing":
                        style["border-spacing"] = values.valueOfMargin(c);
                        style["border-collapse"] = "separate";
                        break;
                    case "pBdr":
                        this.parseBorderProperties(c, style);
                        break;
                    case "bdr":
                        style["border"] = values.valueOfBorder(c);
                        break;
                    case "tcBorders":
                        this.parseBorderProperties(c, style);
                        break;
                    case "vanish":
                        if (globalXmlParser.boolAttr(c, "val", true))
                            style["display"] = "none";
                        break;
                    case "kern":
                        break;
                    case "noWrap":
                        break;
                    case "tblCellMar":
                    case "tcMar":
                        this.parseMarginProperties(c, childStyle || style);
                        break;
                    case "tblLayout":
                        style["table-layout"] = values.valueOfTblLayout(c);
                        break;
                    case "vAlign":
                        style["vertical-align"] = values.valueOfTextAlignment(c);
                        break;
                    case "spacing":
                        if (elem.localName == "pPr")
                            this.parseSpacing(c, style);
                        break;
                    case "wordWrap":
                        if (globalXmlParser.boolAttr(c, "val"))
                            style["overflow-wrap"] = "break-word";
                        break;
                    case "suppressAutoHyphens":
                        style["hyphens"] = globalXmlParser.boolAttr(c, "val", true) ? "none" : "auto";
                        break;
                    case "lang":
                        style["$lang"] = globalXmlParser.attr(c, "val");
                        break;
                    case "rtl":
                    case "bidi":
                        if (globalXmlParser.boolAttr(c, "val", true))
                            style["direction"] = "rtl";
                        break;
                    case "bCs":
                    case "iCs":
                    case "szCs":
                    case "tabs":
                    case "outlineLvl":
                    case "contextualSpacing":
                    case "tblStyleColBandSize":
                    case "tblStyleRowBandSize":
                    case "webHidden":
                    case "pageBreakBefore":
                    case "suppressLineNumbers":
                    case "keepLines":
                    case "keepNext":
                    case "widowControl":
                    case "bidi":
                    case "rtl":
                    case "noProof":
                        break;
                    default:
                        if (this.options.debug)
                            console.warn(`DOCX: Unknown document element: ${elem.localName}.${c.localName}`);
                        break;
                }
            });
            return style;
        }
        parseUnderline(node, style) {
            var val = globalXmlParser.attr(node, "val");
            if (val == null)
                return;
            switch (val) {
                case "dash":
                case "dashDotDotHeavy":
                case "dashDotHeavy":
                case "dashedHeavy":
                case "dashLong":
                case "dashLongHeavy":
                case "dotDash":
                case "dotDotDash":
                    style["text-decoration"] = "underline dashed";
                    break;
                case "dotted":
                case "dottedHeavy":
                    style["text-decoration"] = "underline dotted";
                    break;
                case "double":
                    style["text-decoration"] = "underline double";
                    break;
                case "single":
                case "thick":
                    style["text-decoration"] = "underline";
                    break;
                case "wave":
                case "wavyDouble":
                case "wavyHeavy":
                    style["text-decoration"] = "underline wavy";
                    break;
                case "words":
                    style["text-decoration"] = "underline";
                    break;
                case "none":
                    style["text-decoration"] = "none";
                    break;
            }
            var col = xmlUtil.colorAttr(node, "color");
            if (col)
                style["text-decoration-color"] = col;
        }
        parseFont(node, style) {
            var ascii = globalXmlParser.attr(node, "ascii");
            var asciiTheme = values.themeValue(node, "asciiTheme");
            var eastAsia = globalXmlParser.attr(node, "eastAsia");
            var fonts = [ascii, asciiTheme, eastAsia].filter(x => x).map(x => encloseFontFamily(x));
            if (fonts.length > 0)
                style["font-family"] = [...new Set(fonts)].join(', ');
        }
        parseIndentation(node, style) {
            var firstLine = globalXmlParser.lengthAttr(node, "firstLine");
            var hanging = globalXmlParser.lengthAttr(node, "hanging");
            var left = globalXmlParser.lengthAttr(node, "left");
            var start = globalXmlParser.lengthAttr(node, "start");
            var right = globalXmlParser.lengthAttr(node, "right");
            var end = globalXmlParser.lengthAttr(node, "end");
            if (firstLine)
                style["text-indent"] = firstLine;
            if (hanging)
                style["text-indent"] = `-${hanging}`;
            if (left || start)
                style["margin-inline-start"] = left || start;
            if (right || end)
                style["margin-inline-end"] = right || end;
        }
        parseSpacing(node, style) {
            var before = globalXmlParser.lengthAttr(node, "before");
            var after = globalXmlParser.lengthAttr(node, "after");
            var line = globalXmlParser.intAttr(node, "line", null);
            var lineRule = globalXmlParser.attr(node, "lineRule");
            if (before)
                style["margin-top"] = before;
            if (after)
                style["margin-bottom"] = after;
            if (line !== null) {
                switch (lineRule) {
                    case "auto":
                        style["line-height"] = `${(line / 240).toFixed(2)}`;
                        break;
                    case "atLeast":
                        style["line-height"] = `calc(100% + ${line / 20}pt)`;
                        break;
                    default:
                        style["line-height"] = style["min-height"] = `${line / 20}pt`;
                        break;
                }
            }
        }
        parseMarginProperties(node, output) {
            xmlUtil.foreach(node, c => {
                switch (c.localName) {
                    case "left":
                        output["padding-left"] = values.valueOfMargin(c);
                        break;
                    case "right":
                        output["padding-right"] = values.valueOfMargin(c);
                        break;
                    case "top":
                        output["padding-top"] = values.valueOfMargin(c);
                        break;
                    case "bottom":
                        output["padding-bottom"] = values.valueOfMargin(c);
                        break;
                }
            });
        }
        parseTrHeight(node, output) {
            switch (globalXmlParser.attr(node, "hRule")) {
                case "exact":
                    output["height"] = globalXmlParser.lengthAttr(node, "val");
                    break;
                case "atLeast":
                default:
                    output["height"] = globalXmlParser.lengthAttr(node, "val");
                    break;
            }
        }
        parseBorderProperties(node, output) {
            xmlUtil.foreach(node, c => {
                switch (c.localName) {
                    case "start":
                    case "left":
                        output["border-left"] = values.valueOfBorder(c);
                        break;
                    case "end":
                    case "right":
                        output["border-right"] = values.valueOfBorder(c);
                        break;
                    case "top":
                        output["border-top"] = values.valueOfBorder(c);
                        break;
                    case "bottom":
                        output["border-bottom"] = values.valueOfBorder(c);
                        break;
                }
            });
        }
    }
    const knownColors = ['black', 'blue', 'cyan', 'darkBlue', 'darkCyan', 'darkGray', 'darkGreen', 'darkMagenta', 'darkRed', 'darkYellow', 'green', 'lightGray', 'magenta', 'none', 'red', 'white', 'yellow'];
    class xmlUtil {
        static foreach(node, cb) {
            for (var i = 0; i < node.childNodes.length; i++) {
                let n = node.childNodes[i];
                if (n.nodeType == Node.ELEMENT_NODE)
                    cb(n);
            }
        }
        static colorAttr(node, attrName, defValue = null, autoColor = 'black') {
            var v = globalXmlParser.attr(node, attrName);
            if (v) {
                if (v == "auto") {
                    return autoColor;
                }
                else if (knownColors.includes(v)) {
                    return v;
                }
                return `#${v}`;
            }
            var themeColor = globalXmlParser.attr(node, "themeColor");
            return themeColor ? `var(--docx-${themeColor}-color)` : defValue;
        }
        static sizeValue(node, type = LengthUsage.Dxa) {
            return convertLength(node.textContent, type);
        }
    }
    class values {
        static themeValue(c, attr) {
            var val = globalXmlParser.attr(c, attr);
            return val ? `var(--docx-${val}-font)` : null;
        }
        static valueOfSize(c, attr) {
            var type = LengthUsage.Dxa;
            switch (globalXmlParser.attr(c, "type")) {
                case "dxa": break;
                case "pct":
                    type = LengthUsage.Percent;
                    break;
                case "auto": return "auto";
            }
            return globalXmlParser.lengthAttr(c, attr, type);
        }
        static valueOfMargin(c) {
            return globalXmlParser.lengthAttr(c, "w");
        }
        static valueOfBorder(c) {
            var type = values.parseBorderType(globalXmlParser.attr(c, "val"));
            if (type == "none")
                return "none";
            var color = xmlUtil.colorAttr(c, "color");
            var size = globalXmlParser.lengthAttr(c, "sz", LengthUsage.Border);
            return `${size} ${type} ${color == "auto" ? autos.borderColor : color}`;
        }
        static parseBorderType(type) {
            switch (type) {
                case "single": return "solid";
                case "dashDotStroked": return "solid";
                case "dashed": return "dashed";
                case "dashSmallGap": return "dashed";
                case "dotDash": return "dotted";
                case "dotDotDash": return "dotted";
                case "dotted": return "dotted";
                case "double": return "double";
                case "doubleWave": return "double";
                case "inset": return "inset";
                case "nil": return "none";
                case "none": return "none";
                case "outset": return "outset";
                case "thick": return "solid";
                case "thickThinLargeGap": return "solid";
                case "thickThinMediumGap": return "solid";
                case "thickThinSmallGap": return "solid";
                case "thinThickLargeGap": return "solid";
                case "thinThickMediumGap": return "solid";
                case "thinThickSmallGap": return "solid";
                case "thinThickThinLargeGap": return "solid";
                case "thinThickThinMediumGap": return "solid";
                case "thinThickThinSmallGap": return "solid";
                case "threeDEmboss": return "solid";
                case "threeDEngrave": return "solid";
                case "triple": return "double";
                case "wave": return "solid";
            }
            return 'solid';
        }
        static valueOfTblLayout(c) {
            var type = globalXmlParser.attr(c, "val");
            return type == "fixed" ? "fixed" : "auto";
        }
        static classNameOfCnfStyle(c) {
            const val = globalXmlParser.attr(c, "val");
            const classes = [
                'first-row', 'last-row', 'first-col', 'last-col',
                'odd-col', 'even-col', 'odd-row', 'even-row',
                'ne-cell', 'nw-cell', 'se-cell', 'sw-cell'
            ];
            return classes.filter((_, i) => val[i] == '1').join(' ');
        }
        static valueOfJc(c) {
            var type = globalXmlParser.attr(c, "val");
            switch (type) {
                case "start":
                case "left": return "left";
                case "center": return "center";
                case "end":
                case "right": return "right";
                case "both": return "justify";
            }
            return type;
        }
        static valueOfVertAlign(c, asTagName = false) {
            var type = globalXmlParser.attr(c, "val");
            switch (type) {
                case "subscript": return "sub";
                case "superscript": return asTagName ? "sup" : "super";
            }
            return asTagName ? null : type;
        }
        static valueOfTextAlignment(c) {
            var type = globalXmlParser.attr(c, "val");
            switch (type) {
                case "auto":
                case "baseline": return "baseline";
                case "top": return "top";
                case "center": return "middle";
                case "bottom": return "bottom";
            }
            return type;
        }
        static addSize(a, b) {
            if (a == null)
                return b;
            if (b == null)
                return a;
            return `calc(${a} + ${b})`;
        }
        static classNameOftblLook(c) {
            const val = globalXmlParser.hexAttr(c, "val", 0);
            let className = "";
            if (globalXmlParser.boolAttr(c, "firstRow") || (val & 0x0020))
                className += " first-row";
            if (globalXmlParser.boolAttr(c, "lastRow") || (val & 0x0040))
                className += " last-row";
            if (globalXmlParser.boolAttr(c, "firstColumn") || (val & 0x0080))
                className += " first-col";
            if (globalXmlParser.boolAttr(c, "lastColumn") || (val & 0x0100))
                className += " last-col";
            if (globalXmlParser.boolAttr(c, "noHBand") || (val & 0x0200))
                className += " no-hband";
            if (globalXmlParser.boolAttr(c, "noVBand") || (val & 0x0400))
                className += " no-vband";
            return className.trim();
        }
    }

    function getDefaultExportFromCjs (x) {
    	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
    }

    var domNodeTypes;
    var hasRequiredDomNodeTypes;

    function requireDomNodeTypes () {
    	if (hasRequiredDomNodeTypes) return domNodeTypes;
    	hasRequiredDomNodeTypes = 1;
    	domNodeTypes = {
    	  ELEMENT_NODE:                 1,
    	  ATTRIBUTE_NODE:               2,
    	  TEXT_NODE:                    3,
    	  CDATA_SECTION_NODE:           4,
    	  ENTITY_REFERENCE_NODE:        5,
    	  ENTITY_NODE:                  6,
    	  PROCESSING_INSTRUCTION_NODE:  7,
    	  COMMENT_NODE:                 8,
    	  DOCUMENT_NODE:                9,
    	  DOCUMENT_TYPE_NODE:           10,
    	  DOCUMENT_FRAGMENT_NODE:       11,
    	  NOTATION_NODE:                12,
    	};
    	return domNodeTypes;
    }

    var marcheur;
    var hasRequiredMarcheur;

    function requireMarcheur () {
    	if (hasRequiredMarcheur) return marcheur;
    	hasRequiredMarcheur = 1;
    	let {
    	  ELEMENT_NODE,
    	  TEXT_NODE,
    	  CDATA_SECTION_NODE,
    	  DOCUMENT_NODE,
    	  DOCUMENT_FRAGMENT_NODE
    	} = requireDomNodeTypes();

    	marcheur = class Marcheur {
    	  constructor ({ mode = 'function' } = {}) {
    	    this.templates = [];
    	    this.mode = mode; // function, lookup
    	    this.lookupText = null;
    	    this.lookupDocument = null;
    	    this.lookupElement = {};
    	  }
    	  match (matcher, template) {
    	    if (!Array.isArray(matcher)) matcher = [matcher];
    	    // TODO: validate the matcher type
    	    if (this.mode === 'function') {
    	      if (matcher.find(m => typeof m !== 'function')) throw new Error(`All matchers must be functions`);
    	      this.templates.push({ matcher, template });
    	    }
    	    else if (this.mode === 'lookup') {
    	      if (matcher.find(m => !m.nt)) throw new Error(`All matchers must be objects with a type`);
    	      matcher.forEach(({ nt, ns, ln }) => {
    	        if (nt === 'text') {
    	          if (this.lookupText) throw new Error(`You can only have one text lookup template`);
    	          this.lookupText = template;
    	        }
    	        else if (nt === 'document') {
    	          if (this.lookupDocument) throw new Error(`You can only have one document lookup template`);
    	          this.lookupDocument = template;
    	        }
    	        else if (nt === 'element') {
    	          if (!this.lookupElement[ns]) this.lookupElement[ns] = {};
    	          if (this.lookupElement[ns][ln]) {
    	            throw new Error(`You can only have one element lookup template ${ns}|${ln}`);
    	          }
    	          this.lookupElement[ns][ln] = template;
    	        }
    	        else throw new Error(`Unknown lookup node type "${nt}"`);
    	      });
    	    }
    	    else throw new Error(`Unknown mode ${this.mode}`);
    	    return this;
    	  }
    	  result (res) {
    	    this.res = res;
    	  }
    	  findMatch (node) {
    	    let type = node.nodeType;
    	    // This is the default mode, in which templates are matched with a function.
    	    if (this.mode === 'function') {
    	      for (let i = 0; i < this.templates.length; i++) {
    	        let tpl = this.templates[i];
    	        if (!tpl.matcher.some(m => m(node))) continue;
    	        this.stack.unshift(node);
    	        let res = tpl.template(node, this.out[0], this);
    	        this.stack.shift();
    	        return res;
    	      }
    	    }
    	    else if (this.mode === 'lookup') {
    	      if ((type === TEXT_NODE || type === CDATA_SECTION_NODE) && this.lookupText) {
    	        this.stack.unshift(node);
    	        let res = this.lookupText(node, this.out[0], this);
    	        this.stack.shift();
    	        return res;
    	      }
    	      if ((type === DOCUMENT_NODE) && this.lookupDocument) {
    	        this.stack.unshift(node);
    	        let res = this.lookupDocument(node, this.out[0], this);
    	        this.stack.shift();
    	        return res;
    	      }
    	      if (type === ELEMENT_NODE) {
    	        let { namespaceURI, localName } = node;
    	        let tpl = (
    	              this.lookupElement[namespaceURI] &&
    	              this.lookupElement[namespaceURI][localName]
    	            ) ||
    	            (this.lookupElement[''] && this.lookupElement['']['*'])
    	        ;
    	        if (tpl) {
    	          this.stack.unshift(node);
    	          let res = tpl(node, this.out[0], this);
    	          this.stack.shift();
    	          return res;
    	        }
    	      }
    	    }
    	    else throw new Error(`Unknown mode ${this.mode}`);
    	    // this is the default rule when nothing matches
    	    if (type === TEXT_NODE || type === CDATA_SECTION_NODE) {
    	      let out = this.out[0];
    	      if (out) {
    	        let txt = out.ownerDocument.createTextNode(node.textContent);
    	        out.appendChild(txt);
    	      }
    	      return node;
    	    }
    	    if (type === ELEMENT_NODE || type === DOCUMENT_NODE || type === DOCUMENT_FRAGMENT_NODE) {
    	      this.stack.unshift(node);
    	      let res = this.walk(this.out[0]);
    	      this.stack.shift();
    	      return res;
    	    }
    	  }
    	  walk (out, select) {
    	    this.out.unshift(out);
    	    let res = [];
    	    if (select) {
    	      if (!Array.isArray(select)) select = [select];
    	      select.forEach(sel => res.push(this.findMatch(sel)));
    	    }
    	    else {
    	      let parent = this.stack[0]
    	        , nxt = parent.firstChild
    	      ;
    	      while (nxt) {
    	        res.push(this.findMatch(nxt));
    	        nxt = nxt.nextSibling;
    	      }
    	    }
    	    this.out.shift();
    	    return res;
    	  }
    	  run (node, cb) {
    	    this.stack = [];
    	    this.out = [];
    	    this.res = null;
    	    if (cb) {
    	      process.nextTick(() => {
    	        this.findMatch(node);
    	        cb(null, this.res);
    	      });
    	    }
    	    else {
    	      this.findMatch(node);
    	      return this.res;
    	    }
    	  }
    	};
    	return marcheur;
    }

    var qname;
    var hasRequiredQname;

    function requireQname () {
    	if (hasRequiredQname) return qname;
    	hasRequiredQname = 1;
    	qname = function qname (name, ns = {}) {
    	  let match = /^(\w+):(.+)/.exec(name);
    	  if (match && ns[match[1]]) return { ns: ns[match[1]], ln: match[2] };
    	  return { qn: name };
    	};
    	return qname;
    }

    var nodal;
    var hasRequiredNodal;

    function requireNodal () {
    	if (hasRequiredNodal) return nodal;
    	hasRequiredNodal = 1;
    	let qname = requireQname();

    	nodal = function nodal (doc, attrMap = {}, nsMap = {}) {
    	  return {
    	    el: (name, attr = {}, parent) => {
    	      let n = qname(name, nsMap)
    	        , el = n.ns ? doc.createElementNS(n.ns, name) : doc.createElement(name)
    	      ;
    	      Object.keys(attr).forEach(at => {
    	        if (attr[at] == null || attr[at] === '') return;
    	        let atn = qname(at, nsMap);
    	        if (atn.ns) el.setAttributeNS(atn.ns, at, attr[at]);
    	        else el.setAttribute(at, attr[at]);
    	      });
    	      if (parent) parent.appendChild(el);
    	      return el;
    	    },
    	    amap: (src, ret = {}) => {
    	      Object.keys(attrMap).forEach(at => {
    	        let n = qname(at, nsMap);
    	        if (n.ns && src.hasAttributeNS(n.ns, n.ln)) {
    	          ret[attrMap[at]] = src.getAttributeNS(n.ns, n.ln);
    	        }
    	        else if (n.qn && src.hasAttribute(at)) ret[attrMap[at]] = src.getAttribute(at);
    	      });
    	      return ret;
    	    },
    	  };
    	};
    	return nodal;
    }

    var matcher;
    var hasRequiredMatcher;

    function requireMatcher () {
    	if (hasRequiredMatcher) return matcher;
    	hasRequiredMatcher = 1;
    	let { ELEMENT_NODE, TEXT_NODE, CDATA_SECTION_NODE, DOCUMENT_NODE } = requireDomNodeTypes()
    	  , qname = requireQname()
    	  , lc = (str) => str.toLowerCase()
    	;

    	matcher = class Matcher {
    	  constructor (ns = {}, caseInsensitive = false) {
    	    this.ns = ns;
    	    this.ci = caseInsensitive;
    	  }
    	  text () {
    	    return (node) => node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE;
    	  }
    	  document () {
    	    return (node) => node.nodeType === DOCUMENT_NODE;
    	  }
    	  el (name) {
    	    let n = qname(name, this.ns);
    	    if (n.ns) {
    	      return (node) =>
    	          node.nodeType === ELEMENT_NODE &&
    	          (node.namespaceURI === n.ns || n.ns === '*') &&
    	          ((this.ci ? lc(node.localName) === lc(n.ln) : node.localName === n.ln) || n.ln === '*')
    	      ;
    	    }
    	    return (node) =>
    	        node.nodeType === ELEMENT_NODE &&
    	        ((this.ci ? lc(node.nodeName) === lc(name) : node.nodeName === name) || name === '*')
    	    ;
    	  }
    	};
    	return matcher;
    }

    var browser = {};

    var hasRequiredBrowser;

    function requireBrowser () {
    	if (hasRequiredBrowser) return browser;
    	hasRequiredBrowser = 1;
    	browser.document = function () {
    	  return document;
    	};

    	browser.implementation = function () {
    	  return document.implementation;
    	};
    	return browser;
    }

    var xpath = {};

    /*
     * xpath.js
     *
     * An XPath 1.0 library for JavaScript.
     *
     * Cameron McCormack <cam (at) mcc.id.au>
     *
     * This work is licensed under the Creative Commons Attribution-ShareAlike
     * License. To view a copy of this license, visit
     *
     *   http://creativecommons.org/licenses/by-sa/2.0/
     *
     * or send a letter to Creative Commons, 559 Nathan Abbott Way, Stanford,
     * California 94305, USA.
     *
     * Revision 20: April 26, 2011
     *   Fixed a typo resulting in FIRST_ORDERED_NODE_TYPE results being wrong,
     *   thanks to <shi_a009 (at) hotmail.com>.
     *
     * Revision 19: November 29, 2005
     *   Nodesets now store their nodes in a height balanced tree, increasing
     *   performance for the common case of selecting nodes in document order,
     *   thanks to S閎astien Cramatte <contact (at) zeninteractif.com>.
     *   AVL tree code adapted from Raimund Neumann <rnova (at) gmx.net>.
     *
     * Revision 18: October 27, 2005
     *   DOM 3 XPath support.  Caveats:
     *     - namespace prefixes aren't resolved in XPathEvaluator.createExpression,
     *       but in XPathExpression.evaluate.
     *     - XPathResult.invalidIteratorState is not implemented.
     *
     * Revision 17: October 25, 2005
     *   Some core XPath function fixes and a patch to avoid crashing certain
     *   versions of MSXML in PathExpr.prototype.getOwnerElement, thanks to
     *   S閎astien Cramatte <contact (at) zeninteractif.com>.
     *
     * Revision 16: September 22, 2005
     *   Workarounds for some IE 5.5 deficiencies.
     *   Fixed problem with prefix node tests on attribute nodes.
     *
     * Revision 15: May 21, 2005
     *   Fixed problem with QName node tests on elements with an xmlns="...".
     *
     * Revision 14: May 19, 2005
     *   Fixed QName node tests on attribute node regression.
     *
     * Revision 13: May 3, 2005
     *   Node tests are case insensitive now if working in an HTML DOM.
     *
     * Revision 12: April 26, 2005
     *   Updated licence.  Slight code changes to enable use of Dean
     *   Edwards' script compression, http://dean.edwards.name/packer/ .
     *
     * Revision 11: April 23, 2005
     *   Fixed bug with 'and' and 'or' operators, fix thanks to
     *   Sandy McArthur <sandy (at) mcarthur.org>.
     *
     * Revision 10: April 15, 2005
     *   Added support for a virtual root node, supposedly helpful for
     *   implementing XForms.  Fixed problem with QName node tests and
     *   the parent axis.
     *
     * Revision 9: March 17, 2005
     *   Namespace resolver tweaked so using the document node as the context
     *   for namespace lookups is equivalent to using the document element.
     *
     * Revision 8: February 13, 2005
     *   Handle implicit declaration of 'xmlns' namespace prefix.
     *   Fixed bug when comparing nodesets.
     *   Instance data can now be associated with a FunctionResolver, and
     *     workaround for MSXML not supporting 'localName' and 'getElementById',
     *     thanks to Grant Gongaware.
     *   Fix a few problems when the context node is the root node.
     *
     * Revision 7: February 11, 2005
     *   Default namespace resolver fix from Grant Gongaware
     *   <grant (at) gongaware.com>.
     *
     * Revision 6: February 10, 2005
     *   Fixed bug in 'number' function.
     *
     * Revision 5: February 9, 2005
     *   Fixed bug where text nodes not getting converted to string values.
     *
     * Revision 4: January 21, 2005
     *   Bug in 'name' function, fix thanks to Bill Edney.
     *   Fixed incorrect processing of namespace nodes.
     *   Fixed NamespaceResolver to resolve 'xml' namespace.
     *   Implemented union '|' operator.
     *
     * Revision 3: January 14, 2005
     *   Fixed bug with nodeset comparisons, bug lexing < and >.
     *
     * Revision 2: October 26, 2004
     *   QName node test namespace handling fixed.  Few other bug fixes.
     *
     * Revision 1: August 13, 2004
     *   Bug fixes from William J. Edney <bedney (at) technicalpursuit.com>.
     *   Added minimal licence.
     *
     * Initial version: June 14, 2004
     */

    var hasRequiredXpath;

    function requireXpath () {
    	if (hasRequiredXpath) return xpath;
    	hasRequiredXpath = 1;
    	(function (exports) {
    		// non-node wrapper
    		var xpath = exports;

    		(function(exports) {

    		// XPathParser ///////////////////////////////////////////////////////////////

    		XPathParser.prototype = new Object();
    		XPathParser.prototype.constructor = XPathParser;
    		XPathParser.superclass = Object.prototype;

    		function XPathParser() {
    			this.init();
    		}

    		XPathParser.prototype.init = function() {
    			this.reduceActions = [];

    			this.reduceActions[3] = function(rhs) {
    				return new OrOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[5] = function(rhs) {
    				return new AndOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[7] = function(rhs) {
    				return new EqualsOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[8] = function(rhs) {
    				return new NotEqualOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[10] = function(rhs) {
    				return new LessThanOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[11] = function(rhs) {
    				return new GreaterThanOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[12] = function(rhs) {
    				return new LessThanOrEqualOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[13] = function(rhs) {
    				return new GreaterThanOrEqualOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[15] = function(rhs) {
    				return new PlusOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[16] = function(rhs) {
    				return new MinusOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[18] = function(rhs) {
    				return new MultiplyOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[19] = function(rhs) {
    				return new DivOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[20] = function(rhs) {
    				return new ModOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[22] = function(rhs) {
    				return new UnaryMinusOperation(rhs[1]);
    			};
    			this.reduceActions[24] = function(rhs) {
    				return new BarOperation(rhs[0], rhs[2]);
    			};
    			this.reduceActions[25] = function(rhs) {
    				return new PathExpr(undefined, undefined, rhs[0]);
    			};
    			this.reduceActions[27] = function(rhs) {
    				rhs[0].locationPath = rhs[2];
    				return rhs[0];
    			};
    			this.reduceActions[28] = function(rhs) {
    				rhs[0].locationPath = rhs[2];
    				rhs[0].locationPath.steps.unshift(new Step(Step.DESCENDANTORSELF, new NodeTest(NodeTest.NODE, undefined), []));
    				return rhs[0];
    			};
    			this.reduceActions[29] = function(rhs) {
    				return new PathExpr(rhs[0], [], undefined);
    			};
    			this.reduceActions[30] = function(rhs) {
    				if (Utilities.instance_of(rhs[0], PathExpr)) {
    					if (rhs[0].filterPredicates == undefined) {
    						rhs[0].filterPredicates = [];
    					}
    					rhs[0].filterPredicates.push(rhs[1]);
    					return rhs[0];
    				} else {
    					return new PathExpr(rhs[0], [rhs[1]], undefined);
    				}
    			};
    			this.reduceActions[32] = function(rhs) {
    				return rhs[1];
    			};
    			this.reduceActions[33] = function(rhs) {
    				return new XString(rhs[0]);
    			};
    			this.reduceActions[34] = function(rhs) {
    				return new XNumber(rhs[0]);
    			};
    			this.reduceActions[36] = function(rhs) {
    				return new FunctionCall(rhs[0], []);
    			};
    			this.reduceActions[37] = function(rhs) {
    				return new FunctionCall(rhs[0], rhs[2]);
    			};
    			this.reduceActions[38] = function(rhs) {
    				return [ rhs[0] ];
    			};
    			this.reduceActions[39] = function(rhs) {
    				rhs[2].unshift(rhs[0]);
    				return rhs[2];
    			};
    			this.reduceActions[43] = function(rhs) {
    				return new LocationPath(true, []);
    			};
    			this.reduceActions[44] = function(rhs) {
    				rhs[1].absolute = true;
    				return rhs[1];
    			};
    			this.reduceActions[46] = function(rhs) {
    				return new LocationPath(false, [ rhs[0] ]);
    			};
    			this.reduceActions[47] = function(rhs) {
    				rhs[0].steps.push(rhs[2]);
    				return rhs[0];
    			};
    			this.reduceActions[49] = function(rhs) {
    				return new Step(rhs[0], rhs[1], []);
    			};
    			this.reduceActions[50] = function(rhs) {
    				return new Step(Step.CHILD, rhs[0], []);
    			};
    			this.reduceActions[51] = function(rhs) {
    				return new Step(rhs[0], rhs[1], rhs[2]);
    			};
    			this.reduceActions[52] = function(rhs) {
    				return new Step(Step.CHILD, rhs[0], rhs[1]);
    			};
    			this.reduceActions[54] = function(rhs) {
    				return [ rhs[0] ];
    			};
    			this.reduceActions[55] = function(rhs) {
    				rhs[1].unshift(rhs[0]);
    				return rhs[1];
    			};
    			this.reduceActions[56] = function(rhs) {
    				if (rhs[0] == "ancestor") {
    					return Step.ANCESTOR;
    				} else if (rhs[0] == "ancestor-or-self") {
    					return Step.ANCESTORORSELF;
    				} else if (rhs[0] == "attribute") {
    					return Step.ATTRIBUTE;
    				} else if (rhs[0] == "child") {
    					return Step.CHILD;
    				} else if (rhs[0] == "descendant") {
    					return Step.DESCENDANT;
    				} else if (rhs[0] == "descendant-or-self") {
    					return Step.DESCENDANTORSELF;
    				} else if (rhs[0] == "following") {
    					return Step.FOLLOWING;
    				} else if (rhs[0] == "following-sibling") {
    					return Step.FOLLOWINGSIBLING;
    				} else if (rhs[0] == "namespace") {
    					return Step.NAMESPACE;
    				} else if (rhs[0] == "parent") {
    					return Step.PARENT;
    				} else if (rhs[0] == "preceding") {
    					return Step.PRECEDING;
    				} else if (rhs[0] == "preceding-sibling") {
    					return Step.PRECEDINGSIBLING;
    				} else if (rhs[0] == "self") {
    					return Step.SELF;
    				}
    				return -1;
    			};
    			this.reduceActions[57] = function(rhs) {
    				return Step.ATTRIBUTE;
    			};
    			this.reduceActions[59] = function(rhs) {
    				if (rhs[0] == "comment") {
    					return new NodeTest(NodeTest.COMMENT, undefined);
    				} else if (rhs[0] == "text") {
    					return new NodeTest(NodeTest.TEXT, undefined);
    				} else if (rhs[0] == "processing-instruction") {
    					return new NodeTest(NodeTest.PI, undefined);
    				} else if (rhs[0] == "node") {
    					return new NodeTest(NodeTest.NODE, undefined);
    				}
    				return new NodeTest(-1, undefined);
    			};
    			this.reduceActions[60] = function(rhs) {
    				return new NodeTest(NodeTest.PI, rhs[2]);
    			};
    			this.reduceActions[61] = function(rhs) {
    				return rhs[1];
    			};
    			this.reduceActions[63] = function(rhs) {
    				rhs[1].absolute = true;
    				rhs[1].steps.unshift(new Step(Step.DESCENDANTORSELF, new NodeTest(NodeTest.NODE, undefined), []));
    				return rhs[1];
    			};
    			this.reduceActions[64] = function(rhs) {
    				rhs[0].steps.push(new Step(Step.DESCENDANTORSELF, new NodeTest(NodeTest.NODE, undefined), []));
    				rhs[0].steps.push(rhs[2]);
    				return rhs[0];
    			};
    			this.reduceActions[65] = function(rhs) {
    				return new Step(Step.SELF, new NodeTest(NodeTest.NODE, undefined), []);
    			};
    			this.reduceActions[66] = function(rhs) {
    				return new Step(Step.PARENT, new NodeTest(NodeTest.NODE, undefined), []);
    			};
    			this.reduceActions[67] = function(rhs) {
    				return new VariableReference(rhs[1]);
    			};
    			this.reduceActions[68] = function(rhs) {
    				return new NodeTest(NodeTest.NAMETESTANY, undefined);
    			};
    			this.reduceActions[69] = function(rhs) {
    				var prefix = rhs[0].substring(0, rhs[0].indexOf(":"));
    				return new NodeTest(NodeTest.NAMETESTPREFIXANY, prefix);
    			};
    			this.reduceActions[70] = function(rhs) {
    				return new NodeTest(NodeTest.NAMETESTQNAME, rhs[0]);
    			};
    		};

    		XPathParser.actionTable = [
    			" s s        sssssssss    s ss  s  ss",
    			"                 s                  ",
    			"r  rrrrrrrrr         rrrrrrr rr  r  ",
    			"                rrrrr               ",
    			" s s        sssssssss    s ss  s  ss",
    			"rs  rrrrrrrr s  sssssrrrrrr  rrs rs ",
    			" s s        sssssssss    s ss  s  ss",
    			"                            s       ",
    			"                            s       ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"  s                                 ",
    			"                            s       ",
    			" s           s  sssss          s  s ",
    			"r  rrrrrrrrr         rrrrrrr rr  r  ",
    			"a                                   ",
    			"r       s                    rr  r  ",
    			"r      sr                    rr  r  ",
    			"r   s  rr            s       rr  r  ",
    			"r   rssrr            rss     rr  r  ",
    			"r   rrrrr            rrrss   rr  r  ",
    			"r   rrrrrsss         rrrrr   rr  r  ",
    			"r   rrrrrrrr         rrrrr   rr  r  ",
    			"r   rrrrrrrr         rrrrrs  rr  r  ",
    			"r   rrrrrrrr         rrrrrr  rr  r  ",
    			"r   rrrrrrrr         rrrrrr  rr  r  ",
    			"r  srrrrrrrr         rrrrrrs rr sr  ",
    			"r  srrrrrrrr         rrrrrrs rr  r  ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"r   rrrrrrrr         rrrrrr  rr  r  ",
    			"r   rrrrrrrr         rrrrrr  rr  r  ",
    			"r  rrrrrrrrr         rrrrrrr rr  r  ",
    			"r  rrrrrrrrr         rrrrrrr rr  r  ",
    			"                sssss               ",
    			"r  rrrrrrrrr         rrrrrrr rr sr  ",
    			"r  rrrrrrrrr         rrrrrrr rr  r  ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"                             s      ",
    			"r  srrrrrrrr         rrrrrrs rr  r  ",
    			"r   rrrrrrrr         rrrrr   rr  r  ",
    			"              s                     ",
    			"                             s      ",
    			"                rrrrr               ",
    			" s s        sssssssss    s sss s  ss",
    			"r  srrrrrrrr         rrrrrrs rr  r  ",
    			" s s        sssssssss    s ss  s  ss",
    			" s s        sssssssss    s ss  s  ss",
    			" s s        sssssssss    s ss  s  ss",
    			" s s        sssssssss    s ss  s  ss",
    			" s s        sssssssss    s ss  s  ss",
    			" s s        sssssssss    s ss  s  ss",
    			" s s        sssssssss    s ss  s  ss",
    			" s s        sssssssss    s ss  s  ss",
    			" s s        sssssssss    s ss  s  ss",
    			" s s        sssssssss    s ss  s  ss",
    			" s s        sssssssss    s ss  s  ss",
    			" s s        sssssssss    s ss  s  ss",
    			" s s        sssssssss    s ss  s  ss",
    			" s s        sssssssss      ss  s  ss",
    			" s s        sssssssss    s ss  s  ss",
    			" s           s  sssss          s  s ",
    			" s           s  sssss          s  s ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			" s           s  sssss          s  s ",
    			" s           s  sssss          s  s ",
    			"r  rrrrrrrrr         rrrrrrr rr sr  ",
    			"r  rrrrrrrrr         rrrrrrr rr sr  ",
    			"r  rrrrrrrrr         rrrrrrr rr  r  ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"                             s      ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"                             rr     ",
    			"                             s      ",
    			"                             rs     ",
    			"r      sr                    rr  r  ",
    			"r   s  rr            s       rr  r  ",
    			"r   rssrr            rss     rr  r  ",
    			"r   rssrr            rss     rr  r  ",
    			"r   rrrrr            rrrss   rr  r  ",
    			"r   rrrrr            rrrss   rr  r  ",
    			"r   rrrrr            rrrss   rr  r  ",
    			"r   rrrrr            rrrss   rr  r  ",
    			"r   rrrrrsss         rrrrr   rr  r  ",
    			"r   rrrrrsss         rrrrr   rr  r  ",
    			"r   rrrrrrrr         rrrrr   rr  r  ",
    			"r   rrrrrrrr         rrrrr   rr  r  ",
    			"r   rrrrrrrr         rrrrr   rr  r  ",
    			"r   rrrrrrrr         rrrrrr  rr  r  ",
    			"                                 r  ",
    			"                                 s  ",
    			"r  srrrrrrrr         rrrrrrs rr  r  ",
    			"r  srrrrrrrr         rrrrrrs rr  r  ",
    			"r  rrrrrrrrr         rrrrrrr rr  r  ",
    			"r  rrrrrrrrr         rrrrrrr rr  r  ",
    			"r  rrrrrrrrr         rrrrrrr rr  r  ",
    			"r  rrrrrrrrr         rrrrrrr rr  r  ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			" s s        sssssssss    s ss  s  ss",
    			"r  rrrrrrrrr         rrrrrrr rr rr  ",
    			"                             r      "
    		];

    		XPathParser.actionTableNumber = [
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			"                 J                  ",
    			"a  aaaaaaaaa         aaaaaaa aa  a  ",
    			"                YYYYY               ",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			"K1  KKKKKKKK .  +*)('KKKKKK  KK# K\" ",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			"                            N       ",
    			"                            O       ",
    			"e  eeeeeeeee         eeeeeee ee ee  ",
    			"f  fffffffff         fffffff ff ff  ",
    			"d  ddddddddd         ddddddd dd dd  ",
    			"B  BBBBBBBBB         BBBBBBB BB BB  ",
    			"A  AAAAAAAAA         AAAAAAA AA AA  ",
    			"  P                                 ",
    			"                            Q       ",
    			" 1           .  +*)('          #  \" ",
    			"b  bbbbbbbbb         bbbbbbb bb  b  ",
    			"                                    ",
    			"!       S                    !!  !  ",
    			"\"      T\"                    \"\"  \"  ",
    			"$   V  $$            U       $$  $  ",
    			"&   &ZY&&            &XW     &&  &  ",
    			")   )))))            )))\\[   ))  )  ",
    			".   ....._^]         .....   ..  .  ",
    			"1   11111111         11111   11  1  ",
    			"5   55555555         55555`  55  5  ",
    			"7   77777777         777777  77  7  ",
    			"9   99999999         999999  99  9  ",
    			":  c::::::::         ::::::b :: a:  ",
    			"I  fIIIIIIII         IIIIIIe II  I  ",
    			"=  =========         ======= == ==  ",
    			"?  ?????????         ??????? ?? ??  ",
    			"C  CCCCCCCCC         CCCCCCC CC CC  ",
    			"J   JJJJJJJJ         JJJJJJ  JJ  J  ",
    			"M   MMMMMMMM         MMMMMM  MM  M  ",
    			"N  NNNNNNNNN         NNNNNNN NN  N  ",
    			"P  PPPPPPPPP         PPPPPPP PP  P  ",
    			"                +*)('               ",
    			"R  RRRRRRRRR         RRRRRRR RR aR  ",
    			"U  UUUUUUUUU         UUUUUUU UU  U  ",
    			"Z  ZZZZZZZZZ         ZZZZZZZ ZZ ZZ  ",
    			"c  ccccccccc         ccccccc cc cc  ",
    			"                             j      ",
    			"L  fLLLLLLLL         LLLLLLe LL  L  ",
    			"6   66666666         66666   66  6  ",
    			"              k                     ",
    			"                             l      ",
    			"                XXXXX               ",
    			" 1 0        /.-,+*)('    & %$m #  \"!",
    			"_  f________         ______e __  _  ",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1 0        /.-,+*)('      %$  #  \"!",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			" 1           .  +*)('          #  \" ",
    			" 1           .  +*)('          #  \" ",
    			">  >>>>>>>>>         >>>>>>> >> >>  ",
    			" 1           .  +*)('          #  \" ",
    			" 1           .  +*)('          #  \" ",
    			"Q  QQQQQQQQQ         QQQQQQQ QQ aQ  ",
    			"V  VVVVVVVVV         VVVVVVV VV aV  ",
    			"T  TTTTTTTTT         TTTTTTT TT  T  ",
    			"@  @@@@@@@@@         @@@@@@@ @@ @@  ",
    			"                             \x87      ",
    			"[  [[[[[[[[[         [[[[[[[ [[ [[  ",
    			"D  DDDDDDDDD         DDDDDDD DD DD  ",
    			"                             HH     ",
    			"                             \x88      ",
    			"                             F\x89     ",
    			"#      T#                    ##  #  ",
    			"%   V  %%            U       %%  %  ",
    			"'   'ZY''            'XW     ''  '  ",
    			"(   (ZY((            (XW     ((  (  ",
    			"+   +++++            +++\\[   ++  +  ",
    			"*   *****            ***\\[   **  *  ",
    			"-   -----            ---\\[   --  -  ",
    			",   ,,,,,            ,,,\\[   ,,  ,  ",
    			"0   00000_^]         00000   00  0  ",
    			"/   /////_^]         /////   //  /  ",
    			"2   22222222         22222   22  2  ",
    			"3   33333333         33333   33  3  ",
    			"4   44444444         44444   44  4  ",
    			"8   88888888         888888  88  8  ",
    			"                                 ^  ",
    			"                                 \x8a  ",
    			";  f;;;;;;;;         ;;;;;;e ;;  ;  ",
    			"<  f<<<<<<<<         <<<<<<e <<  <  ",
    			"O  OOOOOOOOO         OOOOOOO OO  O  ",
    			"`  `````````         ``````` ``  `  ",
    			"S  SSSSSSSSS         SSSSSSS SS  S  ",
    			"W  WWWWWWWWW         WWWWWWW WW  W  ",
    			"\\  \\\\\\\\\\\\\\\\\\         \\\\\\\\\\\\\\ \\\\ \\\\  ",
    			"E  EEEEEEEEE         EEEEEEE EE EE  ",
    			" 1 0        /.-,+*)('    & %$  #  \"!",
    			"]  ]]]]]]]]]         ]]]]]]] ]] ]]  ",
    			"                             G      "
    		];

    		XPathParser.gotoTable = [
    			"3456789:;<=>?@ AB  CDEFGH IJ ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"L456789:;<=>?@ AB  CDEFGH IJ ",
    			"            M        EFGH IJ ",
    			"       N;<=>?@ AB  CDEFGH IJ ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"            S        EFGH IJ ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"              e              ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                        h  J ",
    			"              i          j   ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"o456789:;<=>?@ ABpqCDEFGH IJ ",
    			"                             ",
    			"  r6789:;<=>?@ AB  CDEFGH IJ ",
    			"   s789:;<=>?@ AB  CDEFGH IJ ",
    			"    t89:;<=>?@ AB  CDEFGH IJ ",
    			"    u89:;<=>?@ AB  CDEFGH IJ ",
    			"     v9:;<=>?@ AB  CDEFGH IJ ",
    			"     w9:;<=>?@ AB  CDEFGH IJ ",
    			"     x9:;<=>?@ AB  CDEFGH IJ ",
    			"     y9:;<=>?@ AB  CDEFGH IJ ",
    			"      z:;<=>?@ AB  CDEFGH IJ ",
    			"      {:;<=>?@ AB  CDEFGH IJ ",
    			"       |;<=>?@ AB  CDEFGH IJ ",
    			"       };<=>?@ AB  CDEFGH IJ ",
    			"       ~;<=>?@ AB  CDEFGH IJ ",
    			"         \x7f=>?@ AB  CDEFGH IJ ",
    			"\x80456789:;<=>?@ AB  CDEFGH IJ\x81",
    			"            \x82        EFGH IJ ",
    			"            \x83        EFGH IJ ",
    			"                             ",
    			"                     \x84 GH IJ ",
    			"                     \x85 GH IJ ",
    			"              i          \x86   ",
    			"              i          \x87   ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"                             ",
    			"o456789:;<=>?@ AB\x8cqCDEFGH IJ ",
    			"                             ",
    			"                             "
    		];

    		XPathParser.productions = [
    			[1, 1, 2],
    			[2, 1, 3],
    			[3, 1, 4],
    			[3, 3, 3, -9, 4],
    			[4, 1, 5],
    			[4, 3, 4, -8, 5],
    			[5, 1, 6],
    			[5, 3, 5, -22, 6],
    			[5, 3, 5, -5, 6],
    			[6, 1, 7],
    			[6, 3, 6, -23, 7],
    			[6, 3, 6, -24, 7],
    			[6, 3, 6, -6, 7],
    			[6, 3, 6, -7, 7],
    			[7, 1, 8],
    			[7, 3, 7, -25, 8],
    			[7, 3, 7, -26, 8],
    			[8, 1, 9],
    			[8, 3, 8, -12, 9],
    			[8, 3, 8, -11, 9],
    			[8, 3, 8, -10, 9],
    			[9, 1, 10],
    			[9, 2, -26, 9],
    			[10, 1, 11],
    			[10, 3, 10, -27, 11],
    			[11, 1, 12],
    			[11, 1, 13],
    			[11, 3, 13, -28, 14],
    			[11, 3, 13, -4, 14],
    			[13, 1, 15],
    			[13, 2, 13, 16],
    			[15, 1, 17],
    			[15, 3, -29, 2, -30],
    			[15, 1, -15],
    			[15, 1, -16],
    			[15, 1, 18],
    			[18, 3, -13, -29, -30],
    			[18, 4, -13, -29, 19, -30],
    			[19, 1, 20],
    			[19, 3, 20, -31, 19],
    			[20, 1, 2],
    			[12, 1, 14],
    			[12, 1, 21],
    			[21, 1, -28],
    			[21, 2, -28, 14],
    			[21, 1, 22],
    			[14, 1, 23],
    			[14, 3, 14, -28, 23],
    			[14, 1, 24],
    			[23, 2, 25, 26],
    			[23, 1, 26],
    			[23, 3, 25, 26, 27],
    			[23, 2, 26, 27],
    			[23, 1, 28],
    			[27, 1, 16],
    			[27, 2, 16, 27],
    			[25, 2, -14, -3],
    			[25, 1, -32],
    			[26, 1, 29],
    			[26, 3, -20, -29, -30],
    			[26, 4, -21, -29, -15, -30],
    			[16, 3, -33, 30, -34],
    			[30, 1, 2],
    			[22, 2, -4, 14],
    			[24, 3, 14, -4, 23],
    			[28, 1, -35],
    			[28, 1, -2],
    			[17, 2, -36, -18],
    			[29, 1, -17],
    			[29, 1, -19],
    			[29, 1, -18]
    		];

    		XPathParser.DOUBLEDOT = 2;
    		XPathParser.DOUBLECOLON = 3;
    		XPathParser.DOUBLESLASH = 4;
    		XPathParser.NOTEQUAL = 5;
    		XPathParser.LESSTHANOREQUAL = 6;
    		XPathParser.GREATERTHANOREQUAL = 7;
    		XPathParser.AND = 8;
    		XPathParser.OR = 9;
    		XPathParser.MOD = 10;
    		XPathParser.DIV = 11;
    		XPathParser.MULTIPLYOPERATOR = 12;
    		XPathParser.FUNCTIONNAME = 13;
    		XPathParser.AXISNAME = 14;
    		XPathParser.LITERAL = 15;
    		XPathParser.NUMBER = 16;
    		XPathParser.ASTERISKNAMETEST = 17;
    		XPathParser.QNAME = 18;
    		XPathParser.NCNAMECOLONASTERISK = 19;
    		XPathParser.NODETYPE = 20;
    		XPathParser.PROCESSINGINSTRUCTIONWITHLITERAL = 21;
    		XPathParser.EQUALS = 22;
    		XPathParser.LESSTHAN = 23;
    		XPathParser.GREATERTHAN = 24;
    		XPathParser.PLUS = 25;
    		XPathParser.MINUS = 26;
    		XPathParser.BAR = 27;
    		XPathParser.SLASH = 28;
    		XPathParser.LEFTPARENTHESIS = 29;
    		XPathParser.RIGHTPARENTHESIS = 30;
    		XPathParser.COMMA = 31;
    		XPathParser.AT = 32;
    		XPathParser.LEFTBRACKET = 33;
    		XPathParser.RIGHTBRACKET = 34;
    		XPathParser.DOT = 35;
    		XPathParser.DOLLAR = 36;

    		XPathParser.prototype.tokenize = function(s1) {
    			var types = [];
    			var values = [];
    			var s = s1 + '\0';

    			var pos = 0;
    			var c = s.charAt(pos++);
    			while (1) {
    				while (c == ' ' || c == '\t' || c == '\r' || c == '\n') {
    					c = s.charAt(pos++);
    				}
    				if (c == '\0' || pos >= s.length) {
    					break;
    				}

    				if (c == '(') {
    					types.push(XPathParser.LEFTPARENTHESIS);
    					values.push(c);
    					c = s.charAt(pos++);
    					continue;
    				}
    				if (c == ')') {
    					types.push(XPathParser.RIGHTPARENTHESIS);
    					values.push(c);
    					c = s.charAt(pos++);
    					continue;
    				}
    				if (c == '[') {
    					types.push(XPathParser.LEFTBRACKET);
    					values.push(c);
    					c = s.charAt(pos++);
    					continue;
    				}
    				if (c == ']') {
    					types.push(XPathParser.RIGHTBRACKET);
    					values.push(c);
    					c = s.charAt(pos++);
    					continue;
    				}
    				if (c == '@') {
    					types.push(XPathParser.AT);
    					values.push(c);
    					c = s.charAt(pos++);
    					continue;
    				}
    				if (c == ',') {
    					types.push(XPathParser.COMMA);
    					values.push(c);
    					c = s.charAt(pos++);
    					continue;
    				}
    				if (c == '|') {
    					types.push(XPathParser.BAR);
    					values.push(c);
    					c = s.charAt(pos++);
    					continue;
    				}
    				if (c == '+') {
    					types.push(XPathParser.PLUS);
    					values.push(c);
    					c = s.charAt(pos++);
    					continue;
    				}
    				if (c == '-') {
    					types.push(XPathParser.MINUS);
    					values.push(c);
    					c = s.charAt(pos++);
    					continue;
    				}
    				if (c == '=') {
    					types.push(XPathParser.EQUALS);
    					values.push(c);
    					c = s.charAt(pos++);
    					continue;
    				}
    				if (c == '$') {
    					types.push(XPathParser.DOLLAR);
    					values.push(c);
    					c = s.charAt(pos++);
    					continue;
    				}

    				if (c == '.') {
    					c = s.charAt(pos++);
    					if (c == '.') {
    						types.push(XPathParser.DOUBLEDOT);
    						values.push("..");
    						c = s.charAt(pos++);
    						continue;
    					}
    					if (c >= '0' && c <= '9') {
    						var number = "." + c;
    						c = s.charAt(pos++);
    						while (c >= '0' && c <= '9') {
    							number += c;
    							c = s.charAt(pos++);
    						}
    						types.push(XPathParser.NUMBER);
    						values.push(number);
    						continue;
    					}
    					types.push(XPathParser.DOT);
    					values.push('.');
    					continue;
    				}

    				if (c == '\'' || c == '"') {
    					var delimiter = c;
    					var literal = "";
    					while (pos < s.length && (c = s.charAt(pos)) !== delimiter) {
    						literal += c;
    		                pos += 1;
    					}
    		            if (c !== delimiter) {
    		                throw XPathException.fromMessage("Unterminated string literal: " + delimiter + literal);
    		            }
    		            pos += 1;
    					types.push(XPathParser.LITERAL);
    					values.push(literal);
    					c = s.charAt(pos++);
    					continue;
    				}

    				if (c >= '0' && c <= '9') {
    					var number = c;
    					c = s.charAt(pos++);
    					while (c >= '0' && c <= '9') {
    						number += c;
    						c = s.charAt(pos++);
    					}
    					if (c == '.') {
    						if (s.charAt(pos) >= '0' && s.charAt(pos) <= '9') {
    							number += c;
    							number += s.charAt(pos++);
    							c = s.charAt(pos++);
    							while (c >= '0' && c <= '9') {
    								number += c;
    								c = s.charAt(pos++);
    							}
    						}
    					}
    					types.push(XPathParser.NUMBER);
    					values.push(number);
    					continue;
    				}

    				if (c == '*') {
    					if (types.length > 0) {
    						var last = types[types.length - 1];
    						if (last != XPathParser.AT
    								&& last != XPathParser.DOUBLECOLON
    								&& last != XPathParser.LEFTPARENTHESIS
    								&& last != XPathParser.LEFTBRACKET
    								&& last != XPathParser.AND
    								&& last != XPathParser.OR
    								&& last != XPathParser.MOD
    								&& last != XPathParser.DIV
    								&& last != XPathParser.MULTIPLYOPERATOR
    								&& last != XPathParser.SLASH
    								&& last != XPathParser.DOUBLESLASH
    								&& last != XPathParser.BAR
    								&& last != XPathParser.PLUS
    								&& last != XPathParser.MINUS
    								&& last != XPathParser.EQUALS
    								&& last != XPathParser.NOTEQUAL
    								&& last != XPathParser.LESSTHAN
    								&& last != XPathParser.LESSTHANOREQUAL
    								&& last != XPathParser.GREATERTHAN
    								&& last != XPathParser.GREATERTHANOREQUAL) {
    							types.push(XPathParser.MULTIPLYOPERATOR);
    							values.push(c);
    							c = s.charAt(pos++);
    							continue;
    						}
    					}
    					types.push(XPathParser.ASTERISKNAMETEST);
    					values.push(c);
    					c = s.charAt(pos++);
    					continue;
    				}

    				if (c == ':') {
    					if (s.charAt(pos) == ':') {
    						types.push(XPathParser.DOUBLECOLON);
    						values.push("::");
    						pos++;
    						c = s.charAt(pos++);
    						continue;
    					}
    				}

    				if (c == '/') {
    					c = s.charAt(pos++);
    					if (c == '/') {
    						types.push(XPathParser.DOUBLESLASH);
    						values.push("//");
    						c = s.charAt(pos++);
    						continue;
    					}
    					types.push(XPathParser.SLASH);
    					values.push('/');
    					continue;
    				}

    				if (c == '!') {
    					if (s.charAt(pos) == '=') {
    						types.push(XPathParser.NOTEQUAL);
    						values.push("!=");
    						pos++;
    						c = s.charAt(pos++);
    						continue;
    					}
    				}

    				if (c == '<') {
    					if (s.charAt(pos) == '=') {
    						types.push(XPathParser.LESSTHANOREQUAL);
    						values.push("<=");
    						pos++;
    						c = s.charAt(pos++);
    						continue;
    					}
    					types.push(XPathParser.LESSTHAN);
    					values.push('<');
    					c = s.charAt(pos++);
    					continue;
    				}

    				if (c == '>') {
    					if (s.charAt(pos) == '=') {
    						types.push(XPathParser.GREATERTHANOREQUAL);
    						values.push(">=");
    						pos++;
    						c = s.charAt(pos++);
    						continue;
    					}
    					types.push(XPathParser.GREATERTHAN);
    					values.push('>');
    					c = s.charAt(pos++);
    					continue;
    				}

    				if (c == '_' || Utilities.isLetter(c.charCodeAt(0))) {
    					var name = c;
    					c = s.charAt(pos++);
    					while (Utilities.isNCNameChar(c.charCodeAt(0))) {
    						name += c;
    						c = s.charAt(pos++);
    					}
    					if (types.length > 0) {
    						var last = types[types.length - 1];
    						if (last != XPathParser.AT
    								&& last != XPathParser.DOUBLECOLON
    								&& last != XPathParser.LEFTPARENTHESIS
    								&& last != XPathParser.LEFTBRACKET
    								&& last != XPathParser.AND
    								&& last != XPathParser.OR
    								&& last != XPathParser.MOD
    								&& last != XPathParser.DIV
    								&& last != XPathParser.MULTIPLYOPERATOR
    								&& last != XPathParser.SLASH
    								&& last != XPathParser.DOUBLESLASH
    								&& last != XPathParser.BAR
    								&& last != XPathParser.PLUS
    								&& last != XPathParser.MINUS
    								&& last != XPathParser.EQUALS
    								&& last != XPathParser.NOTEQUAL
    								&& last != XPathParser.LESSTHAN
    								&& last != XPathParser.LESSTHANOREQUAL
    								&& last != XPathParser.GREATERTHAN
    								&& last != XPathParser.GREATERTHANOREQUAL) {
    							if (name == "and") {
    								types.push(XPathParser.AND);
    								values.push(name);
    								continue;
    							}
    							if (name == "or") {
    								types.push(XPathParser.OR);
    								values.push(name);
    								continue;
    							}
    							if (name == "mod") {
    								types.push(XPathParser.MOD);
    								values.push(name);
    								continue;
    							}
    							if (name == "div") {
    								types.push(XPathParser.DIV);
    								values.push(name);
    								continue;
    							}
    						}
    					}
    					if (c == ':') {
    						if (s.charAt(pos) == '*') {
    							types.push(XPathParser.NCNAMECOLONASTERISK);
    							values.push(name + ":*");
    							pos++;
    							c = s.charAt(pos++);
    							continue;
    						}
    						if (s.charAt(pos) == '_' || Utilities.isLetter(s.charCodeAt(pos))) {
    							name += ':';
    							c = s.charAt(pos++);
    							while (Utilities.isNCNameChar(c.charCodeAt(0))) {
    								name += c;
    								c = s.charAt(pos++);
    							}
    							if (c == '(') {
    								types.push(XPathParser.FUNCTIONNAME);
    								values.push(name);
    								continue;
    							}
    							types.push(XPathParser.QNAME);
    							values.push(name);
    							continue;
    						}
    						if (s.charAt(pos) == ':') {
    							types.push(XPathParser.AXISNAME);
    							values.push(name);
    							continue;
    						}
    					}
    					if (c == '(') {
    						if (name == "comment" || name == "text" || name == "node") {
    							types.push(XPathParser.NODETYPE);
    							values.push(name);
    							continue;
    						}
    						if (name == "processing-instruction") {
    							if (s.charAt(pos) == ')') {
    								types.push(XPathParser.NODETYPE);
    							} else {
    								types.push(XPathParser.PROCESSINGINSTRUCTIONWITHLITERAL);
    							}
    							values.push(name);
    							continue;
    						}
    						types.push(XPathParser.FUNCTIONNAME);
    						values.push(name);
    						continue;
    					}
    					types.push(XPathParser.QNAME);
    					values.push(name);
    					continue;
    				}

    				throw new Error("Unexpected character " + c);
    			}
    			types.push(1);
    			values.push("[EOF]");
    			return [types, values];
    		};

    		XPathParser.SHIFT = 's';
    		XPathParser.REDUCE = 'r';
    		XPathParser.ACCEPT = 'a';

    		XPathParser.prototype.parse = function(s) {
    			var types;
    			var values;
    			var res = this.tokenize(s);
    			if (res == undefined) {
    				return undefined;
    			}
    			types = res[0];
    			values = res[1];
    			var tokenPos = 0;
    			var state = [];
    			var tokenType = [];
    			var tokenValue = [];
    			var s;
    			var a;
    			var t;

    			state.push(0);
    			tokenType.push(1);
    			tokenValue.push("_S");

    			a = types[tokenPos];
    			t = values[tokenPos++];
    			while (1) {
    				s = state[state.length - 1];
    				switch (XPathParser.actionTable[s].charAt(a - 1)) {
    					case XPathParser.SHIFT:
    						tokenType.push(-a);
    						tokenValue.push(t);
    						state.push(XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32);
    						a = types[tokenPos];
    						t = values[tokenPos++];
    						break;
    					case XPathParser.REDUCE:
    						var num = XPathParser.productions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32][1];
    						var rhs = [];
    						for (var i = 0; i < num; i++) {
    							tokenType.pop();
    							rhs.unshift(tokenValue.pop());
    							state.pop();
    						}
    						var s_ = state[state.length - 1];
    						tokenType.push(XPathParser.productions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32][0]);
    						if (this.reduceActions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32] == undefined) {
    							tokenValue.push(rhs[0]);
    						} else {
    							tokenValue.push(this.reduceActions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32](rhs));
    						}
    						state.push(XPathParser.gotoTable[s_].charCodeAt(XPathParser.productions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32][0] - 2) - 33);
    						break;
    					case XPathParser.ACCEPT:
    						return new XPath(tokenValue.pop());
    					default:
    						throw new Error("XPath parse error");
    				}
    			}
    		};

    		// XPath /////////////////////////////////////////////////////////////////////

    		XPath.prototype = new Object();
    		XPath.prototype.constructor = XPath;
    		XPath.superclass = Object.prototype;

    		function XPath(e) {
    			this.expression = e;
    		}

    		XPath.prototype.toString = function() {
    			return this.expression.toString();
    		};

    		XPath.prototype.evaluate = function(c) {
    			c.contextNode = c.expressionContextNode;
    			c.contextSize = 1;
    			c.contextPosition = 1;
    			c.caseInsensitive = false;
    			if (c.contextNode != null) {
    				var doc = c.contextNode;
    				if (doc.nodeType != 9 /*Node.DOCUMENT_NODE*/) {
    					doc = doc.ownerDocument;
    				}
    				try {
    					c.caseInsensitive = doc.implementation.hasFeature("HTML", "2.0");
    				} catch (e) {
    					c.caseInsensitive = true;
    				}
    			}
    			return this.expression.evaluate(c);
    		};

    		XPath.XML_NAMESPACE_URI = "http://www.w3.org/XML/1998/namespace";
    		XPath.XMLNS_NAMESPACE_URI = "http://www.w3.org/2000/xmlns/";

    		// Expression ////////////////////////////////////////////////////////////////

    		Expression.prototype = new Object();
    		Expression.prototype.constructor = Expression;
    		Expression.superclass = Object.prototype;

    		function Expression() {
    		}

    		Expression.prototype.init = function() {
    		};

    		Expression.prototype.toString = function() {
    			return "<Expression>";
    		};

    		Expression.prototype.evaluate = function(c) {
    			throw new Error("Could not evaluate expression.");
    		};

    		// UnaryOperation ////////////////////////////////////////////////////////////

    		UnaryOperation.prototype = new Expression();
    		UnaryOperation.prototype.constructor = UnaryOperation;
    		UnaryOperation.superclass = Expression.prototype;

    		function UnaryOperation(rhs) {
    			if (arguments.length > 0) {
    				this.init(rhs);
    			}
    		}

    		UnaryOperation.prototype.init = function(rhs) {
    			this.rhs = rhs;
    		};

    		// UnaryMinusOperation ///////////////////////////////////////////////////////

    		UnaryMinusOperation.prototype = new UnaryOperation();
    		UnaryMinusOperation.prototype.constructor = UnaryMinusOperation;
    		UnaryMinusOperation.superclass = UnaryOperation.prototype;

    		function UnaryMinusOperation(rhs) {
    			if (arguments.length > 0) {
    				this.init(rhs);
    			}
    		}

    		UnaryMinusOperation.prototype.init = function(rhs) {
    			UnaryMinusOperation.superclass.init.call(this, rhs);
    		};

    		UnaryMinusOperation.prototype.evaluate = function(c) {
    			return this.rhs.evaluate(c).number().negate();
    		};

    		UnaryMinusOperation.prototype.toString = function() {
    			return "-" + this.rhs.toString();
    		};

    		// BinaryOperation ///////////////////////////////////////////////////////////

    		BinaryOperation.prototype = new Expression();
    		BinaryOperation.prototype.constructor = BinaryOperation;
    		BinaryOperation.superclass = Expression.prototype;

    		function BinaryOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		BinaryOperation.prototype.init = function(lhs, rhs) {
    			this.lhs = lhs;
    			this.rhs = rhs;
    		};

    		// OrOperation ///////////////////////////////////////////////////////////////

    		OrOperation.prototype = new BinaryOperation();
    		OrOperation.prototype.constructor = OrOperation;
    		OrOperation.superclass = BinaryOperation.prototype;

    		function OrOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		OrOperation.prototype.init = function(lhs, rhs) {
    			OrOperation.superclass.init.call(this, lhs, rhs);
    		};

    		OrOperation.prototype.toString = function() {
    			return "(" + this.lhs.toString() + " or " + this.rhs.toString() + ")";
    		};

    		OrOperation.prototype.evaluate = function(c) {
    			var b = this.lhs.evaluate(c).bool();
    			if (b.booleanValue()) {
    				return b;
    			}
    			return this.rhs.evaluate(c).bool();
    		};

    		// AndOperation //////////////////////////////////////////////////////////////

    		AndOperation.prototype = new BinaryOperation();
    		AndOperation.prototype.constructor = AndOperation;
    		AndOperation.superclass = BinaryOperation.prototype;

    		function AndOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		AndOperation.prototype.init = function(lhs, rhs) {
    			AndOperation.superclass.init.call(this, lhs, rhs);
    		};

    		AndOperation.prototype.toString = function() {
    			return "(" + this.lhs.toString() + " and " + this.rhs.toString() + ")";
    		};

    		AndOperation.prototype.evaluate = function(c) {
    			var b = this.lhs.evaluate(c).bool();
    			if (!b.booleanValue()) {
    				return b;
    			}
    			return this.rhs.evaluate(c).bool();
    		};

    		// EqualsOperation ///////////////////////////////////////////////////////////

    		EqualsOperation.prototype = new BinaryOperation();
    		EqualsOperation.prototype.constructor = EqualsOperation;
    		EqualsOperation.superclass = BinaryOperation.prototype;

    		function EqualsOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		EqualsOperation.prototype.init = function(lhs, rhs) {
    			EqualsOperation.superclass.init.call(this, lhs, rhs);
    		};

    		EqualsOperation.prototype.toString = function() {
    			return "(" + this.lhs.toString() + " = " + this.rhs.toString() + ")";
    		};

    		EqualsOperation.prototype.evaluate = function(c) {
    			return this.lhs.evaluate(c).equals(this.rhs.evaluate(c));
    		};

    		// NotEqualOperation /////////////////////////////////////////////////////////

    		NotEqualOperation.prototype = new BinaryOperation();
    		NotEqualOperation.prototype.constructor = NotEqualOperation;
    		NotEqualOperation.superclass = BinaryOperation.prototype;

    		function NotEqualOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		NotEqualOperation.prototype.init = function(lhs, rhs) {
    			NotEqualOperation.superclass.init.call(this, lhs, rhs);
    		};

    		NotEqualOperation.prototype.toString = function() {
    			return "(" + this.lhs.toString() + " != " + this.rhs.toString() + ")";
    		};

    		NotEqualOperation.prototype.evaluate = function(c) {
    			return this.lhs.evaluate(c).notequal(this.rhs.evaluate(c));
    		};

    		// LessThanOperation /////////////////////////////////////////////////////////

    		LessThanOperation.prototype = new BinaryOperation();
    		LessThanOperation.prototype.constructor = LessThanOperation;
    		LessThanOperation.superclass = BinaryOperation.prototype;

    		function LessThanOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		LessThanOperation.prototype.init = function(lhs, rhs) {
    			LessThanOperation.superclass.init.call(this, lhs, rhs);
    		};

    		LessThanOperation.prototype.evaluate = function(c) {
    			return this.lhs.evaluate(c).lessthan(this.rhs.evaluate(c));
    		};

    		LessThanOperation.prototype.toString = function() {
    			return "(" + this.lhs.toString() + " < " + this.rhs.toString() + ")";
    		};

    		// GreaterThanOperation //////////////////////////////////////////////////////

    		GreaterThanOperation.prototype = new BinaryOperation();
    		GreaterThanOperation.prototype.constructor = GreaterThanOperation;
    		GreaterThanOperation.superclass = BinaryOperation.prototype;

    		function GreaterThanOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		GreaterThanOperation.prototype.init = function(lhs, rhs) {
    			GreaterThanOperation.superclass.init.call(this, lhs, rhs);
    		};

    		GreaterThanOperation.prototype.evaluate = function(c) {
    			return this.lhs.evaluate(c).greaterthan(this.rhs.evaluate(c));
    		};

    		GreaterThanOperation.prototype.toString = function() {
    			return "(" + this.lhs.toString() + " > " + this.rhs.toString() + ")";
    		};

    		// LessThanOrEqualOperation //////////////////////////////////////////////////

    		LessThanOrEqualOperation.prototype = new BinaryOperation();
    		LessThanOrEqualOperation.prototype.constructor = LessThanOrEqualOperation;
    		LessThanOrEqualOperation.superclass = BinaryOperation.prototype;

    		function LessThanOrEqualOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		LessThanOrEqualOperation.prototype.init = function(lhs, rhs) {
    			LessThanOrEqualOperation.superclass.init.call(this, lhs, rhs);
    		};

    		LessThanOrEqualOperation.prototype.evaluate = function(c) {
    			return this.lhs.evaluate(c).lessthanorequal(this.rhs.evaluate(c));
    		};

    		LessThanOrEqualOperation.prototype.toString = function() {
    			return "(" + this.lhs.toString() + " <= " + this.rhs.toString() + ")";
    		};

    		// GreaterThanOrEqualOperation ///////////////////////////////////////////////

    		GreaterThanOrEqualOperation.prototype = new BinaryOperation();
    		GreaterThanOrEqualOperation.prototype.constructor = GreaterThanOrEqualOperation;
    		GreaterThanOrEqualOperation.superclass = BinaryOperation.prototype;

    		function GreaterThanOrEqualOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		GreaterThanOrEqualOperation.prototype.init = function(lhs, rhs) {
    			GreaterThanOrEqualOperation.superclass.init.call(this, lhs, rhs);
    		};

    		GreaterThanOrEqualOperation.prototype.evaluate = function(c) {
    			return this.lhs.evaluate(c).greaterthanorequal(this.rhs.evaluate(c));
    		};

    		GreaterThanOrEqualOperation.prototype.toString = function() {
    			return "(" + this.lhs.toString() + " >= " + this.rhs.toString() + ")";
    		};

    		// PlusOperation /////////////////////////////////////////////////////////////

    		PlusOperation.prototype = new BinaryOperation();
    		PlusOperation.prototype.constructor = PlusOperation;
    		PlusOperation.superclass = BinaryOperation.prototype;

    		function PlusOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		PlusOperation.prototype.init = function(lhs, rhs) {
    			PlusOperation.superclass.init.call(this, lhs, rhs);
    		};

    		PlusOperation.prototype.evaluate = function(c) {
    			return this.lhs.evaluate(c).number().plus(this.rhs.evaluate(c).number());
    		};

    		PlusOperation.prototype.toString = function() {
    			return "(" + this.lhs.toString() + " + " + this.rhs.toString() + ")";
    		};

    		// MinusOperation ////////////////////////////////////////////////////////////

    		MinusOperation.prototype = new BinaryOperation();
    		MinusOperation.prototype.constructor = MinusOperation;
    		MinusOperation.superclass = BinaryOperation.prototype;

    		function MinusOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		MinusOperation.prototype.init = function(lhs, rhs) {
    			MinusOperation.superclass.init.call(this, lhs, rhs);
    		};

    		MinusOperation.prototype.evaluate = function(c) {
    			return this.lhs.evaluate(c).number().minus(this.rhs.evaluate(c).number());
    		};

    		MinusOperation.prototype.toString = function() {
    			return "(" + this.lhs.toString() + " - " + this.rhs.toString() + ")";
    		};

    		// MultiplyOperation /////////////////////////////////////////////////////////

    		MultiplyOperation.prototype = new BinaryOperation();
    		MultiplyOperation.prototype.constructor = MultiplyOperation;
    		MultiplyOperation.superclass = BinaryOperation.prototype;

    		function MultiplyOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		MultiplyOperation.prototype.init = function(lhs, rhs) {
    			MultiplyOperation.superclass.init.call(this, lhs, rhs);
    		};

    		MultiplyOperation.prototype.evaluate = function(c) {
    			return this.lhs.evaluate(c).number().multiply(this.rhs.evaluate(c).number());
    		};

    		MultiplyOperation.prototype.toString = function() {
    			return "(" + this.lhs.toString() + " * " + this.rhs.toString() + ")";
    		};

    		// DivOperation //////////////////////////////////////////////////////////////

    		DivOperation.prototype = new BinaryOperation();
    		DivOperation.prototype.constructor = DivOperation;
    		DivOperation.superclass = BinaryOperation.prototype;

    		function DivOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		DivOperation.prototype.init = function(lhs, rhs) {
    			DivOperation.superclass.init.call(this, lhs, rhs);
    		};

    		DivOperation.prototype.evaluate = function(c) {
    			return this.lhs.evaluate(c).number().div(this.rhs.evaluate(c).number());
    		};

    		DivOperation.prototype.toString = function() {
    			return "(" + this.lhs.toString() + " div " + this.rhs.toString() + ")";
    		};

    		// ModOperation //////////////////////////////////////////////////////////////

    		ModOperation.prototype = new BinaryOperation();
    		ModOperation.prototype.constructor = ModOperation;
    		ModOperation.superclass = BinaryOperation.prototype;

    		function ModOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		ModOperation.prototype.init = function(lhs, rhs) {
    			ModOperation.superclass.init.call(this, lhs, rhs);
    		};

    		ModOperation.prototype.evaluate = function(c) {
    			return this.lhs.evaluate(c).number().mod(this.rhs.evaluate(c).number());
    		};

    		ModOperation.prototype.toString = function() {
    			return "(" + this.lhs.toString() + " mod " + this.rhs.toString() + ")";
    		};

    		// BarOperation //////////////////////////////////////////////////////////////

    		BarOperation.prototype = new BinaryOperation();
    		BarOperation.prototype.constructor = BarOperation;
    		BarOperation.superclass = BinaryOperation.prototype;

    		function BarOperation(lhs, rhs) {
    			if (arguments.length > 0) {
    				this.init(lhs, rhs);
    			}
    		}

    		BarOperation.prototype.init = function(lhs, rhs) {
    			BarOperation.superclass.init.call(this, lhs, rhs);
    		};

    		BarOperation.prototype.evaluate = function(c) {
    			return this.lhs.evaluate(c).nodeset().union(this.rhs.evaluate(c).nodeset());
    		};

    		BarOperation.prototype.toString = function() {
    			return this.lhs.toString() + " | " + this.rhs.toString();
    		};

    		// PathExpr //////////////////////////////////////////////////////////////////

    		PathExpr.prototype = new Expression();
    		PathExpr.prototype.constructor = PathExpr;
    		PathExpr.superclass = Expression.prototype;

    		function PathExpr(filter, filterPreds, locpath) {
    			if (arguments.length > 0) {
    				this.init(filter, filterPreds, locpath);
    			}
    		}

    		PathExpr.prototype.init = function(filter, filterPreds, locpath) {
    			PathExpr.superclass.init.call(this);
    			this.filter = filter;
    			this.filterPredicates = filterPreds;
    			this.locationPath = locpath;
    		};

    		/**
    		 * Returns the topmost node of the tree containing node
    		 */
    		function findRoot(node) {
    		    while (node && node.parentNode) {
    		        node = node.parentNode;
    		    }

    		    return node;
    		}


    		PathExpr.prototype.evaluate = function(c) {
    			var nodes;
    			var xpc = new XPathContext();
    			xpc.variableResolver = c.variableResolver;
    			xpc.functionResolver = c.functionResolver;
    			xpc.namespaceResolver = c.namespaceResolver;
    			xpc.expressionContextNode = c.expressionContextNode;
    			xpc.virtualRoot = c.virtualRoot;
    			xpc.caseInsensitive = c.caseInsensitive;
    			if (this.filter == null) {
    				nodes = [ c.contextNode ];
    			} else {
    				var ns = this.filter.evaluate(c);
    				if (!Utilities.instance_of(ns, XNodeSet)) {
    					if (this.filterPredicates != null && this.filterPredicates.length > 0 || this.locationPath != null) {
    						throw new Error("Path expression filter must evaluate to a nodset if predicates or location path are used");
    					}
    					return ns;
    				}
    				nodes = ns.toUnsortedArray();
    				if (this.filterPredicates != null) {
    					// apply each of the predicates in turn
    					for (var j = 0; j < this.filterPredicates.length; j++) {
    						var pred = this.filterPredicates[j];
    						var newNodes = [];
    						xpc.contextSize = nodes.length;
    						for (xpc.contextPosition = 1; xpc.contextPosition <= xpc.contextSize; xpc.contextPosition++) {
    							xpc.contextNode = nodes[xpc.contextPosition - 1];
    							if (this.predicateMatches(pred, xpc)) {
    								newNodes.push(xpc.contextNode);
    							}
    						}
    						nodes = newNodes;
    					}
    				}
    			}
    			if (this.locationPath != null) {
    				if (this.locationPath.absolute) {
    					if (nodes[0].nodeType != 9 /*Node.DOCUMENT_NODE*/) {
    						if (xpc.virtualRoot != null) {
    							nodes = [ xpc.virtualRoot ];
    						} else {
    							if (nodes[0].ownerDocument == null) {
    								// IE 5.5 doesn't have ownerDocument?
    								var n = nodes[0];
    								while (n.parentNode != null) {
    									n = n.parentNode;
    								}
    								nodes = [ n ];
    							} else {
    								nodes = [ nodes[0].ownerDocument ];
    							}
    						}
    					} else {
    						nodes = [ nodes[0] ];
    					}
    				}
    				for (var i = 0; i < this.locationPath.steps.length; i++) {
    					var step = this.locationPath.steps[i];
    					var newNodes = [];
    					for (var j = 0; j < nodes.length; j++) {
    						xpc.contextNode = nodes[j];
    						switch (step.axis) {
    							case Step.ANCESTOR:
    								// look at all the ancestor nodes
    								if (xpc.contextNode === xpc.virtualRoot) {
    									break;
    								}
    								var m;
    								if (xpc.contextNode.nodeType == 2 /*Node.ATTRIBUTE_NODE*/) {
    									m = this.getOwnerElement(xpc.contextNode);
    								} else {
    									m = xpc.contextNode.parentNode;
    								}
    								while (m != null) {
    									if (step.nodeTest.matches(m, xpc)) {
    										newNodes.push(m);
    									}
    									if (m === xpc.virtualRoot) {
    										break;
    									}
    									m = m.parentNode;
    								}
    								break;

    							case Step.ANCESTORORSELF:
    								// look at all the ancestor nodes and the current node
    								for (var m = xpc.contextNode; m != null; m = m.nodeType == 2 /*Node.ATTRIBUTE_NODE*/ ? this.getOwnerElement(m) : m.parentNode) {
    									if (step.nodeTest.matches(m, xpc)) {
    										newNodes.push(m);
    									}
    									if (m === xpc.virtualRoot) {
    										break;
    									}
    								}
    								break;

    							case Step.ATTRIBUTE:
    								// look at the attributes
    								var nnm = xpc.contextNode.attributes;
    								if (nnm != null) {
    									for (var k = 0; k < nnm.length; k++) {
    										var m = nnm.item(k);
    										if (step.nodeTest.matches(m, xpc)) {
    											newNodes.push(m);
    										}
    									}
    								}
    								break;

    							case Step.CHILD:
    								// look at all child elements
    								for (var m = xpc.contextNode.firstChild; m != null; m = m.nextSibling) {
    									if (step.nodeTest.matches(m, xpc)) {
    										newNodes.push(m);
    									}
    								}
    								break;

    							case Step.DESCENDANT:
    								// look at all descendant nodes
    								var st = [ xpc.contextNode.firstChild ];
    								while (st.length > 0) {
    									for (var m = st.pop(); m != null; ) {
    										if (step.nodeTest.matches(m, xpc)) {
    											newNodes.push(m);
    										}
    										if (m.firstChild != null) {
    											st.push(m.nextSibling);
    											m = m.firstChild;
    										} else {
    											m = m.nextSibling;
    										}
    									}
    								}
    								break;

    							case Step.DESCENDANTORSELF:
    								// look at self
    								if (step.nodeTest.matches(xpc.contextNode, xpc)) {
    									newNodes.push(xpc.contextNode);
    								}
    								// look at all descendant nodes
    								var st = [ xpc.contextNode.firstChild ];
    								while (st.length > 0) {
    									for (var m = st.pop(); m != null; ) {
    										if (step.nodeTest.matches(m, xpc)) {
    											newNodes.push(m);
    										}
    										if (m.firstChild != null) {
    											st.push(m.nextSibling);
    											m = m.firstChild;
    										} else {
    											m = m.nextSibling;
    										}
    									}
    								}
    								break;

    							case Step.FOLLOWING:
    								if (xpc.contextNode === xpc.virtualRoot) {
    									break;
    								}
    								var st = [];
    								if (xpc.contextNode.firstChild != null) {
    									st.unshift(xpc.contextNode.firstChild);
    								} else {
    									st.unshift(xpc.contextNode.nextSibling);
    								}
    								for (var m = xpc.contextNode.parentNode; m != null && m.nodeType != 9 /*Node.DOCUMENT_NODE*/ && m !== xpc.virtualRoot; m = m.parentNode) {
    									st.unshift(m.nextSibling);
    								}
    								do {
    									for (var m = st.pop(); m != null; ) {
    										if (step.nodeTest.matches(m, xpc)) {
    											newNodes.push(m);
    										}
    										if (m.firstChild != null) {
    											st.push(m.nextSibling);
    											m = m.firstChild;
    										} else {
    											m = m.nextSibling;
    										}
    									}
    								} while (st.length > 0);
    								break;

    							case Step.FOLLOWINGSIBLING:
    								if (xpc.contextNode === xpc.virtualRoot) {
    									break;
    								}
    								for (var m = xpc.contextNode.nextSibling; m != null; m = m.nextSibling) {
    									if (step.nodeTest.matches(m, xpc)) {
    										newNodes.push(m);
    									}
    								}
    								break;

    							case Step.NAMESPACE:
    								var n = {};
    								if (xpc.contextNode.nodeType == 1 /*Node.ELEMENT_NODE*/) {
    									n["xml"] = XPath.XML_NAMESPACE_URI;
    									n["xmlns"] = XPath.XMLNS_NAMESPACE_URI;
    									for (var m = xpc.contextNode; m != null && m.nodeType == 1 /*Node.ELEMENT_NODE*/; m = m.parentNode) {
    										for (var k = 0; k < m.attributes.length; k++) {
    											var attr = m.attributes.item(k);
    											var nm = String(attr.name);
    											if (nm == "xmlns") {
    												if (n[""] == undefined) {
    													n[""] = attr.value;
    												}
    											} else if (nm.length > 6 && nm.substring(0, 6) == "xmlns:") {
    												var pre = nm.substring(6, nm.length);
    												if (n[pre] == undefined) {
    													n[pre] = attr.value;
    												}
    											}
    										}
    									}
    									for (var pre in n) {
    										var nsn = new XPathNamespace(pre, n[pre], xpc.contextNode);
    										if (step.nodeTest.matches(nsn, xpc)) {
    											newNodes.push(nsn);
    										}
    									}
    								}
    								break;

    							case Step.PARENT:
    								m = null;
    								if (xpc.contextNode !== xpc.virtualRoot) {
    									if (xpc.contextNode.nodeType == 2 /*Node.ATTRIBUTE_NODE*/) {
    										m = this.getOwnerElement(xpc.contextNode);
    									} else {
    										m = xpc.contextNode.parentNode;
    									}
    								}
    								if (m != null && step.nodeTest.matches(m, xpc)) {
    									newNodes.push(m);
    								}
    								break;

    							case Step.PRECEDING:
    								var st;
    								if (xpc.virtualRoot != null) {
    									st = [ xpc.virtualRoot ];
    								} else {
    		                            // cannot rely on .ownerDocument because the node may be in a document fragment
    		                            st = [findRoot(xpc.contextNode)];
    								}
    								outer: while (st.length > 0) {
    									for (var m = st.pop(); m != null; ) {
    										if (m == xpc.contextNode) {
    											break outer;
    										}
    										if (step.nodeTest.matches(m, xpc)) {
    											newNodes.unshift(m);
    										}
    										if (m.firstChild != null) {
    											st.push(m.nextSibling);
    											m = m.firstChild;
    										} else {
    											m = m.nextSibling;
    										}
    									}
    								}
    								break;

    							case Step.PRECEDINGSIBLING:
    								if (xpc.contextNode === xpc.virtualRoot) {
    									break;
    								}
    								for (var m = xpc.contextNode.previousSibling; m != null; m = m.previousSibling) {
    									if (step.nodeTest.matches(m, xpc)) {
    										newNodes.push(m);
    									}
    								}
    								break;

    							case Step.SELF:
    								if (step.nodeTest.matches(xpc.contextNode, xpc)) {
    									newNodes.push(xpc.contextNode);
    								}
    								break;
    						}
    					}
    					nodes = newNodes;
    					// apply each of the predicates in turn
    					for (var j = 0; j < step.predicates.length; j++) {
    						var pred = step.predicates[j];
    						var newNodes = [];
    						xpc.contextSize = nodes.length;
    						for (xpc.contextPosition = 1; xpc.contextPosition <= xpc.contextSize; xpc.contextPosition++) {
    							xpc.contextNode = nodes[xpc.contextPosition - 1];
    							if (this.predicateMatches(pred, xpc)) {
    								newNodes.push(xpc.contextNode);
    							}
    						}
    						nodes = newNodes;
    					}
    				}
    			}
    			var ns = new XNodeSet();
    			ns.addArray(nodes);
    			return ns;
    		};

    		PathExpr.prototype.predicateMatches = function(pred, c) {
    			var res = pred.evaluate(c);
    			if (Utilities.instance_of(res, XNumber)) {
    				return c.contextPosition == res.numberValue();
    			}
    			return res.booleanValue();
    		};

    		PathExpr.prototype.toString = function() {
    			if (this.filter != undefined) {
    				var s = this.filter.toString();
    				if (Utilities.instance_of(this.filter, XString)) {
    					s = "'" + s + "'";
    				}
    				if (this.filterPredicates != undefined) {
    					for (var i = 0; i < this.filterPredicates.length; i++) {
    						s = s + "[" + this.filterPredicates[i].toString() + "]";
    					}
    				}
    				if (this.locationPath != undefined) {
    					if (!this.locationPath.absolute) {
    						s += "/";
    					}
    					s += this.locationPath.toString();
    				}
    				return s;
    			}
    			return this.locationPath.toString();
    		};

    		PathExpr.prototype.getOwnerElement = function(n) {
    			// DOM 2 has ownerElement
    			if (n.ownerElement) {
    				return n.ownerElement;
    			}
    			// DOM 1 Internet Explorer can use selectSingleNode (ironically)
    			try {
    				if (n.selectSingleNode) {
    					return n.selectSingleNode("..");
    				}
    			} catch (e) {
    			}
    			// Other DOM 1 implementations must use this egregious search
    			var doc = n.nodeType == 9 /*Node.DOCUMENT_NODE*/
    					? n
    					: n.ownerDocument;
    			var elts = doc.getElementsByTagName("*");
    			for (var i = 0; i < elts.length; i++) {
    				var elt = elts.item(i);
    				var nnm = elt.attributes;
    				for (var j = 0; j < nnm.length; j++) {
    					var an = nnm.item(j);
    					if (an === n) {
    						return elt;
    					}
    				}
    			}
    			return null;
    		};

    		// LocationPath //////////////////////////////////////////////////////////////

    		LocationPath.prototype = new Object();
    		LocationPath.prototype.constructor = LocationPath;
    		LocationPath.superclass = Object.prototype;

    		function LocationPath(abs, steps) {
    			if (arguments.length > 0) {
    				this.init(abs, steps);
    			}
    		}

    		LocationPath.prototype.init = function(abs, steps) {
    			this.absolute = abs;
    			this.steps = steps;
    		};

    		LocationPath.prototype.toString = function() {
    			var s;
    			if (this.absolute) {
    				s = "/";
    			} else {
    				s = "";
    			}
    			for (var i = 0; i < this.steps.length; i++) {
    				if (i != 0) {
    					s += "/";
    				}
    				s += this.steps[i].toString();
    			}
    			return s;
    		};

    		// Step //////////////////////////////////////////////////////////////////////

    		Step.prototype = new Object();
    		Step.prototype.constructor = Step;
    		Step.superclass = Object.prototype;

    		function Step(axis, nodetest, preds) {
    			if (arguments.length > 0) {
    				this.init(axis, nodetest, preds);
    			}
    		}

    		Step.prototype.init = function(axis, nodetest, preds) {
    			this.axis = axis;
    			this.nodeTest = nodetest;
    			this.predicates = preds;
    		};

    		Step.prototype.toString = function() {
    			var s;
    			switch (this.axis) {
    				case Step.ANCESTOR:
    					s = "ancestor";
    					break;
    				case Step.ANCESTORORSELF:
    					s = "ancestor-or-self";
    					break;
    				case Step.ATTRIBUTE:
    					s = "attribute";
    					break;
    				case Step.CHILD:
    					s = "child";
    					break;
    				case Step.DESCENDANT:
    					s = "descendant";
    					break;
    				case Step.DESCENDANTORSELF:
    					s = "descendant-or-self";
    					break;
    				case Step.FOLLOWING:
    					s = "following";
    					break;
    				case Step.FOLLOWINGSIBLING:
    					s = "following-sibling";
    					break;
    				case Step.NAMESPACE:
    					s = "namespace";
    					break;
    				case Step.PARENT:
    					s = "parent";
    					break;
    				case Step.PRECEDING:
    					s = "preceding";
    					break;
    				case Step.PRECEDINGSIBLING:
    					s = "preceding-sibling";
    					break;
    				case Step.SELF:
    					s = "self";
    					break;
    			}
    			s += "::";
    			s += this.nodeTest.toString();
    			for (var i = 0; i < this.predicates.length; i++) {
    				s += "[" + this.predicates[i].toString() + "]";
    			}
    			return s;
    		};

    		Step.ANCESTOR = 0;
    		Step.ANCESTORORSELF = 1;
    		Step.ATTRIBUTE = 2;
    		Step.CHILD = 3;
    		Step.DESCENDANT = 4;
    		Step.DESCENDANTORSELF = 5;
    		Step.FOLLOWING = 6;
    		Step.FOLLOWINGSIBLING = 7;
    		Step.NAMESPACE = 8;
    		Step.PARENT = 9;
    		Step.PRECEDING = 10;
    		Step.PRECEDINGSIBLING = 11;
    		Step.SELF = 12;

    		// NodeTest //////////////////////////////////////////////////////////////////

    		NodeTest.prototype = new Object();
    		NodeTest.prototype.constructor = NodeTest;
    		NodeTest.superclass = Object.prototype;

    		function NodeTest(type, value) {
    			if (arguments.length > 0) {
    				this.init(type, value);
    			}
    		}

    		NodeTest.prototype.init = function(type, value) {
    			this.type = type;
    			this.value = value;
    		};

    		NodeTest.prototype.toString = function() {
    			switch (this.type) {
    				case NodeTest.NAMETESTANY:
    					return "*";
    				case NodeTest.NAMETESTPREFIXANY:
    					return this.value + ":*";
    				case NodeTest.NAMETESTRESOLVEDANY:
    					return "{" + this.value + "}*";
    				case NodeTest.NAMETESTQNAME:
    					return this.value;
    				case NodeTest.NAMETESTRESOLVEDNAME:
    					return "{" + this.namespaceURI + "}" + this.value;
    				case NodeTest.COMMENT:
    					return "comment()";
    				case NodeTest.TEXT:
    					return "text()";
    				case NodeTest.PI:
    					if (this.value != undefined) {
    						return "processing-instruction(\"" + this.value + "\")";
    					}
    					return "processing-instruction()";
    				case NodeTest.NODE:
    					return "node()";
    			}
    			return "<unknown nodetest type>";
    		};

    		NodeTest.prototype.matches = function (n, xpc) {
    		    var nType = n.nodeType;

    			switch (this.type) {
    				case NodeTest.NAMETESTANY:
    					if (nType === 2 /*Node.ATTRIBUTE_NODE*/
    							|| nType === 1 /*Node.ELEMENT_NODE*/
    							|| nType === XPathNamespace.XPATH_NAMESPACE_NODE) {
    						return true;
    					}
    					return false;
    				case NodeTest.NAMETESTPREFIXANY:
    					if (nType === 2 /*Node.ATTRIBUTE_NODE*/ || nType === 1 /*Node.ELEMENT_NODE*/) {
    						var ns = xpc.namespaceResolver.getNamespace(this.value, xpc.expressionContextNode);
    						if (ns == null) {
    							throw new Error("Cannot resolve QName " + this.value);
    						}
    						return ns === (n.namespaceURI || '');
    					}
    					return false;
    				case NodeTest.NAMETESTQNAME:
    					if (nType === 2 /*Node.ATTRIBUTE_NODE*/
    							|| nType === 1 /*Node.ELEMENT_NODE*/
    							|| nType === XPathNamespace.XPATH_NAMESPACE_NODE) {
    						var test = Utilities.resolveQName(this.value, xpc.namespaceResolver, xpc.expressionContextNode, false);
    						if (test[0] == null) {
    							throw new Error("Cannot resolve QName " + this.value);
    						}

    						test[0] = String(test[0]) || null;
    						test[1] = String(test[1]);

    						var node = [
    		                    String(n.namespaceURI || '') || null,
    		                    // localName will be null if the node was created with DOM1 createElement()
    		                    String(n.localName || n.nodeName)
    		                ];

    						if (xpc.caseInsensitive) {
    							return test[0] === node[0] && test[1].toLowerCase() === node[1].toLowerCase();
    						}

    						return test[0] === node[0] && test[1] === node[1];
    					}
    					return false;
    				case NodeTest.COMMENT:
    					return nType === 8 /*Node.COMMENT_NODE*/;
    				case NodeTest.TEXT:
    					return nType === 3 /*Node.TEXT_NODE*/ || nType == 4 /*Node.CDATA_SECTION_NODE*/;
    				case NodeTest.PI:
    					return nType === 7 /*Node.PROCESSING_INSTRUCTION_NODE*/
    						&& (this.value == null || n.nodeName == this.value);
    				case NodeTest.NODE:
    					return nType === 9 /*Node.DOCUMENT_NODE*/
    						|| nType === 1 /*Node.ELEMENT_NODE*/
    						|| nType === 2 /*Node.ATTRIBUTE_NODE*/
    						|| nType === 3 /*Node.TEXT_NODE*/
    						|| nType === 4 /*Node.CDATA_SECTION_NODE*/
    						|| nType === 8 /*Node.COMMENT_NODE*/
    						|| nType === 7 /*Node.PROCESSING_INSTRUCTION_NODE*/;
    			}
    			return false;
    		};

    		NodeTest.NAMETESTANY = 0;
    		NodeTest.NAMETESTPREFIXANY = 1;
    		NodeTest.NAMETESTQNAME = 2;
    		NodeTest.COMMENT = 3;
    		NodeTest.TEXT = 4;
    		NodeTest.PI = 5;
    		NodeTest.NODE = 6;

    		// VariableReference /////////////////////////////////////////////////////////

    		VariableReference.prototype = new Expression();
    		VariableReference.prototype.constructor = VariableReference;
    		VariableReference.superclass = Expression.prototype;

    		function VariableReference(v) {
    			if (arguments.length > 0) {
    				this.init(v);
    			}
    		}

    		VariableReference.prototype.init = function(v) {
    			this.variable = v;
    		};

    		VariableReference.prototype.toString = function() {
    			return "$" + this.variable;
    		};

    		VariableReference.prototype.evaluate = function(c) {
    		    var parts = Utilities.resolveQName(this.variable, c.namespaceResolver, c.contextNode, false);

    		    if (parts[0] == null) {
    		        throw new Error("Cannot resolve QName " + fn);
    		    }
    			var result = c.variableResolver.getVariable(parts[1], parts[0]);
    		    if (!result) {
    		        throw XPathException.fromMessage("Undeclared variable: " + this.toString());
    		    }
    		    return result;
    		};

    		// FunctionCall //////////////////////////////////////////////////////////////

    		FunctionCall.prototype = new Expression();
    		FunctionCall.prototype.constructor = FunctionCall;
    		FunctionCall.superclass = Expression.prototype;

    		function FunctionCall(fn, args) {
    			if (arguments.length > 0) {
    				this.init(fn, args);
    			}
    		}

    		FunctionCall.prototype.init = function(fn, args) {
    			this.functionName = fn;
    			this.arguments = args;
    		};

    		FunctionCall.prototype.toString = function() {
    			var s = this.functionName + "(";
    			for (var i = 0; i < this.arguments.length; i++) {
    				if (i > 0) {
    					s += ", ";
    				}
    				s += this.arguments[i].toString();
    			}
    			return s + ")";
    		};

    		FunctionCall.prototype.evaluate = function(c) {
    		    var f = FunctionResolver.getFunctionFromContext(this.functionName, c);

    		    if (!f) {
    				throw new Error("Unknown function " + this.functionName);
    			}

    		    var a = [c].concat(this.arguments);
    			return f.apply(c.functionResolver.thisArg, a);
    		};

    		// XString ///////////////////////////////////////////////////////////////////

    		XString.prototype = new Expression();
    		XString.prototype.constructor = XString;
    		XString.superclass = Expression.prototype;

    		function XString(s) {
    			if (arguments.length > 0) {
    				this.init(s);
    			}
    		}

    		XString.prototype.init = function(s) {
    			this.str = String(s);
    		};

    		XString.prototype.toString = function() {
    			return this.str;
    		};

    		XString.prototype.evaluate = function(c) {
    			return this;
    		};

    		XString.prototype.string = function() {
    			return this;
    		};

    		XString.prototype.number = function() {
    			return new XNumber(this.str);
    		};

    		XString.prototype.bool = function() {
    			return new XBoolean(this.str);
    		};

    		XString.prototype.nodeset = function() {
    			throw new Error("Cannot convert string to nodeset");
    		};

    		XString.prototype.stringValue = function() {
    			return this.str;
    		};

    		XString.prototype.numberValue = function() {
    			return this.number().numberValue();
    		};

    		XString.prototype.booleanValue = function() {
    			return this.bool().booleanValue();
    		};

    		XString.prototype.equals = function(r) {
    			if (Utilities.instance_of(r, XBoolean)) {
    				return this.bool().equals(r);
    			}
    			if (Utilities.instance_of(r, XNumber)) {
    				return this.number().equals(r);
    			}
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithString(this, Operators.equals);
    			}
    			return new XBoolean(this.str == r.str);
    		};

    		XString.prototype.notequal = function(r) {
    			if (Utilities.instance_of(r, XBoolean)) {
    				return this.bool().notequal(r);
    			}
    			if (Utilities.instance_of(r, XNumber)) {
    				return this.number().notequal(r);
    			}
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithString(this, Operators.notequal);
    			}
    			return new XBoolean(this.str != r.str);
    		};

    		XString.prototype.lessthan = function(r) {
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this.number(), Operators.greaterthanorequal);
    			}
    			return this.number().lessthan(r.number());
    		};

    		XString.prototype.greaterthan = function(r) {
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this.number(), Operators.lessthanorequal);
    			}
    			return this.number().greaterthan(r.number());
    		};

    		XString.prototype.lessthanorequal = function(r) {
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this.number(), Operators.greaterthan);
    			}
    			return this.number().lessthanorequal(r.number());
    		};

    		XString.prototype.greaterthanorequal = function(r) {
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this.number(), Operators.lessthan);
    			}
    			return this.number().greaterthanorequal(r.number());
    		};

    		// XNumber ///////////////////////////////////////////////////////////////////

    		XNumber.prototype = new Expression();
    		XNumber.prototype.constructor = XNumber;
    		XNumber.superclass = Expression.prototype;

    		function XNumber(n) {
    			if (arguments.length > 0) {
    				this.init(n);
    			}
    		}

    		XNumber.prototype.init = function(n) {
    			this.num = typeof n === "string" ? this.parse(n) : Number(n);
    		};

    		XNumber.prototype.numberFormat = /^\s*-?[0-9]*\.?[0-9]+\s*$/;

    		XNumber.prototype.parse = function(s) {
    		    // XPath representation of numbers is more restrictive than what Number() or parseFloat() allow
    		    return this.numberFormat.test(s) ? parseFloat(s) : Number.NaN;
    		};

    		function padSmallNumber(numberStr) {
    			var parts = numberStr.split('e-');
    			var base = parts[0].replace('.', '');
    			var exponent = Number(parts[1]);
    			
    			for (var i = 0; i < exponent - 1; i += 1) {
    				base = '0' + base;
    			}
    			
    			return '0.' + base;
    		}

    		function padLargeNumber(numberStr) {
    			var parts = numberStr.split('e');
    			var base = parts[0].replace('.', '');
    			var exponent = Number(parts[1]);
    			var zerosToAppend = exponent + 1 - base.length;
    			
    			for (var i = 0; i < zerosToAppend; i += 1){
    				base += '0';
    			}
    			
    			return base;
    		}

    		XNumber.prototype.toString = function() {
    			var strValue = this.num.toString();

    			if (strValue.indexOf('e-') !== -1) {
    				return padSmallNumber(strValue);
    			}
    		    
    			if (strValue.indexOf('e') !== -1) {
    				return padLargeNumber(strValue);
    			}
    			
    			return strValue;
    		};

    		XNumber.prototype.evaluate = function(c) {
    			return this;
    		};

    		XNumber.prototype.string = function() {
    			
    			
    			return new XString(this.toString());
    		};

    		XNumber.prototype.number = function() {
    			return this;
    		};

    		XNumber.prototype.bool = function() {
    			return new XBoolean(this.num);
    		};

    		XNumber.prototype.nodeset = function() {
    			throw new Error("Cannot convert number to nodeset");
    		};

    		XNumber.prototype.stringValue = function() {
    			return this.string().stringValue();
    		};

    		XNumber.prototype.numberValue = function() {
    			return this.num;
    		};

    		XNumber.prototype.booleanValue = function() {
    			return this.bool().booleanValue();
    		};

    		XNumber.prototype.negate = function() {
    			return new XNumber(-this.num);
    		};

    		XNumber.prototype.equals = function(r) {
    			if (Utilities.instance_of(r, XBoolean)) {
    				return this.bool().equals(r);
    			}
    			if (Utilities.instance_of(r, XString)) {
    				return this.equals(r.number());
    			}
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this, Operators.equals);
    			}
    			return new XBoolean(this.num == r.num);
    		};

    		XNumber.prototype.notequal = function(r) {
    			if (Utilities.instance_of(r, XBoolean)) {
    				return this.bool().notequal(r);
    			}
    			if (Utilities.instance_of(r, XString)) {
    				return this.notequal(r.number());
    			}
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this, Operators.notequal);
    			}
    			return new XBoolean(this.num != r.num);
    		};

    		XNumber.prototype.lessthan = function(r) {
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this, Operators.greaterthanorequal);
    			}
    			if (Utilities.instance_of(r, XBoolean) || Utilities.instance_of(r, XString)) {
    				return this.lessthan(r.number());
    			}
    			return new XBoolean(this.num < r.num);
    		};

    		XNumber.prototype.greaterthan = function(r) {
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this, Operators.lessthanorequal);
    			}
    			if (Utilities.instance_of(r, XBoolean) || Utilities.instance_of(r, XString)) {
    				return this.greaterthan(r.number());
    			}
    			return new XBoolean(this.num > r.num);
    		};

    		XNumber.prototype.lessthanorequal = function(r) {
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this, Operators.greaterthan);
    			}
    			if (Utilities.instance_of(r, XBoolean) || Utilities.instance_of(r, XString)) {
    				return this.lessthanorequal(r.number());
    			}
    			return new XBoolean(this.num <= r.num);
    		};

    		XNumber.prototype.greaterthanorequal = function(r) {
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this, Operators.lessthan);
    			}
    			if (Utilities.instance_of(r, XBoolean) || Utilities.instance_of(r, XString)) {
    				return this.greaterthanorequal(r.number());
    			}
    			return new XBoolean(this.num >= r.num);
    		};

    		XNumber.prototype.plus = function(r) {
    			return new XNumber(this.num + r.num);
    		};

    		XNumber.prototype.minus = function(r) {
    			return new XNumber(this.num - r.num);
    		};

    		XNumber.prototype.multiply = function(r) {
    			return new XNumber(this.num * r.num);
    		};

    		XNumber.prototype.div = function(r) {
    			return new XNumber(this.num / r.num);
    		};

    		XNumber.prototype.mod = function(r) {
    			return new XNumber(this.num % r.num);
    		};

    		// XBoolean //////////////////////////////////////////////////////////////////

    		XBoolean.prototype = new Expression();
    		XBoolean.prototype.constructor = XBoolean;
    		XBoolean.superclass = Expression.prototype;

    		function XBoolean(b) {
    			if (arguments.length > 0) {
    				this.init(b);
    			}
    		}

    		XBoolean.prototype.init = function(b) {
    			this.b = Boolean(b);
    		};

    		XBoolean.prototype.toString = function() {
    			return this.b.toString();
    		};

    		XBoolean.prototype.evaluate = function(c) {
    			return this;
    		};

    		XBoolean.prototype.string = function() {
    			return new XString(this.b);
    		};

    		XBoolean.prototype.number = function() {
    			return new XNumber(this.b);
    		};

    		XBoolean.prototype.bool = function() {
    			return this;
    		};

    		XBoolean.prototype.nodeset = function() {
    			throw new Error("Cannot convert boolean to nodeset");
    		};

    		XBoolean.prototype.stringValue = function() {
    			return this.string().stringValue();
    		};

    		XBoolean.prototype.numberValue = function() {
    			return this.num().numberValue();
    		};

    		XBoolean.prototype.booleanValue = function() {
    			return this.b;
    		};

    		XBoolean.prototype.not = function() {
    			return new XBoolean(!this.b);
    		};

    		XBoolean.prototype.equals = function(r) {
    			if (Utilities.instance_of(r, XString) || Utilities.instance_of(r, XNumber)) {
    				return this.equals(r.bool());
    			}
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithBoolean(this, Operators.equals);
    			}
    			return new XBoolean(this.b == r.b);
    		};

    		XBoolean.prototype.notequal = function(r) {
    			if (Utilities.instance_of(r, XString) || Utilities.instance_of(r, XNumber)) {
    				return this.notequal(r.bool());
    			}
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithBoolean(this, Operators.notequal);
    			}
    			return new XBoolean(this.b != r.b);
    		};

    		XBoolean.prototype.lessthan = function(r) {
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this.number(), Operators.greaterthanorequal);
    			}
    			return this.number().lessthan(r.number());
    		};

    		XBoolean.prototype.greaterthan = function(r) {
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this.number(), Operators.lessthanorequal);
    			}
    			return this.number().greaterthan(r.number());
    		};

    		XBoolean.prototype.lessthanorequal = function(r) {
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this.number(), Operators.greaterthan);
    			}
    			return this.number().lessthanorequal(r.number());
    		};

    		XBoolean.prototype.greaterthanorequal = function(r) {
    			if (Utilities.instance_of(r, XNodeSet)) {
    				return r.compareWithNumber(this.number(), Operators.lessthan);
    			}
    			return this.number().greaterthanorequal(r.number());
    		};

    		// AVLTree ///////////////////////////////////////////////////////////////////

    		AVLTree.prototype = new Object();
    		AVLTree.prototype.constructor = AVLTree;
    		AVLTree.superclass = Object.prototype;

    		function AVLTree(n) {
    			this.init(n);
    		}

    		AVLTree.prototype.init = function(n) {
    			this.left = null;
    		    this.right = null;
    			this.node = n;
    			this.depth = 1;
    		};

    		AVLTree.prototype.balance = function() {
    		    var ldepth = this.left  == null ? 0 : this.left.depth;
    		    var rdepth = this.right == null ? 0 : this.right.depth;

    			if (ldepth > rdepth + 1) {
    		        // LR or LL rotation
    		        var lldepth = this.left.left  == null ? 0 : this.left.left.depth;
    		        var lrdepth = this.left.right == null ? 0 : this.left.right.depth;

    		        if (lldepth < lrdepth) {
    		            // LR rotation consists of a RR rotation of the left child
    		            this.left.rotateRR();
    		            // plus a LL rotation of this node, which happens anyway
    		        }
    		        this.rotateLL();
    		    } else if (ldepth + 1 < rdepth) {
    		        // RR or RL rorarion
    				var rrdepth = this.right.right == null ? 0 : this.right.right.depth;
    				var rldepth = this.right.left  == null ? 0 : this.right.left.depth;

    		        if (rldepth > rrdepth) {
    		            // RR rotation consists of a LL rotation of the right child
    		            this.right.rotateLL();
    		            // plus a RR rotation of this node, which happens anyway
    		        }
    		        this.rotateRR();
    		    }
    		};

    		AVLTree.prototype.rotateLL = function() {
    		    // the left side is too long => rotate from the left (_not_ leftwards)
    		    var nodeBefore = this.node;
    		    var rightBefore = this.right;
    		    this.node = this.left.node;
    		    this.right = this.left;
    		    this.left = this.left.left;
    		    this.right.left = this.right.right;
    		    this.right.right = rightBefore;
    		    this.right.node = nodeBefore;
    		    this.right.updateInNewLocation();
    		    this.updateInNewLocation();
    		};

    		AVLTree.prototype.rotateRR = function() {
    		    // the right side is too long => rotate from the right (_not_ rightwards)
    		    var nodeBefore = this.node;
    		    var leftBefore = this.left;
    		    this.node = this.right.node;
    		    this.left = this.right;
    		    this.right = this.right.right;
    		    this.left.right = this.left.left;
    		    this.left.left = leftBefore;
    		    this.left.node = nodeBefore;
    		    this.left.updateInNewLocation();
    		    this.updateInNewLocation();
    		};

    		AVLTree.prototype.updateInNewLocation = function() {
    		    this.getDepthFromChildren();
    		};

    		AVLTree.prototype.getDepthFromChildren = function() {
    		    this.depth = this.node == null ? 0 : 1;
    		    if (this.left != null) {
    		        this.depth = this.left.depth + 1;
    		    }
    		    if (this.right != null && this.depth <= this.right.depth) {
    		        this.depth = this.right.depth + 1;
    		    }
    		};

    		function nodeOrder(n1, n2) {
    			if (n1 === n2) {
    				return 0;
    			}

    			if (n1.compareDocumentPosition) {
    			    var cpos = n1.compareDocumentPosition(n2);

    		        if (cpos & 0x01) {
    		            // not in the same document; return an arbitrary result (is there a better way to do this)
    		            return 1;
    		        }
    		        if (cpos & 0x0A) {
    		            // n2 precedes or contains n1
    		            return 1;
    		        }
    		        if (cpos & 0x14) {
    		            // n2 follows or is contained by n1
    		            return -1;
    		        }

    			    return 0;
    			}

    			var d1 = 0,
    			    d2 = 0;
    			for (var m1 = n1; m1 != null; m1 = m1.parentNode || m1.ownerElement) {
    				d1++;
    			}
    			for (var m2 = n2; m2 != null; m2 = m2.parentNode || m2.ownerElement) {
    				d2++;
    			}

    		    // step up to same depth
    			if (d1 > d2) {
    				while (d1 > d2) {
    					n1 = n1.parentNode || n1.ownerElement;
    					d1--;
    				}
    				if (n1 === n2) {
    					return 1;
    				}
    			} else if (d2 > d1) {
    				while (d2 > d1) {
    					n2 = n2.parentNode || n2.ownerElement;
    					d2--;
    				}
    				if (n1 === n2) {
    					return -1;
    				}
    			}

    		    var n1Par = n1.parentNode || n1.ownerElement,
    		        n2Par = n2.parentNode || n2.ownerElement;

    		    // find common parent
    			while (n1Par !== n2Par) {
    				n1 = n1Par;
    				n2 = n2Par;
    				n1Par = n1.parentNode || n1.ownerElement;
    			    n2Par = n2.parentNode || n2.ownerElement;
    			}
    		    
    		    var n1isAttr = Utilities.isAttribute(n1);
    		    var n2isAttr = Utilities.isAttribute(n2);
    		    
    		    if (n1isAttr && !n2isAttr) {
    		        return -1;
    		    }
    		    if (!n1isAttr && n2isAttr) {
    		        return 1;
    		    }
    		    
    		    if(n1Par) {
    			    var cn = n1isAttr ? n1Par.attributes : n1Par.childNodes,
    			        len = cn.length;
    		        for (var i = 0; i < len; i += 1) {
    		            var n = cn[i];
    		            if (n === n1) {
    		                return -1;
    		            }
    		            if (n === n2) {
    		                return 1;
    		            }
    		        }
    		    }        
    		    
    		    throw new Error('Unexpected: could not determine node order');
    		}

    		AVLTree.prototype.add = function(n)  {
    			if (n === this.node) {
    		        return false;
    		    }

    			var o = nodeOrder(n, this.node);

    		    var ret = false;
    		    if (o == -1) {
    		        if (this.left == null) {
    		            this.left = new AVLTree(n);
    		            ret = true;
    		        } else {
    		            ret = this.left.add(n);
    		            if (ret) {
    		                this.balance();
    		            }
    		        }
    		    } else if (o == 1) {
    		        if (this.right == null) {
    		            this.right = new AVLTree(n);
    		            ret = true;
    		        } else {
    		            ret = this.right.add(n);
    		            if (ret) {
    		                this.balance();
    		            }
    		        }
    		    }

    		    if (ret) {
    		        this.getDepthFromChildren();
    		    }
    		    return ret;
    		};

    		// XNodeSet //////////////////////////////////////////////////////////////////

    		XNodeSet.prototype = new Expression();
    		XNodeSet.prototype.constructor = XNodeSet;
    		XNodeSet.superclass = Expression.prototype;

    		function XNodeSet() {
    			this.init();
    		}

    		XNodeSet.prototype.init = function() {
    		    this.tree = null;
    			this.nodes = [];
    			this.size = 0;
    		};

    		XNodeSet.prototype.toString = function() {
    			var p = this.first();
    			if (p == null) {
    				return "";
    			}
    			return this.stringForNode(p);
    		};

    		XNodeSet.prototype.evaluate = function(c) {
    			return this;
    		};

    		XNodeSet.prototype.string = function() {
    			return new XString(this.toString());
    		};

    		XNodeSet.prototype.stringValue = function() {
    			return this.toString();
    		};

    		XNodeSet.prototype.number = function() {
    			return new XNumber(this.string());
    		};

    		XNodeSet.prototype.numberValue = function() {
    			return Number(this.string());
    		};

    		XNodeSet.prototype.bool = function() {
    			return new XBoolean(this.booleanValue());
    		};

    		XNodeSet.prototype.booleanValue = function() {
    			return !!this.size;
    		};

    		XNodeSet.prototype.nodeset = function() {
    			return this;
    		};

    		XNodeSet.prototype.stringForNode = function(n) {
    			if (n.nodeType == 9   /*Node.DOCUMENT_NODE*/ || 
    		        n.nodeType == 1   /*Node.ELEMENT_NODE */ || 
    		        n.nodeType === 11 /*Node.DOCUMENT_FRAGMENT*/) {
    				return this.stringForContainerNode(n);
    			}
    		    if (n.nodeType === 2 /* Node.ATTRIBUTE_NODE */) {
    		        return n.value || n.nodeValue;
    		    }
    			if (n.isNamespaceNode) {
    				return n.namespace;
    			}
    			return n.nodeValue;
    		};

    		XNodeSet.prototype.stringForContainerNode = function(n) {
    			var s = "";
    			for (var n2 = n.firstChild; n2 != null; n2 = n2.nextSibling) {
    		        var nt = n2.nodeType;
    		        //  Element,    Text,       CDATA,      Document,   Document Fragment
    		        if (nt === 1 || nt === 3 || nt === 4 || nt === 9 || nt === 11) {
    		            s += this.stringForNode(n2);
    		        }
    			}
    			return s;
    		};

    		XNodeSet.prototype.buildTree = function () {
    		    if (!this.tree && this.nodes.length) {
    		        this.tree = new AVLTree(this.nodes[0]);
    		        for (var i = 1; i < this.nodes.length; i += 1) {
    		            this.tree.add(this.nodes[i]);
    		        }
    		    }

    		    return this.tree;
    		};

    		XNodeSet.prototype.first = function() {
    			var p = this.buildTree();
    			if (p == null) {
    				return null;
    			}
    			while (p.left != null) {
    				p = p.left;
    			}
    			return p.node;
    		};

    		XNodeSet.prototype.add = function(n) {
    		    for (var i = 0; i < this.nodes.length; i += 1) {
    		        if (n === this.nodes[i]) {
    		            return;
    		        }
    		    }

    		    this.tree = null;
    		    this.nodes.push(n);
    		    this.size += 1;
    		};

    		XNodeSet.prototype.addArray = function(ns) {
    			for (var i = 0; i < ns.length; i += 1) {
    				this.add(ns[i]);
    			}
    		};

    		/**
    		 * Returns an array of the node set's contents in document order
    		 */
    		XNodeSet.prototype.toArray = function() {
    			var a = [];
    			this.toArrayRec(this.buildTree(), a);
    			return a;
    		};

    		XNodeSet.prototype.toArrayRec = function(t, a) {
    			if (t != null) {
    				this.toArrayRec(t.left, a);
    				a.push(t.node);
    				this.toArrayRec(t.right, a);
    			}
    		};

    		/**
    		 * Returns an array of the node set's contents in arbitrary order
    		 */
    		XNodeSet.prototype.toUnsortedArray = function () {
    		    return this.nodes.slice();
    		};

    		XNodeSet.prototype.compareWithString = function(r, o) {
    			var a = this.toUnsortedArray();
    			for (var i = 0; i < a.length; i++) {
    				var n = a[i];
    				var l = new XString(this.stringForNode(n));
    				var res = o(l, r);
    				if (res.booleanValue()) {
    					return res;
    				}
    			}
    			return new XBoolean(false);
    		};

    		XNodeSet.prototype.compareWithNumber = function(r, o) {
    			var a = this.toUnsortedArray();
    			for (var i = 0; i < a.length; i++) {
    				var n = a[i];
    				var l = new XNumber(this.stringForNode(n));
    				var res = o(l, r);
    				if (res.booleanValue()) {
    					return res;
    				}
    			}
    			return new XBoolean(false);
    		};

    		XNodeSet.prototype.compareWithBoolean = function(r, o) {
    			return o(this.bool(), r);
    		};

    		XNodeSet.prototype.compareWithNodeSet = function(r, o) {
    			var arr = this.toUnsortedArray();
    			var oInvert = function (lop, rop) { return o(rop, lop); };
    			
    			for (var i = 0; i < arr.length; i++) {
    				var l = new XString(this.stringForNode(arr[i]));

    				var res = r.compareWithString(l, oInvert);
    				if (res.booleanValue()) {
    					return res;
    				}
    			}
    			
    			return new XBoolean(false);
    		};

    		XNodeSet.prototype.equals = function(r) {
    			if (Utilities.instance_of(r, XString)) {
    				return this.compareWithString(r, Operators.equals);
    			}
    			if (Utilities.instance_of(r, XNumber)) {
    				return this.compareWithNumber(r, Operators.equals);
    			}
    			if (Utilities.instance_of(r, XBoolean)) {
    				return this.compareWithBoolean(r, Operators.equals);
    			}
    			return this.compareWithNodeSet(r, Operators.equals);
    		};

    		XNodeSet.prototype.notequal = function(r) {
    			if (Utilities.instance_of(r, XString)) {
    				return this.compareWithString(r, Operators.notequal);
    			}
    			if (Utilities.instance_of(r, XNumber)) {
    				return this.compareWithNumber(r, Operators.notequal);
    			}
    			if (Utilities.instance_of(r, XBoolean)) {
    				return this.compareWithBoolean(r, Operators.notequal);
    			}
    			return this.compareWithNodeSet(r, Operators.notequal);
    		};

    		XNodeSet.prototype.lessthan = function(r) {
    			if (Utilities.instance_of(r, XString)) {
    				return this.compareWithNumber(r.number(), Operators.lessthan);
    			}
    			if (Utilities.instance_of(r, XNumber)) {
    				return this.compareWithNumber(r, Operators.lessthan);
    			}
    			if (Utilities.instance_of(r, XBoolean)) {
    				return this.compareWithBoolean(r, Operators.lessthan);
    			}
    			return this.compareWithNodeSet(r, Operators.lessthan);
    		};

    		XNodeSet.prototype.greaterthan = function(r) {
    			if (Utilities.instance_of(r, XString)) {
    				return this.compareWithNumber(r.number(), Operators.greaterthan);
    			}
    			if (Utilities.instance_of(r, XNumber)) {
    				return this.compareWithNumber(r, Operators.greaterthan);
    			}
    			if (Utilities.instance_of(r, XBoolean)) {
    				return this.compareWithBoolean(r, Operators.greaterthan);
    			}
    			return this.compareWithNodeSet(r, Operators.greaterthan);
    		};

    		XNodeSet.prototype.lessthanorequal = function(r) {
    			if (Utilities.instance_of(r, XString)) {
    				return this.compareWithNumber(r.number(), Operators.lessthanorequal);
    			}
    			if (Utilities.instance_of(r, XNumber)) {
    				return this.compareWithNumber(r, Operators.lessthanorequal);
    			}
    			if (Utilities.instance_of(r, XBoolean)) {
    				return this.compareWithBoolean(r, Operators.lessthanorequal);
    			}
    			return this.compareWithNodeSet(r, Operators.lessthanorequal);
    		};

    		XNodeSet.prototype.greaterthanorequal = function(r) {
    			if (Utilities.instance_of(r, XString)) {
    				return this.compareWithNumber(r.number(), Operators.greaterthanorequal);
    			}
    			if (Utilities.instance_of(r, XNumber)) {
    				return this.compareWithNumber(r, Operators.greaterthanorequal);
    			}
    			if (Utilities.instance_of(r, XBoolean)) {
    				return this.compareWithBoolean(r, Operators.greaterthanorequal);
    			}
    			return this.compareWithNodeSet(r, Operators.greaterthanorequal);
    		};

    		XNodeSet.prototype.union = function(r) {
    			var ns = new XNodeSet();
    		    ns.addArray(this.toUnsortedArray());
    			ns.addArray(r.toUnsortedArray());
    			return ns;
    		};

    		// XPathNamespace ////////////////////////////////////////////////////////////

    		XPathNamespace.prototype = new Object();
    		XPathNamespace.prototype.constructor = XPathNamespace;
    		XPathNamespace.superclass = Object.prototype;

    		function XPathNamespace(pre, ns, p) {
    			this.isXPathNamespace = true;
    			this.ownerDocument = p.ownerDocument;
    			this.nodeName = "#namespace";
    			this.prefix = pre;
    			this.localName = pre;
    			this.namespaceURI = ns;
    			this.nodeValue = ns;
    			this.ownerElement = p;
    			this.nodeType = XPathNamespace.XPATH_NAMESPACE_NODE;
    		}

    		XPathNamespace.prototype.toString = function() {
    			return "{ \"" + this.prefix + "\", \"" + this.namespaceURI + "\" }";
    		};

    		// Operators /////////////////////////////////////////////////////////////////

    		var Operators = new Object();

    		Operators.equals = function(l, r) {
    			return l.equals(r);
    		};

    		Operators.notequal = function(l, r) {
    			return l.notequal(r);
    		};

    		Operators.lessthan = function(l, r) {
    			return l.lessthan(r);
    		};

    		Operators.greaterthan = function(l, r) {
    			return l.greaterthan(r);
    		};

    		Operators.lessthanorequal = function(l, r) {
    			return l.lessthanorequal(r);
    		};

    		Operators.greaterthanorequal = function(l, r) {
    			return l.greaterthanorequal(r);
    		};

    		// XPathContext //////////////////////////////////////////////////////////////

    		XPathContext.prototype = new Object();
    		XPathContext.prototype.constructor = XPathContext;
    		XPathContext.superclass = Object.prototype;

    		function XPathContext(vr, nr, fr) {
    			this.variableResolver = vr != null ? vr : new VariableResolver();
    			this.namespaceResolver = nr != null ? nr : new NamespaceResolver();
    			this.functionResolver = fr != null ? fr : new FunctionResolver();
    		}

    		// VariableResolver //////////////////////////////////////////////////////////

    		VariableResolver.prototype = new Object();
    		VariableResolver.prototype.constructor = VariableResolver;
    		VariableResolver.superclass = Object.prototype;

    		function VariableResolver() {
    		}

    		VariableResolver.prototype.getVariable = function(ln, ns) {
    			return null;
    		};

    		// FunctionResolver //////////////////////////////////////////////////////////

    		FunctionResolver.prototype = new Object();
    		FunctionResolver.prototype.constructor = FunctionResolver;
    		FunctionResolver.superclass = Object.prototype;

    		function FunctionResolver(thisArg) {
    			this.thisArg = thisArg != null ? thisArg : Functions;
    			this.functions = new Object();
    			this.addStandardFunctions();
    		}

    		FunctionResolver.prototype.addStandardFunctions = function() {
    			this.functions["{}last"] = Functions.last;
    			this.functions["{}position"] = Functions.position;
    			this.functions["{}count"] = Functions.count;
    			this.functions["{}id"] = Functions.id;
    			this.functions["{}local-name"] = Functions.localName;
    			this.functions["{}namespace-uri"] = Functions.namespaceURI;
    			this.functions["{}name"] = Functions.name;
    			this.functions["{}string"] = Functions.string;
    			this.functions["{}concat"] = Functions.concat;
    			this.functions["{}starts-with"] = Functions.startsWith;
    			this.functions["{}contains"] = Functions.contains;
    			this.functions["{}substring-before"] = Functions.substringBefore;
    			this.functions["{}substring-after"] = Functions.substringAfter;
    			this.functions["{}substring"] = Functions.substring;
    			this.functions["{}string-length"] = Functions.stringLength;
    			this.functions["{}normalize-space"] = Functions.normalizeSpace;
    			this.functions["{}translate"] = Functions.translate;
    			this.functions["{}boolean"] = Functions.boolean_;
    			this.functions["{}not"] = Functions.not;
    			this.functions["{}true"] = Functions.true_;
    			this.functions["{}false"] = Functions.false_;
    			this.functions["{}lang"] = Functions.lang;
    			this.functions["{}number"] = Functions.number;
    			this.functions["{}sum"] = Functions.sum;
    			this.functions["{}floor"] = Functions.floor;
    			this.functions["{}ceiling"] = Functions.ceiling;
    			this.functions["{}round"] = Functions.round;
    		};

    		FunctionResolver.prototype.addFunction = function(ns, ln, f) {
    			this.functions["{" + ns + "}" + ln] = f;
    		};

    		FunctionResolver.getFunctionFromContext = function(qName, context) {
    		    var parts = Utilities.resolveQName(qName, context.namespaceResolver, context.contextNode, false);

    		    if (parts[0] === null) {
    		        throw new Error("Cannot resolve QName " + name);
    		    }

    		    return context.functionResolver.getFunction(parts[1], parts[0]);
    		};

    		FunctionResolver.prototype.getFunction = function(localName, namespace) {
    			return this.functions["{" + namespace + "}" + localName];
    		};

    		// NamespaceResolver /////////////////////////////////////////////////////////

    		NamespaceResolver.prototype = new Object();
    		NamespaceResolver.prototype.constructor = NamespaceResolver;
    		NamespaceResolver.superclass = Object.prototype;

    		function NamespaceResolver() {
    		}

    		NamespaceResolver.prototype.getNamespace = function(prefix, n) {
    			if (prefix == "xml") {
    				return XPath.XML_NAMESPACE_URI;
    			} else if (prefix == "xmlns") {
    				return XPath.XMLNS_NAMESPACE_URI;
    			}
    			if (n.nodeType == 9 /*Node.DOCUMENT_NODE*/) {
    				n = n.documentElement;
    			} else if (n.nodeType == 2 /*Node.ATTRIBUTE_NODE*/) {
    				n = PathExpr.prototype.getOwnerElement(n);
    			} else if (n.nodeType != 1 /*Node.ELEMENT_NODE*/) {
    				n = n.parentNode;
    			}
    			while (n != null && n.nodeType == 1 /*Node.ELEMENT_NODE*/) {
    				var nnm = n.attributes;
    				for (var i = 0; i < nnm.length; i++) {
    					var a = nnm.item(i);
    					var aname = a.name || a.nodeName;
    					if ((aname === "xmlns" && prefix === "")
    							|| aname === "xmlns:" + prefix) {
    						return String(a.value || a.nodeValue);
    					}
    				}
    				n = n.parentNode;
    			}
    			return null;
    		};

    		// Functions /////////////////////////////////////////////////////////////////

    		var Functions = new Object();

    		Functions.last = function() {
    			var c = arguments[0];
    			if (arguments.length != 1) {
    				throw new Error("Function last expects ()");
    			}
    			return new XNumber(c.contextSize);
    		};

    		Functions.position = function() {
    			var c = arguments[0];
    			if (arguments.length != 1) {
    				throw new Error("Function position expects ()");
    			}
    			return new XNumber(c.contextPosition);
    		};

    		Functions.count = function() {
    			var c = arguments[0];
    			var ns;
    			if (arguments.length != 2 || !Utilities.instance_of(ns = arguments[1].evaluate(c), XNodeSet)) {
    				throw new Error("Function count expects (node-set)");
    			}
    			return new XNumber(ns.size);
    		};

    		Functions.id = function() {
    			var c = arguments[0];
    			var id;
    			if (arguments.length != 2) {
    				throw new Error("Function id expects (object)");
    			}
    			id = arguments[1].evaluate(c);
    			if (Utilities.instance_of(id, XNodeSet)) {
    				id = id.toArray().join(" ");
    			} else {
    				id = id.stringValue();
    			}
    			var ids = id.split(/[\x0d\x0a\x09\x20]+/);
    			var ns = new XNodeSet();
    			var doc = c.contextNode.nodeType == 9 /*Node.DOCUMENT_NODE*/
    					? c.contextNode
    					: c.contextNode.ownerDocument;
    			for (var i = 0; i < ids.length; i++) {
    				var n;
    				if (doc.getElementById) {
    					n = doc.getElementById(ids[i]);
    				} else {
    					n = Utilities.getElementById(doc, ids[i]);
    				}
    				if (n != null) {
    					ns.add(n);
    				}
    			}
    			return ns;
    		};

    		Functions.localName = function() {
    			var c = arguments[0];
    			var n;
    			if (arguments.length == 1) {
    				n = c.contextNode;
    			} else if (arguments.length == 2) {
    				n = arguments[1].evaluate(c).first();
    			} else {
    				throw new Error("Function local-name expects (node-set?)");
    			}
    			if (n == null) {
    				return new XString("");
    			}

    			return new XString(n.localName ||     //  standard elements and attributes
    			                   n.baseName  ||     //  IE
    							   n.target    ||     //  processing instructions
    		                       n.nodeName  ||     //  DOM1 elements
    							   "");               //  fallback
    		};

    		Functions.namespaceURI = function() {
    			var c = arguments[0];
    			var n;
    			if (arguments.length == 1) {
    				n = c.contextNode;
    			} else if (arguments.length == 2) {
    				n = arguments[1].evaluate(c).first();
    			} else {
    				throw new Error("Function namespace-uri expects (node-set?)");
    			}
    			if (n == null) {
    				return new XString("");
    			}
    			return new XString(n.namespaceURI);
    		};

    		Functions.name = function() {
    			var c = arguments[0];
    			var n;
    			if (arguments.length == 1) {
    				n = c.contextNode;
    			} else if (arguments.length == 2) {
    				n = arguments[1].evaluate(c).first();
    			} else {
    				throw new Error("Function name expects (node-set?)");
    			}
    			if (n == null) {
    				return new XString("");
    			}
    			if (n.nodeType == 1 /*Node.ELEMENT_NODE*/) {
    				return new XString(n.nodeName);
    			} else if (n.nodeType == 2 /*Node.ATTRIBUTE_NODE*/) {
    				return new XString(n.name || n.nodeName);
    			} else if (n.nodeType === 7 /*Node.PROCESSING_INSTRUCTION_NODE*/) {
    			    return new XString(n.target || n.nodeName);
    			} else if (n.localName == null) {
    				return new XString("");
    			} else {
    				return new XString(n.localName);
    			}
    		};

    		Functions.string = function() {
    			var c = arguments[0];
    			if (arguments.length == 1) {
    				return new XString(XNodeSet.prototype.stringForNode(c.contextNode));
    			} else if (arguments.length == 2) {
    				return arguments[1].evaluate(c).string();
    			}
    			throw new Error("Function string expects (object?)");
    		};

    		Functions.concat = function() {
    			var c = arguments[0];
    			if (arguments.length < 3) {
    				throw new Error("Function concat expects (string, string, string*)");
    			}
    			var s = "";
    			for (var i = 1; i < arguments.length; i++) {
    				s += arguments[i].evaluate(c).stringValue();
    			}
    			return new XString(s);
    		};

    		Functions.startsWith = function() {
    			var c = arguments[0];
    			if (arguments.length != 3) {
    				throw new Error("Function startsWith expects (string, string)");
    			}
    			var s1 = arguments[1].evaluate(c).stringValue();
    			var s2 = arguments[2].evaluate(c).stringValue();
    			return new XBoolean(s1.substring(0, s2.length) == s2);
    		};

    		Functions.contains = function() {
    			var c = arguments[0];
    			if (arguments.length != 3) {
    				throw new Error("Function contains expects (string, string)");
    			}
    			var s1 = arguments[1].evaluate(c).stringValue();
    			var s2 = arguments[2].evaluate(c).stringValue();
    			return new XBoolean(s1.indexOf(s2) !== -1);
    		};

    		Functions.substringBefore = function() {
    			var c = arguments[0];
    			if (arguments.length != 3) {
    				throw new Error("Function substring-before expects (string, string)");
    			}
    			var s1 = arguments[1].evaluate(c).stringValue();
    			var s2 = arguments[2].evaluate(c).stringValue();
    			return new XString(s1.substring(0, s1.indexOf(s2)));
    		};

    		Functions.substringAfter = function() {
    			var c = arguments[0];
    			if (arguments.length != 3) {
    				throw new Error("Function substring-after expects (string, string)");
    			}
    			var s1 = arguments[1].evaluate(c).stringValue();
    			var s2 = arguments[2].evaluate(c).stringValue();
    			if (s2.length == 0) {
    				return new XString(s1);
    			}
    			var i = s1.indexOf(s2);
    			if (i == -1) {
    				return new XString("");
    			}
    			return new XString(s1.substring(i + s2.length));
    		};

    		Functions.substring = function() {
    			var c = arguments[0];
    			if (!(arguments.length == 3 || arguments.length == 4)) {
    				throw new Error("Function substring expects (string, number, number?)");
    			}
    			var s = arguments[1].evaluate(c).stringValue();
    			var n1 = Math.round(arguments[2].evaluate(c).numberValue()) - 1;
    			var n2 = arguments.length == 4 ? n1 + Math.round(arguments[3].evaluate(c).numberValue()) : undefined;
    			return new XString(s.substring(n1, n2));
    		};

    		Functions.stringLength = function() {
    			var c = arguments[0];
    			var s;
    			if (arguments.length == 1) {
    				s = XNodeSet.prototype.stringForNode(c.contextNode);
    			} else if (arguments.length == 2) {
    				s = arguments[1].evaluate(c).stringValue();
    			} else {
    				throw new Error("Function string-length expects (string?)");
    			}
    			return new XNumber(s.length);
    		};

    		Functions.normalizeSpace = function() {
    			var c = arguments[0];
    			var s;
    			if (arguments.length == 1) {
    				s = XNodeSet.prototype.stringForNode(c.contextNode);
    			} else if (arguments.length == 2) {
    				s = arguments[1].evaluate(c).stringValue();
    			} else {
    				throw new Error("Function normalize-space expects (string?)");
    			}
    			var i = 0;
    			var j = s.length - 1;
    			while (Utilities.isSpace(s.charCodeAt(j))) {
    				j--;
    			}
    			var t = "";
    			while (i <= j && Utilities.isSpace(s.charCodeAt(i))) {
    				i++;
    			}
    			while (i <= j) {
    				if (Utilities.isSpace(s.charCodeAt(i))) {
    					t += " ";
    					while (i <= j && Utilities.isSpace(s.charCodeAt(i))) {
    						i++;
    					}
    				} else {
    					t += s.charAt(i);
    					i++;
    				}
    			}
    			return new XString(t);
    		};

    		Functions.translate = function() {
    			var c = arguments[0];
    			if (arguments.length != 4) {
    				throw new Error("Function translate expects (string, string, string)");
    			}
    			var s1 = arguments[1].evaluate(c).stringValue();
    			var s2 = arguments[2].evaluate(c).stringValue();
    			var s3 = arguments[3].evaluate(c).stringValue();
    			var map = [];
    			for (var i = 0; i < s2.length; i++) {
    				var j = s2.charCodeAt(i);
    				if (map[j] == undefined) {
    					var k = i > s3.length ? "" : s3.charAt(i);
    					map[j] = k;
    				}
    			}
    			var t = "";
    			for (var i = 0; i < s1.length; i++) {
    				var c = s1.charCodeAt(i);
    				var r = map[c];
    				if (r == undefined) {
    					t += s1.charAt(i);
    				} else {
    					t += r;
    				}
    			}
    			return new XString(t);
    		};

    		Functions.boolean_ = function() {
    			var c = arguments[0];
    			if (arguments.length != 2) {
    				throw new Error("Function boolean expects (object)");
    			}
    			return arguments[1].evaluate(c).bool();
    		};

    		Functions.not = function() {
    			var c = arguments[0];
    			if (arguments.length != 2) {
    				throw new Error("Function not expects (object)");
    			}
    			return arguments[1].evaluate(c).bool().not();
    		};

    		Functions.true_ = function() {
    			if (arguments.length != 1) {
    				throw new Error("Function true expects ()");
    			}
    			return new XBoolean(true);
    		};

    		Functions.false_ = function() {
    			if (arguments.length != 1) {
    				throw new Error("Function false expects ()");
    			}
    			return new XBoolean(false);
    		};

    		Functions.lang = function() {
    			var c = arguments[0];
    			if (arguments.length != 2) {
    				throw new Error("Function lang expects (string)");
    			}
    			var lang;
    			for (var n = c.contextNode; n != null && n.nodeType != 9 /*Node.DOCUMENT_NODE*/; n = n.parentNode) {
    				var a = n.getAttributeNS(XPath.XML_NAMESPACE_URI, "lang");
    				if (a != null) {
    					lang = String(a);
    					break;
    				}
    			}
    			if (lang == null) {
    				return new XBoolean(false);
    			}
    			var s = arguments[1].evaluate(c).stringValue();
    			return new XBoolean(lang.substring(0, s.length) == s
    						&& (lang.length == s.length || lang.charAt(s.length) == '-'));
    		};

    		Functions.number = function() {
    			var c = arguments[0];
    			if (!(arguments.length == 1 || arguments.length == 2)) {
    				throw new Error("Function number expects (object?)");
    			}
    			if (arguments.length == 1) {
    				return new XNumber(XNodeSet.prototype.stringForNode(c.contextNode));
    			}
    			return arguments[1].evaluate(c).number();
    		};

    		Functions.sum = function() {
    			var c = arguments[0];
    			var ns;
    			if (arguments.length != 2 || !Utilities.instance_of((ns = arguments[1].evaluate(c)), XNodeSet)) {
    				throw new Error("Function sum expects (node-set)");
    			}
    			ns = ns.toUnsortedArray();
    			var n = 0;
    			for (var i = 0; i < ns.length; i++) {
    				n += new XNumber(XNodeSet.prototype.stringForNode(ns[i])).numberValue();
    			}
    			return new XNumber(n);
    		};

    		Functions.floor = function() {
    			var c = arguments[0];
    			if (arguments.length != 2) {
    				throw new Error("Function floor expects (number)");
    			}
    			return new XNumber(Math.floor(arguments[1].evaluate(c).numberValue()));
    		};

    		Functions.ceiling = function() {
    			var c = arguments[0];
    			if (arguments.length != 2) {
    				throw new Error("Function ceiling expects (number)");
    			}
    			return new XNumber(Math.ceil(arguments[1].evaluate(c).numberValue()));
    		};

    		Functions.round = function() {
    			var c = arguments[0];
    			if (arguments.length != 2) {
    				throw new Error("Function round expects (number)");
    			}
    			return new XNumber(Math.round(arguments[1].evaluate(c).numberValue()));
    		};

    		// Utilities /////////////////////////////////////////////////////////////////

    		var Utilities = new Object();

    		Utilities.isAttribute = function (val) {
    		    return val && (val.nodeType === 2 || val.ownerElement);
    		};

    		Utilities.splitQName = function(qn) {
    			var i = qn.indexOf(":");
    			if (i == -1) {
    				return [ null, qn ];
    			}
    			return [ qn.substring(0, i), qn.substring(i + 1) ];
    		};

    		Utilities.resolveQName = function(qn, nr, n, useDefault) {
    			var parts = Utilities.splitQName(qn);
    			if (parts[0] != null) {
    				parts[0] = nr.getNamespace(parts[0], n);
    			} else {
    				if (useDefault) {
    					parts[0] = nr.getNamespace("", n);
    					if (parts[0] == null) {
    						parts[0] = "";
    					}
    				} else {
    					parts[0] = "";
    				}
    			}
    			return parts;
    		};

    		Utilities.isSpace = function(c) {
    			return c == 0x9 || c == 0xd || c == 0xa || c == 0x20;
    		};

    		Utilities.isLetter = function(c) {
    			return c >= 0x0041 && c <= 0x005A ||
    				c >= 0x0061 && c <= 0x007A ||
    				c >= 0x00C0 && c <= 0x00D6 ||
    				c >= 0x00D8 && c <= 0x00F6 ||
    				c >= 0x00F8 && c <= 0x00FF ||
    				c >= 0x0100 && c <= 0x0131 ||
    				c >= 0x0134 && c <= 0x013E ||
    				c >= 0x0141 && c <= 0x0148 ||
    				c >= 0x014A && c <= 0x017E ||
    				c >= 0x0180 && c <= 0x01C3 ||
    				c >= 0x01CD && c <= 0x01F0 ||
    				c >= 0x01F4 && c <= 0x01F5 ||
    				c >= 0x01FA && c <= 0x0217 ||
    				c >= 0x0250 && c <= 0x02A8 ||
    				c >= 0x02BB && c <= 0x02C1 ||
    				c == 0x0386 ||
    				c >= 0x0388 && c <= 0x038A ||
    				c == 0x038C ||
    				c >= 0x038E && c <= 0x03A1 ||
    				c >= 0x03A3 && c <= 0x03CE ||
    				c >= 0x03D0 && c <= 0x03D6 ||
    				c == 0x03DA ||
    				c == 0x03DC ||
    				c == 0x03DE ||
    				c == 0x03E0 ||
    				c >= 0x03E2 && c <= 0x03F3 ||
    				c >= 0x0401 && c <= 0x040C ||
    				c >= 0x040E && c <= 0x044F ||
    				c >= 0x0451 && c <= 0x045C ||
    				c >= 0x045E && c <= 0x0481 ||
    				c >= 0x0490 && c <= 0x04C4 ||
    				c >= 0x04C7 && c <= 0x04C8 ||
    				c >= 0x04CB && c <= 0x04CC ||
    				c >= 0x04D0 && c <= 0x04EB ||
    				c >= 0x04EE && c <= 0x04F5 ||
    				c >= 0x04F8 && c <= 0x04F9 ||
    				c >= 0x0531 && c <= 0x0556 ||
    				c == 0x0559 ||
    				c >= 0x0561 && c <= 0x0586 ||
    				c >= 0x05D0 && c <= 0x05EA ||
    				c >= 0x05F0 && c <= 0x05F2 ||
    				c >= 0x0621 && c <= 0x063A ||
    				c >= 0x0641 && c <= 0x064A ||
    				c >= 0x0671 && c <= 0x06B7 ||
    				c >= 0x06BA && c <= 0x06BE ||
    				c >= 0x06C0 && c <= 0x06CE ||
    				c >= 0x06D0 && c <= 0x06D3 ||
    				c == 0x06D5 ||
    				c >= 0x06E5 && c <= 0x06E6 ||
    				c >= 0x0905 && c <= 0x0939 ||
    				c == 0x093D ||
    				c >= 0x0958 && c <= 0x0961 ||
    				c >= 0x0985 && c <= 0x098C ||
    				c >= 0x098F && c <= 0x0990 ||
    				c >= 0x0993 && c <= 0x09A8 ||
    				c >= 0x09AA && c <= 0x09B0 ||
    				c == 0x09B2 ||
    				c >= 0x09B6 && c <= 0x09B9 ||
    				c >= 0x09DC && c <= 0x09DD ||
    				c >= 0x09DF && c <= 0x09E1 ||
    				c >= 0x09F0 && c <= 0x09F1 ||
    				c >= 0x0A05 && c <= 0x0A0A ||
    				c >= 0x0A0F && c <= 0x0A10 ||
    				c >= 0x0A13 && c <= 0x0A28 ||
    				c >= 0x0A2A && c <= 0x0A30 ||
    				c >= 0x0A32 && c <= 0x0A33 ||
    				c >= 0x0A35 && c <= 0x0A36 ||
    				c >= 0x0A38 && c <= 0x0A39 ||
    				c >= 0x0A59 && c <= 0x0A5C ||
    				c == 0x0A5E ||
    				c >= 0x0A72 && c <= 0x0A74 ||
    				c >= 0x0A85 && c <= 0x0A8B ||
    				c == 0x0A8D ||
    				c >= 0x0A8F && c <= 0x0A91 ||
    				c >= 0x0A93 && c <= 0x0AA8 ||
    				c >= 0x0AAA && c <= 0x0AB0 ||
    				c >= 0x0AB2 && c <= 0x0AB3 ||
    				c >= 0x0AB5 && c <= 0x0AB9 ||
    				c == 0x0ABD ||
    				c == 0x0AE0 ||
    				c >= 0x0B05 && c <= 0x0B0C ||
    				c >= 0x0B0F && c <= 0x0B10 ||
    				c >= 0x0B13 && c <= 0x0B28 ||
    				c >= 0x0B2A && c <= 0x0B30 ||
    				c >= 0x0B32 && c <= 0x0B33 ||
    				c >= 0x0B36 && c <= 0x0B39 ||
    				c == 0x0B3D ||
    				c >= 0x0B5C && c <= 0x0B5D ||
    				c >= 0x0B5F && c <= 0x0B61 ||
    				c >= 0x0B85 && c <= 0x0B8A ||
    				c >= 0x0B8E && c <= 0x0B90 ||
    				c >= 0x0B92 && c <= 0x0B95 ||
    				c >= 0x0B99 && c <= 0x0B9A ||
    				c == 0x0B9C ||
    				c >= 0x0B9E && c <= 0x0B9F ||
    				c >= 0x0BA3 && c <= 0x0BA4 ||
    				c >= 0x0BA8 && c <= 0x0BAA ||
    				c >= 0x0BAE && c <= 0x0BB5 ||
    				c >= 0x0BB7 && c <= 0x0BB9 ||
    				c >= 0x0C05 && c <= 0x0C0C ||
    				c >= 0x0C0E && c <= 0x0C10 ||
    				c >= 0x0C12 && c <= 0x0C28 ||
    				c >= 0x0C2A && c <= 0x0C33 ||
    				c >= 0x0C35 && c <= 0x0C39 ||
    				c >= 0x0C60 && c <= 0x0C61 ||
    				c >= 0x0C85 && c <= 0x0C8C ||
    				c >= 0x0C8E && c <= 0x0C90 ||
    				c >= 0x0C92 && c <= 0x0CA8 ||
    				c >= 0x0CAA && c <= 0x0CB3 ||
    				c >= 0x0CB5 && c <= 0x0CB9 ||
    				c == 0x0CDE ||
    				c >= 0x0CE0 && c <= 0x0CE1 ||
    				c >= 0x0D05 && c <= 0x0D0C ||
    				c >= 0x0D0E && c <= 0x0D10 ||
    				c >= 0x0D12 && c <= 0x0D28 ||
    				c >= 0x0D2A && c <= 0x0D39 ||
    				c >= 0x0D60 && c <= 0x0D61 ||
    				c >= 0x0E01 && c <= 0x0E2E ||
    				c == 0x0E30 ||
    				c >= 0x0E32 && c <= 0x0E33 ||
    				c >= 0x0E40 && c <= 0x0E45 ||
    				c >= 0x0E81 && c <= 0x0E82 ||
    				c == 0x0E84 ||
    				c >= 0x0E87 && c <= 0x0E88 ||
    				c == 0x0E8A ||
    				c == 0x0E8D ||
    				c >= 0x0E94 && c <= 0x0E97 ||
    				c >= 0x0E99 && c <= 0x0E9F ||
    				c >= 0x0EA1 && c <= 0x0EA3 ||
    				c == 0x0EA5 ||
    				c == 0x0EA7 ||
    				c >= 0x0EAA && c <= 0x0EAB ||
    				c >= 0x0EAD && c <= 0x0EAE ||
    				c == 0x0EB0 ||
    				c >= 0x0EB2 && c <= 0x0EB3 ||
    				c == 0x0EBD ||
    				c >= 0x0EC0 && c <= 0x0EC4 ||
    				c >= 0x0F40 && c <= 0x0F47 ||
    				c >= 0x0F49 && c <= 0x0F69 ||
    				c >= 0x10A0 && c <= 0x10C5 ||
    				c >= 0x10D0 && c <= 0x10F6 ||
    				c == 0x1100 ||
    				c >= 0x1102 && c <= 0x1103 ||
    				c >= 0x1105 && c <= 0x1107 ||
    				c == 0x1109 ||
    				c >= 0x110B && c <= 0x110C ||
    				c >= 0x110E && c <= 0x1112 ||
    				c == 0x113C ||
    				c == 0x113E ||
    				c == 0x1140 ||
    				c == 0x114C ||
    				c == 0x114E ||
    				c == 0x1150 ||
    				c >= 0x1154 && c <= 0x1155 ||
    				c == 0x1159 ||
    				c >= 0x115F && c <= 0x1161 ||
    				c == 0x1163 ||
    				c == 0x1165 ||
    				c == 0x1167 ||
    				c == 0x1169 ||
    				c >= 0x116D && c <= 0x116E ||
    				c >= 0x1172 && c <= 0x1173 ||
    				c == 0x1175 ||
    				c == 0x119E ||
    				c == 0x11A8 ||
    				c == 0x11AB ||
    				c >= 0x11AE && c <= 0x11AF ||
    				c >= 0x11B7 && c <= 0x11B8 ||
    				c == 0x11BA ||
    				c >= 0x11BC && c <= 0x11C2 ||
    				c == 0x11EB ||
    				c == 0x11F0 ||
    				c == 0x11F9 ||
    				c >= 0x1E00 && c <= 0x1E9B ||
    				c >= 0x1EA0 && c <= 0x1EF9 ||
    				c >= 0x1F00 && c <= 0x1F15 ||
    				c >= 0x1F18 && c <= 0x1F1D ||
    				c >= 0x1F20 && c <= 0x1F45 ||
    				c >= 0x1F48 && c <= 0x1F4D ||
    				c >= 0x1F50 && c <= 0x1F57 ||
    				c == 0x1F59 ||
    				c == 0x1F5B ||
    				c == 0x1F5D ||
    				c >= 0x1F5F && c <= 0x1F7D ||
    				c >= 0x1F80 && c <= 0x1FB4 ||
    				c >= 0x1FB6 && c <= 0x1FBC ||
    				c == 0x1FBE ||
    				c >= 0x1FC2 && c <= 0x1FC4 ||
    				c >= 0x1FC6 && c <= 0x1FCC ||
    				c >= 0x1FD0 && c <= 0x1FD3 ||
    				c >= 0x1FD6 && c <= 0x1FDB ||
    				c >= 0x1FE0 && c <= 0x1FEC ||
    				c >= 0x1FF2 && c <= 0x1FF4 ||
    				c >= 0x1FF6 && c <= 0x1FFC ||
    				c == 0x2126 ||
    				c >= 0x212A && c <= 0x212B ||
    				c == 0x212E ||
    				c >= 0x2180 && c <= 0x2182 ||
    				c >= 0x3041 && c <= 0x3094 ||
    				c >= 0x30A1 && c <= 0x30FA ||
    				c >= 0x3105 && c <= 0x312C ||
    				c >= 0xAC00 && c <= 0xD7A3 ||
    				c >= 0x4E00 && c <= 0x9FA5 ||
    				c == 0x3007 ||
    				c >= 0x3021 && c <= 0x3029;
    		};

    		Utilities.isNCNameChar = function(c) {
    			return c >= 0x0030 && c <= 0x0039
    				|| c >= 0x0660 && c <= 0x0669
    				|| c >= 0x06F0 && c <= 0x06F9
    				|| c >= 0x0966 && c <= 0x096F
    				|| c >= 0x09E6 && c <= 0x09EF
    				|| c >= 0x0A66 && c <= 0x0A6F
    				|| c >= 0x0AE6 && c <= 0x0AEF
    				|| c >= 0x0B66 && c <= 0x0B6F
    				|| c >= 0x0BE7 && c <= 0x0BEF
    				|| c >= 0x0C66 && c <= 0x0C6F
    				|| c >= 0x0CE6 && c <= 0x0CEF
    				|| c >= 0x0D66 && c <= 0x0D6F
    				|| c >= 0x0E50 && c <= 0x0E59
    				|| c >= 0x0ED0 && c <= 0x0ED9
    				|| c >= 0x0F20 && c <= 0x0F29
    				|| c == 0x002E
    				|| c == 0x002D
    				|| c == 0x005F
    				|| Utilities.isLetter(c)
    				|| c >= 0x0300 && c <= 0x0345
    				|| c >= 0x0360 && c <= 0x0361
    				|| c >= 0x0483 && c <= 0x0486
    				|| c >= 0x0591 && c <= 0x05A1
    				|| c >= 0x05A3 && c <= 0x05B9
    				|| c >= 0x05BB && c <= 0x05BD
    				|| c == 0x05BF
    				|| c >= 0x05C1 && c <= 0x05C2
    				|| c == 0x05C4
    				|| c >= 0x064B && c <= 0x0652
    				|| c == 0x0670
    				|| c >= 0x06D6 && c <= 0x06DC
    				|| c >= 0x06DD && c <= 0x06DF
    				|| c >= 0x06E0 && c <= 0x06E4
    				|| c >= 0x06E7 && c <= 0x06E8
    				|| c >= 0x06EA && c <= 0x06ED
    				|| c >= 0x0901 && c <= 0x0903
    				|| c == 0x093C
    				|| c >= 0x093E && c <= 0x094C
    				|| c == 0x094D
    				|| c >= 0x0951 && c <= 0x0954
    				|| c >= 0x0962 && c <= 0x0963
    				|| c >= 0x0981 && c <= 0x0983
    				|| c == 0x09BC
    				|| c == 0x09BE
    				|| c == 0x09BF
    				|| c >= 0x09C0 && c <= 0x09C4
    				|| c >= 0x09C7 && c <= 0x09C8
    				|| c >= 0x09CB && c <= 0x09CD
    				|| c == 0x09D7
    				|| c >= 0x09E2 && c <= 0x09E3
    				|| c == 0x0A02
    				|| c == 0x0A3C
    				|| c == 0x0A3E
    				|| c == 0x0A3F
    				|| c >= 0x0A40 && c <= 0x0A42
    				|| c >= 0x0A47 && c <= 0x0A48
    				|| c >= 0x0A4B && c <= 0x0A4D
    				|| c >= 0x0A70 && c <= 0x0A71
    				|| c >= 0x0A81 && c <= 0x0A83
    				|| c == 0x0ABC
    				|| c >= 0x0ABE && c <= 0x0AC5
    				|| c >= 0x0AC7 && c <= 0x0AC9
    				|| c >= 0x0ACB && c <= 0x0ACD
    				|| c >= 0x0B01 && c <= 0x0B03
    				|| c == 0x0B3C
    				|| c >= 0x0B3E && c <= 0x0B43
    				|| c >= 0x0B47 && c <= 0x0B48
    				|| c >= 0x0B4B && c <= 0x0B4D
    				|| c >= 0x0B56 && c <= 0x0B57
    				|| c >= 0x0B82 && c <= 0x0B83
    				|| c >= 0x0BBE && c <= 0x0BC2
    				|| c >= 0x0BC6 && c <= 0x0BC8
    				|| c >= 0x0BCA && c <= 0x0BCD
    				|| c == 0x0BD7
    				|| c >= 0x0C01 && c <= 0x0C03
    				|| c >= 0x0C3E && c <= 0x0C44
    				|| c >= 0x0C46 && c <= 0x0C48
    				|| c >= 0x0C4A && c <= 0x0C4D
    				|| c >= 0x0C55 && c <= 0x0C56
    				|| c >= 0x0C82 && c <= 0x0C83
    				|| c >= 0x0CBE && c <= 0x0CC4
    				|| c >= 0x0CC6 && c <= 0x0CC8
    				|| c >= 0x0CCA && c <= 0x0CCD
    				|| c >= 0x0CD5 && c <= 0x0CD6
    				|| c >= 0x0D02 && c <= 0x0D03
    				|| c >= 0x0D3E && c <= 0x0D43
    				|| c >= 0x0D46 && c <= 0x0D48
    				|| c >= 0x0D4A && c <= 0x0D4D
    				|| c == 0x0D57
    				|| c == 0x0E31
    				|| c >= 0x0E34 && c <= 0x0E3A
    				|| c >= 0x0E47 && c <= 0x0E4E
    				|| c == 0x0EB1
    				|| c >= 0x0EB4 && c <= 0x0EB9
    				|| c >= 0x0EBB && c <= 0x0EBC
    				|| c >= 0x0EC8 && c <= 0x0ECD
    				|| c >= 0x0F18 && c <= 0x0F19
    				|| c == 0x0F35
    				|| c == 0x0F37
    				|| c == 0x0F39
    				|| c == 0x0F3E
    				|| c == 0x0F3F
    				|| c >= 0x0F71 && c <= 0x0F84
    				|| c >= 0x0F86 && c <= 0x0F8B
    				|| c >= 0x0F90 && c <= 0x0F95
    				|| c == 0x0F97
    				|| c >= 0x0F99 && c <= 0x0FAD
    				|| c >= 0x0FB1 && c <= 0x0FB7
    				|| c == 0x0FB9
    				|| c >= 0x20D0 && c <= 0x20DC
    				|| c == 0x20E1
    				|| c >= 0x302A && c <= 0x302F
    				|| c == 0x3099
    				|| c == 0x309A
    				|| c == 0x00B7
    				|| c == 0x02D0
    				|| c == 0x02D1
    				|| c == 0x0387
    				|| c == 0x0640
    				|| c == 0x0E46
    				|| c == 0x0EC6
    				|| c == 0x3005
    				|| c >= 0x3031 && c <= 0x3035
    				|| c >= 0x309D && c <= 0x309E
    				|| c >= 0x30FC && c <= 0x30FE;
    		};

    		Utilities.coalesceText = function(n) {
    			for (var m = n.firstChild; m != null; m = m.nextSibling) {
    				if (m.nodeType == 3 /*Node.TEXT_NODE*/ || m.nodeType == 4 /*Node.CDATA_SECTION_NODE*/) {
    					var s = m.nodeValue;
    					var first = m;
    					m = m.nextSibling;
    					while (m != null && (m.nodeType == 3 /*Node.TEXT_NODE*/ || m.nodeType == 4 /*Node.CDATA_SECTION_NODE*/)) {
    						s += m.nodeValue;
    						var del = m;
    						m = m.nextSibling;
    						del.parentNode.removeChild(del);
    					}
    					if (first.nodeType == 4 /*Node.CDATA_SECTION_NODE*/) {
    						var p = first.parentNode;
    						if (first.nextSibling == null) {
    							p.removeChild(first);
    							p.appendChild(p.ownerDocument.createTextNode(s));
    						} else {
    							var next = first.nextSibling;
    							p.removeChild(first);
    							p.insertBefore(p.ownerDocument.createTextNode(s), next);
    						}
    					} else {
    						first.nodeValue = s;
    					}
    					if (m == null) {
    						break;
    					}
    				} else if (m.nodeType == 1 /*Node.ELEMENT_NODE*/) {
    					Utilities.coalesceText(m);
    				}
    			}
    		};

    		Utilities.instance_of = function(o, c) {
    			while (o != null) {
    				if (o.constructor === c) {
    					return true;
    				}
    				if (o === Object) {
    					return false;
    				}
    				o = o.constructor.superclass;
    			}
    			return false;
    		};

    		Utilities.getElementById = function(n, id) {
    			// Note that this does not check the DTD to check for actual
    			// attributes of type ID, so this may be a bit wrong.
    			if (n.nodeType == 1 /*Node.ELEMENT_NODE*/) {
    				if (n.getAttribute("id") == id
    						|| n.getAttributeNS(null, "id") == id) {
    					return n;
    				}
    			}
    			for (var m = n.firstChild; m != null; m = m.nextSibling) {
    				var res = Utilities.getElementById(m, id);
    				if (res != null) {
    					return res;
    				}
    			}
    			return null;
    		};

    		// XPathException ////////////////////////////////////////////////////////////

    		var XPathException = (function () {
    		    function getMessage(code, exception) {
    		        var msg = exception ? ": " + exception.toString() : "";
    		        switch (code) {
    		            case XPathException.INVALID_EXPRESSION_ERR:
    		                return "Invalid expression" + msg;
    		            case XPathException.TYPE_ERR:
    		                return "Type error" + msg;
    		        }
    		        return null;
    		    }

    		    function XPathException(code, error, message) {
    		        var err = Error.call(this, getMessage(code, error) || message);

    		        err.code = code;
    		        err.exception = error;

    		        return err;
    		    }

    		    XPathException.prototype = Object.create(Error.prototype);
    		    XPathException.prototype.constructor = XPathException;
    		    XPathException.superclass = Error;

    		    XPathException.prototype.toString = function() {
    		        return this.message;
    		    };

    		    XPathException.fromMessage = function(message, error) {
    		        return new XPathException(null, error, message);
    		    };

    		    XPathException.INVALID_EXPRESSION_ERR = 51;
    		    XPathException.TYPE_ERR = 52;

    		    return XPathException;
    		})();

    		// XPathExpression ///////////////////////////////////////////////////////////

    		XPathExpression.prototype = {};
    		XPathExpression.prototype.constructor = XPathExpression;
    		XPathExpression.superclass = Object.prototype;

    		function XPathExpression(e, r, p) {
    			this.xpath = p.parse(e);
    			this.context = new XPathContext();
    			this.context.namespaceResolver = new XPathNSResolverWrapper(r);
    		}

    		XPathExpression.prototype.evaluate = function(n, t, res) {
    			this.context.expressionContextNode = n;
    			var result = this.xpath.evaluate(this.context);
    			return new XPathResult(result, t);
    		};

    		// XPathNSResolverWrapper ////////////////////////////////////////////////////

    		XPathNSResolverWrapper.prototype = {};
    		XPathNSResolverWrapper.prototype.constructor = XPathNSResolverWrapper;
    		XPathNSResolverWrapper.superclass = Object.prototype;

    		function XPathNSResolverWrapper(r) {
    			this.xpathNSResolver = r;
    		}

    		XPathNSResolverWrapper.prototype.getNamespace = function(prefix, n) {
    		    if (this.xpathNSResolver == null) {
    		        return null;
    		    }
    			return this.xpathNSResolver.lookupNamespaceURI(prefix);
    		};

    		// NodeXPathNSResolver ///////////////////////////////////////////////////////

    		NodeXPathNSResolver.prototype = {};
    		NodeXPathNSResolver.prototype.constructor = NodeXPathNSResolver;
    		NodeXPathNSResolver.superclass = Object.prototype;

    		function NodeXPathNSResolver(n) {
    			this.node = n;
    			this.namespaceResolver = new NamespaceResolver();
    		}

    		NodeXPathNSResolver.prototype.lookupNamespaceURI = function(prefix) {
    			return this.namespaceResolver.getNamespace(prefix, this.node);
    		};

    		// XPathResult ///////////////////////////////////////////////////////////////

    		XPathResult.prototype = {};
    		XPathResult.prototype.constructor = XPathResult;
    		XPathResult.superclass = Object.prototype;

    		function XPathResult(v, t) {
    			if (t == XPathResult.ANY_TYPE) {
    				if (v.constructor === XString) {
    					t = XPathResult.STRING_TYPE;
    				} else if (v.constructor === XNumber) {
    					t = XPathResult.NUMBER_TYPE;
    				} else if (v.constructor === XBoolean) {
    					t = XPathResult.BOOLEAN_TYPE;
    				} else if (v.constructor === XNodeSet) {
    					t = XPathResult.UNORDERED_NODE_ITERATOR_TYPE;
    				}
    			}
    			this.resultType = t;
    			switch (t) {
    				case XPathResult.NUMBER_TYPE:
    					this.numberValue = v.numberValue();
    					return;
    				case XPathResult.STRING_TYPE:
    					this.stringValue = v.stringValue();
    					return;
    				case XPathResult.BOOLEAN_TYPE:
    					this.booleanValue = v.booleanValue();
    					return;
    				case XPathResult.ANY_UNORDERED_NODE_TYPE:
    				case XPathResult.FIRST_ORDERED_NODE_TYPE:
    					if (v.constructor === XNodeSet) {
    						this.singleNodeValue = v.first();
    						return;
    					}
    					break;
    				case XPathResult.UNORDERED_NODE_ITERATOR_TYPE:
    				case XPathResult.ORDERED_NODE_ITERATOR_TYPE:
    					if (v.constructor === XNodeSet) {
    						this.invalidIteratorState = false;
    						this.nodes = v.toArray();
    						this.iteratorIndex = 0;
    						return;
    					}
    					break;
    				case XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE:
    				case XPathResult.ORDERED_NODE_SNAPSHOT_TYPE:
    					if (v.constructor === XNodeSet) {
    						this.nodes = v.toArray();
    						this.snapshotLength = this.nodes.length;
    						return;
    					}
    					break;
    			}
    			throw new XPathException(XPathException.TYPE_ERR);
    		}
    		XPathResult.prototype.iterateNext = function() {
    			if (this.resultType != XPathResult.UNORDERED_NODE_ITERATOR_TYPE
    					&& this.resultType != XPathResult.ORDERED_NODE_ITERATOR_TYPE) {
    				throw new XPathException(XPathException.TYPE_ERR);
    			}
    			return this.nodes[this.iteratorIndex++];
    		};

    		XPathResult.prototype.snapshotItem = function(i) {
    			if (this.resultType != XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE
    					&& this.resultType != XPathResult.ORDERED_NODE_SNAPSHOT_TYPE) {
    				throw new XPathException(XPathException.TYPE_ERR);
    			}
    			return this.nodes[i];
    		};

    		XPathResult.ANY_TYPE = 0;
    		XPathResult.NUMBER_TYPE = 1;
    		XPathResult.STRING_TYPE = 2;
    		XPathResult.BOOLEAN_TYPE = 3;
    		XPathResult.UNORDERED_NODE_ITERATOR_TYPE = 4;
    		XPathResult.ORDERED_NODE_ITERATOR_TYPE = 5;
    		XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE = 6;
    		XPathResult.ORDERED_NODE_SNAPSHOT_TYPE = 7;
    		XPathResult.ANY_UNORDERED_NODE_TYPE = 8;
    		XPathResult.FIRST_ORDERED_NODE_TYPE = 9;

    		// DOM 3 XPath support ///////////////////////////////////////////////////////

    		function installDOM3XPathSupport(doc, p) {
    			doc.createExpression = function(e, r) {
    				try {
    					return new XPathExpression(e, r, p);
    				} catch (e) {
    					throw new XPathException(XPathException.INVALID_EXPRESSION_ERR, e);
    				}
    			};
    			doc.createNSResolver = function(n) {
    				return new NodeXPathNSResolver(n);
    			};
    			doc.evaluate = function(e, cn, r, t, res) {
    				if (t < 0 || t > 9) {
    					throw { code: 0, toString: function() { return "Request type not supported"; } };
    				}
    		        return doc.createExpression(e, r, p).evaluate(cn, t, res);
    			};
    		}
    		// ---------------------------------------------------------------------------

    		// Install DOM 3 XPath support for the current document.
    		try {
    			var shouldInstall = true;
    			try {
    				if (document.implementation
    						&& document.implementation.hasFeature
    						&& document.implementation.hasFeature("XPath", null)) {
    					shouldInstall = false;
    				}
    			} catch (e) {
    			}
    			if (shouldInstall) {
    				installDOM3XPathSupport(document, new XPathParser());
    			}
    		} catch (e) {
    		}

    		// ---------------------------------------------------------------------------
    		// exports for node.js

    		installDOM3XPathSupport(exports, new XPathParser());

    		(function() {
    		    var parser = new XPathParser();

    		    var defaultNSResolver = new NamespaceResolver();
    		    var defaultFunctionResolver = new FunctionResolver();
    		    var defaultVariableResolver = new VariableResolver();

    		    function makeNSResolverFromFunction(func) {
    		        return {
    		            getNamespace: function (prefix, node) {
    		                var ns = func(prefix, node);

    		                return ns || defaultNSResolver.getNamespace(prefix, node);
    		            }
    		        };
    		    }

    		    function makeNSResolverFromObject(obj) {
    		        return makeNSResolverFromFunction(obj.getNamespace.bind(obj));
    		    }

    		    function makeNSResolverFromMap(map) {
    		        return makeNSResolverFromFunction(function (prefix) {
    		            return map[prefix];
    		        });
    		    }

    		    function makeNSResolver(resolver) {
    		        if (resolver && typeof resolver.getNamespace === "function") {
    		            return makeNSResolverFromObject(resolver);
    		        }

    		        if (typeof resolver === "function") {
    		            return makeNSResolverFromFunction(resolver);
    		        }

    		        // assume prefix -> uri mapping
    		        if (typeof resolver === "object") {
    		            return makeNSResolverFromMap(resolver);
    		        }

    		        return defaultNSResolver;
    		    }

    		    /** Converts native JavaScript types to their XPath library equivalent */
    		    function convertValue(value) {
    		        if (value === null ||
    		            typeof value === "undefined" ||
    		            value instanceof XString ||
    		            value instanceof XBoolean ||
    		            value instanceof XNumber ||
    		            value instanceof XNodeSet) {
    		            return value;
    		        }

    		        switch (typeof value) {
    		            case "string": return new XString(value);
    		            case "boolean": return new XBoolean(value);
    		            case "number": return new XNumber(value);
    		        }

    		        // assume node(s)
    		        var ns = new XNodeSet();
    		        ns.addArray([].concat(value));
    		        return ns;
    		    }

    		    function makeEvaluator(func) {
    		        return function (context) {
    		            var args = Array.prototype.slice.call(arguments, 1).map(function (arg) {
    		                return arg.evaluate(context);
    		            });
    		            var result = func.apply(this, [].concat(context, args));
    		            return convertValue(result);
    		        };
    		    }

    		    function makeFunctionResolverFromFunction(func) {
    		        return {
    		            getFunction: function (name, namespace) {
    		                var found = func(name, namespace);
    		                if (found) {
    		                    return makeEvaluator(found);
    		                }
    		                return defaultFunctionResolver.getFunction(name, namespace);
    		            }
    		        };
    		    }

    		    function makeFunctionResolverFromObject(obj) {
    		        return makeFunctionResolverFromFunction(obj.getFunction.bind(obj));
    		    }

    		    function makeFunctionResolverFromMap(map) {
    		        return makeFunctionResolverFromFunction(function (name) {
    		            return map[name];
    		        });
    		    }

    		    function makeFunctionResolver(resolver) {
    		        if (resolver && typeof resolver.getFunction === "function") {
    		            return makeFunctionResolverFromObject(resolver);
    		        }

    		        if (typeof resolver === "function") {
    		            return makeFunctionResolverFromFunction(resolver);
    		        }

    		        // assume map
    		        if (typeof resolver === "object") {
    		            return makeFunctionResolverFromMap(resolver);
    		        }

    		        return defaultFunctionResolver;
    		    }

    		    function makeVariableResolverFromFunction(func) {
    		        return {
    		            getVariable: function (name, namespace) {
    		                var value = func(name, namespace);
    		                return convertValue(value);
    		            }
    		        };
    		    }

    		    function makeVariableResolver(resolver) {
    		        if (resolver) {
    		            if (typeof resolver.getVariable === "function") {
    		                return makeVariableResolverFromFunction(resolver.getVariable.bind(resolver));
    		            }

    		            if (typeof resolver === "function") {
    		                return makeVariableResolverFromFunction(resolver);
    		            }

    		            // assume map
    		            if (typeof resolver === "object") {
    		                return makeVariableResolverFromFunction(function (name) {
    		                    return resolver[name];
    		                });
    		            }
    		        }

    		        return defaultVariableResolver;
    		    }

    		    function makeContext(options) {
    		        var context = new XPathContext();

    		        if (options) {
    		            context.namespaceResolver = makeNSResolver(options.namespaces);
    		            context.functionResolver = makeFunctionResolver(options.functions);
    		            context.variableResolver = makeVariableResolver(options.variables);
    		            context.expressionContextNode = options.node;
    		        } else {
    		            context.namespaceResolver = defaultNSResolver;
    		        }

    		        return context;
    		    }

    		    function evaluate(parsedExpression, options) {
    		        var context = makeContext(options);

    		        return parsedExpression.evaluate(context);
    		    }

    		    var evaluatorPrototype = {
    		        evaluate: function (options) {
    		            return evaluate(this.expression, options);
    		        }

    		        ,evaluateNumber: function (options) {
    		            return this.evaluate(options).numberValue();
    		        }

    		        ,evaluateString: function (options) {
    		            return this.evaluate(options).stringValue();
    		        }

    		        ,evaluateBoolean: function (options) {
    		            return this.evaluate(options).booleanValue();
    		        }

    		        ,evaluateNodeSet: function (options) {
    		            return this.evaluate(options).nodeset();
    		        }

    		        ,select: function (options) {
    		            return this.evaluateNodeSet(options).toArray()
    		        }

    		        ,select1: function (options) {
    		            return this.select(options)[0];
    		        }
    		    };

    		    function parse(xpath) {
    		        var parsed = parser.parse(xpath);

    		        return Object.create(evaluatorPrototype, {
    		            expression: {
    		                value: parsed
    		            }
    		        });
    		    }

    		    exports.parse = parse;
    		})();

    		exports.XPath = XPath;
    		exports.XPathParser = XPathParser;
    		exports.XPathResult = XPathResult;

    		exports.Step = Step;
    		exports.NodeTest = NodeTest;
    		exports.BarOperation = BarOperation;

    		exports.NamespaceResolver = NamespaceResolver;
    		exports.FunctionResolver = FunctionResolver;
    		exports.VariableResolver = VariableResolver;

    		exports.Utilities = Utilities;

    		exports.XPathContext = XPathContext;
    		exports.XNodeSet = XNodeSet;
    		exports.XBoolean = XBoolean;
    		exports.XString = XString;
    		exports.XNumber = XNumber;

    		// helper
    		exports.select = function(e, doc, single) {
    			return exports.selectWithResolver(e, doc, null, single);
    		};

    		exports.useNamespaces = function(mappings) {
    			var resolver = {
    				mappings: mappings || {},
    				lookupNamespaceURI: function(prefix) {
    					return this.mappings[prefix];
    				}
    			};

    			return function(e, doc, single) {
    				return exports.selectWithResolver(e, doc, resolver, single);
    			};
    		};

    		exports.selectWithResolver = function(e, doc, resolver, single) {
    			var expression = new XPathExpression(e, resolver, new XPathParser());
    			var type = XPathResult.ANY_TYPE;

    			var result = expression.evaluate(doc, type, null);

    			if (result.resultType == XPathResult.STRING_TYPE) {
    				result = result.stringValue;
    			}
    			else if (result.resultType == XPathResult.NUMBER_TYPE) {
    				result = result.numberValue;
    			}
    			else if (result.resultType == XPathResult.BOOLEAN_TYPE) {
    				result = result.booleanValue;
    			}
    			else {
    				result = result.nodes;
    				if (single) {
    					result = result[0];
    				}
    			}

    			return result;
    		};

    		exports.select1 = function(e, doc) {
    			return exports.select(e, doc, true);
    		};

    		// end non-node wrapper
    		})(xpath); 
    	} (xpath));
    	return xpath;
    }

    var operators = {};

    var escapeStringRegexp;
    var hasRequiredEscapeStringRegexp;

    function requireEscapeStringRegexp () {
    	if (hasRequiredEscapeStringRegexp) return escapeStringRegexp;
    	hasRequiredEscapeStringRegexp = 1;

    	var matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;

    	escapeStringRegexp = function (str) {
    		if (typeof str !== 'string') {
    			throw new TypeError('Expected a string');
    		}

    		return str.replace(matchOperatorsRe, '\\$&');
    	};
    	return escapeStringRegexp;
    }

    var hasRequiredOperators;

    function requireOperators () {
    	if (hasRequiredOperators) return operators;
    	hasRequiredOperators = 1;
    	let escRx = requireEscapeStringRegexp()
    	  , operators$1 = [
    	  '\u00A8',
    	  '\u0021',
    	  '\u0022',
    	  '\u0023',
    	  '\u0026',
    	  '\u0028',
    	  '\u0029',
    	  '\u002B',
    	  '\u002C',
    	  '\u002D',
    	  '\u002E',
    	  '\u002F',
    	  '\u003A',
    	  '\u003B',
    	  '\u003C',
    	  '\u003D',
    	  '\u003E',
    	  '\u003F',
    	  '\u0040',
    	  '\u005B',
    	  '\u005C',
    	  '\u005D',
    	  '\u005E',
    	  '\u005F',
    	  '\u0060',
    	  '\u007B',
    	  '\u007C',
    	  '\u007D',
    	  '\u007E',
    	  '\u00A1',
    	  '\u00A6',
    	  '\u00AC',
    	  '\u00AF',
    	  '\u00B0',
    	  '\u00B1',
    	  '\u00B2',
    	  '\u00B3',
    	  '\u00B4',
    	  '\u00B7',
    	  '\u00B9',
    	  '\u00BF',
    	  '\u00D7',
    	  '\u007E',
    	  '\u00F7',
    	  '\u02C7',
    	  '\u02D8',
    	  '\u02D9',
    	  '\u02DC',
    	  '\u02DD',
    	  '\u0300',
    	  '\u0301',
    	  '\u0302',
    	  '\u0303',
    	  '\u0304',
    	  '\u0305',
    	  '\u0306',
    	  '\u0307',
    	  '\u0308',
    	  '\u0309',
    	  '\u030A',
    	  '\u030B',
    	  '\u030C',
    	  '\u030D',
    	  '\u030E',
    	  '\u030F',
    	  '\u0310',
    	  '\u0311',
    	  '\u0312',
    	  '\u0313',
    	  '\u0314',
    	  '\u0315',
    	  '\u0316',
    	  '\u0317',
    	  '\u0318',
    	  '\u0319',
    	  '\u031A',
    	  '\u031B',
    	  '\u031C',
    	  '\u031D',
    	  '\u031E',
    	  '\u031F',
    	  '\u0320',
    	  '\u0321',
    	  '\u0322',
    	  '\u0323',
    	  '\u0324',
    	  '\u0325',
    	  '\u0326',
    	  '\u0327',
    	  '\u0328',
    	  '\u0329',
    	  '\u032A',
    	  '\u032B',
    	  '\u032C',
    	  '\u032D',
    	  '\u032E',
    	  '\u032F',
    	  '\u0330',
    	  '\u0331',
    	  '\u0332',
    	  '\u0333',
    	  '\u0334',
    	  '\u0335',
    	  '\u0336',
    	  '\u0337',
    	  '\u0338',
    	  '\u033F',
    	  '\u2000',
    	  '\u2001',
    	  '\u2002',
    	  '\u2003',
    	  '\u2004',
    	  '\u2005',
    	  '\u2006',
    	  '\u2009',
    	  '\u200A',
    	  '\u2010',
    	  '\u2012',
    	  '\u2013',
    	  '\u2014',
    	  '\u2016',
    	  '\u2020',
    	  '\u2021',
    	  '\u2022',
    	  '\u2024',
    	  '\u2025',
    	  '\u2026',
    	  '\u2032',
    	  '\u2033',
    	  '\u2034',
    	  '\u203C',
    	  '\u2040',
    	  '\u2044',
    	  '\u204E',
    	  '\u204F',
    	  '\u2050',
    	  '\u2057',
    	  '\u2061',
    	  '\u2062',
    	  '\u2063',
    	  '\u2070',
    	  '\u2074',
    	  '\u2075',
    	  '\u2076',
    	  '\u2077',
    	  '\u2078',
    	  '\u2079',
    	  '\u207A',
    	  '\u207B',
    	  '\u207C',
    	  '\u207D',
    	  '\u207E',
    	  '\u2080',
    	  '\u2081',
    	  '\u2082',
    	  '\u2083',
    	  '\u2084',
    	  '\u2085',
    	  '\u2086',
    	  '\u2087',
    	  '\u2088',
    	  '\u2089',
    	  '\u208A',
    	  '\u208B',
    	  '\u208C',
    	  '\u208D',
    	  '\u208E',
    	  '\u20D0',
    	  '\u20D1',
    	  '\u20D2',
    	  '\u20D3',
    	  '\u20D4',
    	  '\u20D5',
    	  '\u20D6',
    	  '\u20D7',
    	  '\u20D8',
    	  '\u20D9',
    	  '\u20DA',
    	  '\u20DB',
    	  '\u20DC',
    	  '\u20DD',
    	  '\u20DE',
    	  '\u20DF',
    	  '\u20E0',
    	  '\u20E1',
    	  '\u20E4',
    	  '\u20E5',
    	  '\u20E6',
    	  '\u20E7',
    	  '\u20E8',
    	  '\u20E9',
    	  '\u20EA',
    	  '\u2140',
    	  '\u2146',
    	  '\u2190',
    	  '\u2191',
    	  '\u2192',
    	  '\u2193',
    	  '\u2194',
    	  '\u2195',
    	  '\u2196',
    	  '\u2197',
    	  '\u2198',
    	  '\u2199',
    	  '\u219A',
    	  '\u219B',
    	  '\u219C',
    	  '\u219D',
    	  '\u219E',
    	  '\u219F',
    	  '\u21A0',
    	  '\u21A1',
    	  '\u21A2',
    	  '\u21A3',
    	  '\u21A4',
    	  '\u21A5',
    	  '\u21A6',
    	  '\u21A7',
    	  '\u21A8',
    	  '\u21A9',
    	  '\u21AA',
    	  '\u21AB',
    	  '\u21AC',
    	  '\u21AD',
    	  '\u21AE',
    	  '\u21AF',
    	  '\u21B0',
    	  '\u21B1',
    	  '\u21B2',
    	  '\u21B3',
    	  '\u21B6',
    	  '\u21B7',
    	  '\u21BA',
    	  '\u21BB',
    	  '\u21BC',
    	  '\u21BD',
    	  '\u21BE',
    	  '\u21BF',
    	  '\u21C0',
    	  '\u21C1',
    	  '\u21C2',
    	  '\u21C3',
    	  '\u21C4',
    	  '\u21C5',
    	  '\u21C6',
    	  '\u21C7',
    	  '\u21C8',
    	  '\u21C9',
    	  '\u21CA',
    	  '\u21CB',
    	  '\u21CC',
    	  '\u21CD',
    	  '\u21CE',
    	  '\u21CF',
    	  '\u21D0',
    	  '\u21D1',
    	  '\u21D2',
    	  '\u21D3',
    	  '\u21D4',
    	  '\u21D5',
    	  '\u21D6',
    	  '\u21D7',
    	  '\u21D8',
    	  '\u21D9',
    	  '\u21DA',
    	  '\u21DB',
    	  '\u21DC',
    	  '\u21DD',
    	  '\u21DE',
    	  '\u21DF',
    	  '\u21E0',
    	  '\u21E1',
    	  '\u21E2',
    	  '\u21E3',
    	  '\u21E4',
    	  '\u21E5',
    	  '\u21E6',
    	  '\u21E7',
    	  '\u21E8',
    	  '\u21E9',
    	  '\u21F3',
    	  '\u21F4',
    	  '\u21F5',
    	  '\u21F6',
    	  '\u21F7',
    	  '\u21F8',
    	  '\u21F9',
    	  '\u21FA',
    	  '\u21FB',
    	  '\u21FC',
    	  '\u21FD',
    	  '\u21FE',
    	  '\u21FF',
    	  '\u2200',
    	  '\u2201',
    	  '\u2202',
    	  '\u2203',
    	  '\u2204',
    	  '\u2206',
    	  '\u2207',
    	  '\u2208',
    	  '\u2209',
    	  '\u220A',
    	  '\u220B',
    	  '\u220C',
    	  '\u220D',
    	  '\u220F',
    	  '\u2210',
    	  '\u2211',
    	  '\u2212',
    	  '\u2213',
    	  '\u2214',
    	  '\u2215',
    	  '\u2216',
    	  '\u2217',
    	  '\u2218',
    	  '\u2219',
    	  '\u221A',
    	  '\u221B',
    	  '\u221C',
    	  '\u221D',
    	  '\u2223',
    	  '\u2224',
    	  '\u2225',
    	  '\u2226',
    	  '\u2227',
    	  '\u2228',
    	  '\u2229',
    	  '\u222A',
    	  '\u222B',
    	  '\u222C',
    	  '\u222D',
    	  '\u222E',
    	  '\u222F',
    	  '\u2230',
    	  '\u2231',
    	  '\u2232',
    	  '\u2233',
    	  '\u2234',
    	  '\u2235',
    	  '\u2236',
    	  '\u2237',
    	  '\u2238',
    	  '\u2239',
    	  '\u223A',
    	  '\u223B',
    	  '\u223C',
    	  '\u223D',
    	  '\u223E',
    	  '\u2240',
    	  '\u2241',
    	  '\u2242',
    	  '\u2243',
    	  '\u2244',
    	  '\u2245',
    	  '\u2246',
    	  '\u2247',
    	  '\u2248',
    	  '\u2249',
    	  '\u224A',
    	  '\u224B',
    	  '\u224C',
    	  '\u224D',
    	  '\u224E',
    	  '\u224F',
    	  '\u2250',
    	  '\u2251',
    	  '\u2252',
    	  '\u2253',
    	  '\u2254',
    	  '\u2255',
    	  '\u2256',
    	  '\u2257',
    	  '\u2258',
    	  '\u2259',
    	  '\u225A',
    	  '\u225B',
    	  '\u225C',
    	  '\u225D',
    	  '\u225E',
    	  '\u225F',
    	  '\u2260',
    	  '\u2261',
    	  '\u2262',
    	  '\u2263',
    	  '\u2264',
    	  '\u2265',
    	  '\u2266',
    	  '\u2267',
    	  '\u2268',
    	  '\u2269',
    	  '\u226A',
    	  '\u226B',
    	  '\u226C',
    	  '\u226D',
    	  '\u226E',
    	  '\u226F',
    	  '\u2270',
    	  '\u2271',
    	  '\u2272',
    	  '\u2273',
    	  '\u2274',
    	  '\u2275',
    	  '\u2276',
    	  '\u2277',
    	  '\u2278',
    	  '\u2279',
    	  '\u227A',
    	  '\u227B',
    	  '\u227C',
    	  '\u227D',
    	  '\u227E',
    	  '\u227F',
    	  '\u2280',
    	  '\u2281',
    	  '\u2282',
    	  '\u2283',
    	  '\u2284',
    	  '\u2285',
    	  '\u2286',
    	  '\u2287',
    	  '\u2288',
    	  '\u2289',
    	  '\u228A',
    	  '\u228B',
    	  '\u228C',
    	  '\u228D',
    	  '\u228E',
    	  '\u228F',
    	  '\u2290',
    	  '\u2291',
    	  '\u2292',
    	  '\u2293',
    	  '\u2294',
    	  '\u2295',
    	  '\u2296',
    	  '\u2297',
    	  '\u2298',
    	  '\u2299',
    	  '\u229A',
    	  '\u229B',
    	  '\u229C',
    	  '\u229D',
    	  '\u229E',
    	  '\u229F',
    	  '\u22A0',
    	  '\u22A1',
    	  '\u22A2',
    	  '\u22A3',
    	  '\u22A5',
    	  '\u22A6',
    	  '\u22A7',
    	  '\u22A8',
    	  '\u22A9',
    	  '\u22AA',
    	  '\u22AB',
    	  '\u22AC',
    	  '\u22AD',
    	  '\u22AE',
    	  '\u22AF',
    	  '\u22B0',
    	  '\u22B1',
    	  '\u22B2',
    	  '\u22B3',
    	  '\u22B4',
    	  '\u22B5',
    	  '\u22B6',
    	  '\u22B7',
    	  '\u22B8',
    	  '\u22B9',
    	  '\u22BA',
    	  '\u22BB',
    	  '\u22BC',
    	  '\u22BD',
    	  '\u22C0',
    	  '\u22C1',
    	  '\u22C2',
    	  '\u22C3',
    	  '\u22C4',
    	  '\u22C5',
    	  '\u22C6',
    	  '\u22C7',
    	  '\u22C8',
    	  '\u22C9',
    	  '\u22CA',
    	  '\u22CB',
    	  '\u22CC',
    	  '\u22CD',
    	  '\u22CE',
    	  '\u22CF',
    	  '\u22D0',
    	  '\u22D1',
    	  '\u22D2',
    	  '\u22D3',
    	  '\u22D4',
    	  '\u22D5',
    	  '\u22D6',
    	  '\u22D7',
    	  '\u22D8',
    	  '\u22D9',
    	  '\u22DA',
    	  '\u22DB',
    	  '\u22DC',
    	  '\u22DD',
    	  '\u22DE',
    	  '\u22DF',
    	  '\u22E0',
    	  '\u22E1',
    	  '\u22E2',
    	  '\u22E3',
    	  '\u22E4',
    	  '\u22E5',
    	  '\u22E6',
    	  '\u22E7',
    	  '\u22E8',
    	  '\u22E9',
    	  '\u22EA',
    	  '\u22EB',
    	  '\u22EC',
    	  '\u22ED',
    	  '\u22EE',
    	  '\u22EF',
    	  '\u22F0',
    	  '\u22F1',
    	  '\u22F2',
    	  '\u22F3',
    	  '\u22F4',
    	  '\u22F5',
    	  '\u22F6',
    	  '\u22F7',
    	  '\u22F8',
    	  '\u22F9',
    	  '\u22FA',
    	  '\u22FB',
    	  '\u22FC',
    	  '\u22FD',
    	  '\u22FE',
    	  '\u22FF',
    	  '\u2305',
    	  '\u2306',
    	  '\u2308',
    	  '\u2309',
    	  '\u230A',
    	  '\u230B',
    	  '\u231C',
    	  '\u231D',
    	  '\u231E',
    	  '\u231F',
    	  '\u2322',
    	  '\u2323',
    	  '\u2329',
    	  '\u232A',
    	  '\u233D',
    	  '\u233F',
    	  '\u23B0',
    	  '\u23B1',
    	  '\u23DC',
    	  '\u23DD',
    	  '\u23DE',
    	  '\u23DF',
    	  '\u23E0',
    	  '\u2502',
    	  '\u251C',
    	  '\u2524',
    	  '\u252C',
    	  '\u2534',
    	  '\u2581',
    	  '\u2588',
    	  '\u2592',
    	  '\u25A0',
    	  '\u25A1',
    	  '\u25AD',
    	  '\u25B2',
    	  '\u25B3',
    	  '\u25B4',
    	  '\u25B5',
    	  '\u25B6',
    	  '\u25B7',
    	  '\u25B8',
    	  '\u25B9',
    	  '\u25BC',
    	  '\u25BD',
    	  '\u25BE',
    	  '\u25BF',
    	  '\u25C0',
    	  '\u25C1',
    	  '\u25C2',
    	  '\u25C3',
    	  '\u25C4',
    	  '\u25C5',
    	  '\u25CA',
    	  '\u25CB',
    	  '\u25E6',
    	  '\u25EB',
    	  '\u25EC',
    	  '\u25F8',
    	  '\u25F9',
    	  '\u25FA',
    	  '\u25FB',
    	  '\u25FC',
    	  '\u25FD',
    	  '\u25FE',
    	  '\u25FF',
    	  '\u2605',
    	  '\u2606',
    	  '\u2772',
    	  '\u2773',
    	  '\u27D1',
    	  '\u27D2',
    	  '\u27D3',
    	  '\u27D4',
    	  '\u27D5',
    	  '\u27D6',
    	  '\u27D7',
    	  '\u27D8',
    	  '\u27D9',
    	  '\u27DA',
    	  '\u27DB',
    	  '\u27DC',
    	  '\u27DD',
    	  '\u27DE',
    	  '\u27DF',
    	  '\u27E0',
    	  '\u27E1',
    	  '\u27E2',
    	  '\u27E3',
    	  '\u27E4',
    	  '\u27E5',
    	  '\u27E6',
    	  '\u27E7',
    	  '\u27E8',
    	  '\u27E9',
    	  '\u27EA',
    	  '\u27EB',
    	  '\u27F0',
    	  '\u27F1',
    	  '\u27F2',
    	  '\u27F3',
    	  '\u27F4',
    	  '\u27F5',
    	  '\u27F6',
    	  '\u27F7',
    	  '\u27F8',
    	  '\u27F9',
    	  '\u27FA',
    	  '\u27FB',
    	  '\u27FC',
    	  '\u27FD',
    	  '\u27FE',
    	  '\u27FF',
    	  '\u2900',
    	  '\u2901',
    	  '\u2902',
    	  '\u2903',
    	  '\u2904',
    	  '\u2905',
    	  '\u2906',
    	  '\u2907',
    	  '\u2908',
    	  '\u2909',
    	  '\u290A',
    	  '\u290B',
    	  '\u290C',
    	  '\u290D',
    	  '\u290E',
    	  '\u290F',
    	  '\u2910',
    	  '\u2911',
    	  '\u2912',
    	  '\u2913',
    	  '\u2914',
    	  '\u2915',
    	  '\u2916',
    	  '\u2917',
    	  '\u2918',
    	  '\u2919',
    	  '\u291A',
    	  '\u291B',
    	  '\u291C',
    	  '\u291D',
    	  '\u291E',
    	  '\u291F',
    	  '\u2920',
    	  '\u2921',
    	  '\u2922',
    	  '\u2923',
    	  '\u2924',
    	  '\u2925',
    	  '\u2926',
    	  '\u2927',
    	  '\u2928',
    	  '\u2929',
    	  '\u292A',
    	  '\u292B',
    	  '\u292C',
    	  '\u292D',
    	  '\u292E',
    	  '\u292F',
    	  '\u2930',
    	  '\u2931',
    	  '\u2932',
    	  '\u2933',
    	  '\u2934',
    	  '\u2935',
    	  '\u2936',
    	  '\u2937',
    	  '\u2938',
    	  '\u2939',
    	  '\u293A',
    	  '\u293B',
    	  '\u293C',
    	  '\u293D',
    	  '\u293E',
    	  '\u293F',
    	  '\u2940',
    	  '\u2941',
    	  '\u2942',
    	  '\u2943',
    	  '\u2944',
    	  '\u2945',
    	  '\u2946',
    	  '\u2947',
    	  '\u2948',
    	  '\u2949',
    	  '\u294A',
    	  '\u294B',
    	  '\u294C',
    	  '\u294D',
    	  '\u294E',
    	  '\u294F',
    	  '\u2950',
    	  '\u2951',
    	  '\u2952',
    	  '\u2953',
    	  '\u2954',
    	  '\u2955',
    	  '\u2956',
    	  '\u2957',
    	  '\u2958',
    	  '\u2959',
    	  '\u295A',
    	  '\u295B',
    	  '\u295C',
    	  '\u295D',
    	  '\u295E',
    	  '\u295F',
    	  '\u2960',
    	  '\u2961',
    	  '\u2962',
    	  '\u2963',
    	  '\u2964',
    	  '\u2965',
    	  '\u2966',
    	  '\u2967',
    	  '\u2968',
    	  '\u2969',
    	  '\u296A',
    	  '\u296B',
    	  '\u296C',
    	  '\u296D',
    	  '\u296E',
    	  '\u296F',
    	  '\u2970',
    	  '\u2971',
    	  '\u2972',
    	  '\u2973',
    	  '\u2974',
    	  '\u2975',
    	  '\u2976',
    	  '\u2977',
    	  '\u2978',
    	  '\u2979',
    	  '\u297A',
    	  '\u297B',
    	  '\u297C',
    	  '\u297D',
    	  '\u297E',
    	  '\u297F',
    	  '\u2980',
    	  '\u2982',
    	  '\u2983',
    	  '\u2984',
    	  '\u2985',
    	  '\u2986',
    	  '\u2987',
    	  '\u2988',
    	  '\u2989',
    	  '\u298A',
    	  '\u298B',
    	  '\u298C',
    	  '\u298D',
    	  '\u298E',
    	  '\u298F',
    	  '\u2990',
    	  '\u2991',
    	  '\u2992',
    	  '\u2993',
    	  '\u2994',
    	  '\u2995',
    	  '\u2996',
    	  '\u2997',
    	  '\u2998',
    	  '\u2999',
    	  '\u299A',
    	  '\u29B6',
    	  '\u29B7',
    	  '\u29B8',
    	  '\u29B9',
    	  '\u29C0',
    	  '\u29C1',
    	  '\u29C4',
    	  '\u29C5',
    	  '\u29C6',
    	  '\u29C7',
    	  '\u29C8',
    	  '\u29CE',
    	  '\u29CF',
    	  '\u29D0',
    	  '\u29D1',
    	  '\u29D2',
    	  '\u29D3',
    	  '\u29D4',
    	  '\u29D5',
    	  '\u29D6',
    	  '\u29D7',
    	  '\u29D8',
    	  '\u29D9',
    	  '\u29DA',
    	  '\u29DB',
    	  '\u29DF',
    	  '\u29E1',
    	  '\u29E2',
    	  '\u29E3',
    	  '\u29E4',
    	  '\u29E5',
    	  '\u29E6',
    	  '\u29EB',
    	  '\u29F4',
    	  '\u29F5',
    	  '\u29F6',
    	  '\u29F7',
    	  '\u29F8',
    	  '\u29F9',
    	  '\u29FA',
    	  '\u29FB',
    	  '\u29FC',
    	  '\u29FD',
    	  '\u29FE',
    	  '\u29FF',
    	  '\u2A00',
    	  '\u2A01',
    	  '\u2A02',
    	  '\u2A03',
    	  '\u2A04',
    	  '\u2A05',
    	  '\u2A06',
    	  '\u2A07',
    	  '\u2A08',
    	  '\u2A09',
    	  '\u2A0A',
    	  '\u2A0B',
    	  '\u2A0C',
    	  '\u2A0D',
    	  '\u2A0E',
    	  '\u2A0F',
    	  '\u2A10',
    	  '\u2A11',
    	  '\u2A12',
    	  '\u2A13',
    	  '\u2A14',
    	  '\u2A15',
    	  '\u2A16',
    	  '\u2A17',
    	  '\u2A18',
    	  '\u2A19',
    	  '\u2A1A',
    	  '\u2A1B',
    	  '\u2A1C',
    	  '\u2A1D',
    	  '\u2A1E',
    	  '\u2A1F',
    	  '\u2A20',
    	  '\u2A21',
    	  '\u2A22',
    	  '\u2A23',
    	  '\u2A24',
    	  '\u2A25',
    	  '\u2A26',
    	  '\u2A27',
    	  '\u2A28',
    	  '\u2A29',
    	  '\u2A2A',
    	  '\u2A2B',
    	  '\u2A2C',
    	  '\u2A2D',
    	  '\u2A2E',
    	  '\u2A2F',
    	  '\u2A30',
    	  '\u2A31',
    	  '\u2A32',
    	  '\u2A33',
    	  '\u2A34',
    	  '\u2A35',
    	  '\u2A36',
    	  '\u2A37',
    	  '\u2A38',
    	  '\u2A39',
    	  '\u2A3A',
    	  '\u2A3B',
    	  '\u2A3C',
    	  '\u2A3D',
    	  '\u2A3E',
    	  '\u2A3F',
    	  '\u2A40',
    	  '\u2A41',
    	  '\u2A42',
    	  '\u2A43',
    	  '\u2A44',
    	  '\u2A45',
    	  '\u2A46',
    	  '\u2A47',
    	  '\u2A48',
    	  '\u2A49',
    	  '\u2A4A',
    	  '\u2A4B',
    	  '\u2A4C',
    	  '\u2A4D',
    	  '\u2A4E',
    	  '\u2A4F',
    	  '\u2A50',
    	  '\u2A51',
    	  '\u2A52',
    	  '\u2A53',
    	  '\u2A54',
    	  '\u2A55',
    	  '\u2A56',
    	  '\u2A57',
    	  '\u2A58',
    	  '\u2A59',
    	  '\u2A5A',
    	  '\u2A5B',
    	  '\u2A5C',
    	  '\u2A5D',
    	  '\u2A5E',
    	  '\u2A5F',
    	  '\u2A60',
    	  '\u2A61',
    	  '\u2A62',
    	  '\u2A63',
    	  '\u2A64',
    	  '\u2A65',
    	  '\u2A66',
    	  '\u2A67',
    	  '\u2A68',
    	  '\u2A69',
    	  '\u2A6A',
    	  '\u2A6B',
    	  '\u2A6C',
    	  '\u2A6D',
    	  '\u2A6E',
    	  '\u2A6F',
    	  '\u2A70',
    	  '\u2A71',
    	  '\u2A72',
    	  '\u2A73',
    	  '\u2A74',
    	  '\u2A75',
    	  '\u2A76',
    	  '\u2A77',
    	  '\u2A78',
    	  '\u2A79',
    	  '\u2A7A',
    	  '\u2A7B',
    	  '\u2A7C',
    	  '\u2A7D',
    	  '\u2A7E',
    	  '\u2A7F',
    	  '\u2A80',
    	  '\u2A81',
    	  '\u2A82',
    	  '\u2A83',
    	  '\u2A84',
    	  '\u2A85',
    	  '\u2A86',
    	  '\u2A87',
    	  '\u2A88',
    	  '\u2A89',
    	  '\u2A8A',
    	  '\u2A8B',
    	  '\u2A8C',
    	  '\u2A8D',
    	  '\u2A8E',
    	  '\u2A8F',
    	  '\u2A90',
    	  '\u2A91',
    	  '\u2A92',
    	  '\u2A93',
    	  '\u2A94',
    	  '\u2A95',
    	  '\u2A96',
    	  '\u2A97',
    	  '\u2A98',
    	  '\u2A99',
    	  '\u2A9A',
    	  '\u2A9B',
    	  '\u2A9C',
    	  '\u2A9D',
    	  '\u2A9E',
    	  '\u2A9F',
    	  '\u2AA0',
    	  '\u2AA1',
    	  '\u2AA2',
    	  '\u2AA3',
    	  '\u2AA4',
    	  '\u2AA5',
    	  '\u2AA6',
    	  '\u2AA7',
    	  '\u2AA8',
    	  '\u2AA9',
    	  '\u2AAA',
    	  '\u2AAB',
    	  '\u2AAC',
    	  '\u2AAD',
    	  '\u2AAE',
    	  '\u2AAF',
    	  '\u2AB0',
    	  '\u2AB1',
    	  '\u2AB2',
    	  '\u2AB3',
    	  '\u2AB4',
    	  '\u2AB5',
    	  '\u2AB6',
    	  '\u2AB7',
    	  '\u2AB8',
    	  '\u2AB9',
    	  '\u2ABA',
    	  '\u2ABB',
    	  '\u2ABC',
    	  '\u2ABD',
    	  '\u2ABE',
    	  '\u2ABF',
    	  '\u2AC0',
    	  '\u2AC1',
    	  '\u2AC2',
    	  '\u2AC3',
    	  '\u2AC4',
    	  '\u2AC5',
    	  '\u2AC6',
    	  '\u2AC7',
    	  '\u2AC8',
    	  '\u2AC9',
    	  '\u2ACA',
    	  '\u2ACB',
    	  '\u2ACC',
    	  '\u2ACD',
    	  '\u2ACE',
    	  '\u2ACF',
    	  '\u2AD0',
    	  '\u2AD1',
    	  '\u2AD2',
    	  '\u2AD3',
    	  '\u2AD4',
    	  '\u2AD5',
    	  '\u2AD6',
    	  '\u2AD7',
    	  '\u2AD8',
    	  '\u2AD9',
    	  '\u2ADA',
    	  '\u2ADB',
    	  '\u2ADC',
    	  '\u2ADD',
    	  '\u2ADE',
    	  '\u2ADF',
    	  '\u2AE0',
    	  '\u2AE2',
    	  '\u2AE3',
    	  '\u2AE4',
    	  '\u2AE5',
    	  '\u2AE6',
    	  '\u2AE7',
    	  '\u2AE8',
    	  '\u2AE9',
    	  '\u2AEA',
    	  '\u2AEB',
    	  '\u2AEC',
    	  '\u2AED',
    	  '\u2AEE',
    	  '\u2AEF',
    	  '\u2AF0',
    	  '\u2AF2',
    	  '\u2AF3',
    	  '\u2AF4',
    	  '\u2AF5',
    	  '\u2AF6',
    	  '\u2AF7',
    	  '\u2AF8',
    	  '\u2AF9',
    	  '\u2AFA',
    	  '\u2AFB',
    	  '\u2AFC',
    	  '\u2AFD',
    	  '\u2AFE',
    	  '\u2AFF',
    	  '\u2B04',
    	  '\u2B06',
    	  '\u2B07',
    	  '\u2B0C',
    	  '\u2B0D',
    	  '\u3014',
    	  '\u3015',
    	  '\u3016',
    	  '\u3017',
    	  '\u3018',
    	  '\u3019',
    	  '\uFF01',
    	  '\uFF06',
    	  '\uFF08',
    	  '\uFF09',
    	  '\uFF0B',
    	  '\uFF0C',
    	  '\uFF0D',
    	  '\uFF0E',
    	  '\uFF0F',
    	  '\uFF1A',
    	  '\uFF1B',
    	  '\uFF1C',
    	  '\uFF1D',
    	  '\uFF1E',
    	  '\uFF1F',
    	  '\uFF20',
    	  '\uFF3B',
    	  '\uFF3C',
    	  '\uFF3D',
    	  '\uFF3E',
    	  '\uFF3F',
    	  '\uFF5B',
    	  '\uFF5C',
    	  '\uFF5D',
    	];
    	operators.oprx = new RegExp(operators$1.map(ch => escRx(ch)).join('|'));
    	return operators;
    }

    var omml2mathml$1;
    var hasRequiredOmml2mathml;

    function requireOmml2mathml () {
    	if (hasRequiredOmml2mathml) return omml2mathml$1;
    	hasRequiredOmml2mathml = 1;
    	let Marcheur = requireMarcheur()
    	  , nodal = requireNodal()
    	  , qname = requireQname()
    	  , Matcher = requireMatcher()
    	  , dom = requireBrowser()
    	  , xpath = requireXpath()
    	  , { oprx } = requireOperators()
    	  , MATH_NS = 'http://www.w3.org/1998/Math/MathML'
    	  , nsMap = {
    	      m:  'http://schemas.openxmlformats.org/officeDocument/2006/math',
    	    }
    	  , select = xpath.useNamespaces(nsMap)
    	  , selectAttr = (path, attr, ctx, onlyDef = false) => {
    	      let el = select(path, ctx)[0];
    	      if (!el) return onlyDef ? undefined : '';
    	      let atn = qname(attr, nsMap);
    	      if (atn.ns) return el.getAttributeNS(atn.ns, atn.ln);
    	      return el.getAttribute(atn.qn);
    	    }
    	  , el
    	;

    	omml2mathml$1 = function omml2mathml (omml) {
    	  let m = new Matcher(nsMap)
    	    , walker = new Marcheur()
    	  ;
    	  return walker
    	    .match(m.document(), setup)
    	    .match(
    	      m.el('m:oMathPara'),
    	      (src, out, w) => {
    	        setup(src, out, w);
    	        w.res.setAttribute('display', 'block');
    	        w.walk(out);
    	      }
    	    )
    	    .match(
    	      m.el('m:oMath'),
    	      (src, out, w) => {
    	        setup(src, out, w);
    	        let p = src.parentNode;
    	        if (p && p.namespaceURI === nsMap.m && p.localName === 'oMathPara') {
    	          w.res.setAttribute('display', 'block');
    	        }
    	        w.walk(out);
    	      }
    	    )
    	    .match(
    	      m.el('m:f'),
    	      (src, out, w) => {
    	        let type = (selectAttr('./m:fPr[last()]/m:type', 'm:val', src) || '').toLowerCase()
    	          , outer = (type === 'lin')
    	                      ? el('mrow', {}, out)
    	                      : el('mfrac', fracProp(type), out)
    	        ;
    	        let numRow = el('mrow', {}, outer);
    	        w.walk(numRow, select('m:num[1]', src));
    	        if (type === 'lin') {
    	          let mo = el('mo', {}, outer);
    	          mo.textContent = '/';
    	        }
    	        let denRow = el('mrow', {}, outer);
    	        w.walk(denRow, select('m:den[1]', src));
    	      }
    	    )
    	    .match(
    	      m.el('m:r'),
    	      (src, out) => {
    	        let nor = selectAttr('m:rPr[last()]/m:nor', 'm:val', src) || false;
    	        if (nor) nor = forceFalse(nor);
    	        if (nor) {
    	          let mtext = el('mtext', {}, out);
    	          mtext.textContent = nbsp(select('.//m:t', src)
    	                                      .map(mt => mt.textContent)
    	                                      .join(''))
    	          ;
    	        }
    	        else {
    	          select('.//m:t', src)
    	            .forEach(mt => {
    	              parseMT(src, out, {
    	                toParse:  select('./text()', mt).map(t => t.data).join(''),
    	                scr:      selectAttr('../m:rPr[last()]/m:scr', 'm:val', mt),
    	                sty:      selectAttr('../m:rPr[last()]/m:sty', 'm:val', mt),
    	                nor:      false,
    	              });
    	            })
    	          ;
    	        }
    	      }
    	    )
    	    .match(
    	      m.el('m:limLow'),
    	      (src, out, w) => {
    	        let outer = el('munder', {}, out)
    	          , row1 = el('mrow', {}, outer)
    	          , row2 = el('mrow', {}, outer)
    	        ;
    	        w.walk(row1, select('m:e[1]', src));
    	        w.walk(row2, select('m:lim[1]', src));
    	      }
    	    )
    	    .match(
    	      m.el('m:limUpp'),
    	      (src, out, w) => {
    	        let outer = el('mover', {}, out)
    	          , row1 = el('mrow', {}, outer)
    	          , row2 = el('mrow', {}, outer)
    	        ;
    	        w.walk(row1, select('m:e[1]', src));
    	        w.walk(row2, select('m:lim[1]', src));
    	      }
    	    )
    	    .match(
    	      m.el('m:sSub'),
    	      (src, out, w) => {
    	        let outer = el('msub', {}, out)
    	          , row1 = el('mrow', {}, outer)
    	          , row2 = el('mrow', {}, outer)
    	        ;
    	        w.walk(row1, select('m:e[1]', src));
    	        w.walk(row2, select('m:sub[1]', src));
    	      }
    	    )
    	    .match(
    	      m.el('m:sSup'),
    	      (src, out, w) => {
    	        let outer = el('msup', {}, out)
    	          , row1 = el('mrow', {}, outer)
    	          , row2 = el('mrow', {}, outer)
    	        ;
    	        w.walk(row1, select('m:e[1]', src));
    	        w.walk(row2, select('m:sup[1]', src));
    	      }
    	    )
    	    .match(
    	      m.el('m:sSubSup'),
    	      (src, out, w) => {
    	        let outer = el('msubsup', {}, out)
    	          , row1 = el('mrow', {}, outer)
    	          , row2 = el('mrow', {}, outer)
    	          , row3 = el('mrow', {}, outer)
    	        ;
    	        w.walk(row1, select('m:e[1]', src));
    	        w.walk(row2, select('m:sub[1]', src));
    	        w.walk(row3, select('m:sup[1]', src));
    	      }
    	    )
    	    .match(
    	      m.el('m:sPre'),
    	      (src, out, w) => {
    	        let outer = el('mmultiscripts', {}, out)
    	          , row = el('mrow', {}, outer)
    	        ;
    	        w.walk(row, select('m:e[1]', src));
    	        el('mprescripts', {}, outer);
    	        outputScript(w, outer, select('m:sub[1]', src));
    	        outputScript(w, outer, select('m:sup[1]', src));
    	      }
    	    )
    	    .match(
    	      m.el('m:m'),
    	      (src, out, w) => {
    	        let mcjc = selectAttr('m:mPr[last()]/m:mcs/m:mc/m:mcPr[last()]/m:mcJc', 'm:val', src)
    	                      .toLowerCase()
    	          , outer = el('mtable', (mcjc && mcjc !== 'center') ? { columnalign: mcjc } : {}, out)
    	        ;
    	        select('m:mr', src)
    	          .forEach(mr => {
    	            let mtr = el('mtr', {}, outer);
    	            select('m:e', mr)
    	              .forEach(me => {
    	                let mtd = el('mtd', {}, mtr);
    	                w.walk(mtd, me);
    	              })
    	            ;
    	          })
    	        ;
    	      }
    	    )
    	    .match(
    	      m.el('m:rad'),
    	      (src, out, w) => {
    	        let degHide = selectAttr('m:radPr[last()]/m:degHide', 'm:val', src) || false;
    	        if (degHide) degHide = forceFalse(degHide);
    	        if (degHide) {
    	          let msqrt = el('msqrt', {}, out);
    	          w.walk(msqrt, select('m:e[1]', src));
    	        }
    	        else {
    	          let outer = el('mroot', {}, out)
    	            , row1 = el('mrow', {}, outer)
    	            , row2 = el('mrow', {}, outer)
    	          ;
    	          w.walk(row1, select('m:e[1]', src));
    	          w.walk(row2, select('m:deg[1]', src));
    	        }
    	      }
    	    )
    	    .match(
    	      m.el('m:nary'),
    	      (src, out, w) => {
    	        let subHide = selectAttr('m:naryPr[last()]/m:subHide', 'm:val', src) || false;
    	        if (subHide) subHide = forceFalse(subHide);
    	        let supHide = selectAttr('m:naryPr[last()]/m:supHide', 'm:val', src) || false;
    	        if (supHide) supHide = forceFalse(supHide);
    	        let limLocSubSup = selectAttr('m:naryPr[last()]/m:limLoc', 'm:val', src).toLowerCase();
    	        limLocSubSup = (limLocSubSup === '' || limLocSubSup === 'subsup');
    	        let grow = selectAttr('m:naryPr[last()]/m:grow', 'm:val', src) || false;
    	        if (grow) grow = forceFalse(grow);

    	        let mrow = el('mrow', {}, out);
    	        if (supHide && subHide) {
    	          outputNAryMO(src, mrow, src, grow);
    	        }
    	        else if (subHide) {
    	          let outer = el(limLocSubSup ? 'msup' : 'mover', {}, mrow);
    	          outputNAryMO(src, outer, src, grow);
    	          let subrow = el('mrow', {}, outer);
    	          w.walk(subrow, select('m:sup[1]', src));
    	        }
    	        else if (supHide) {
    	          let outer = el(limLocSubSup ? 'msub' : 'munder', {}, mrow);
    	          outputNAryMO(src, outer, src, grow);
    	          let subrow = el('mrow', {}, outer);
    	          w.walk(subrow, select('m:sub[1]', src));
    	        }
    	        else {
    	          let outer = el(limLocSubSup ? 'msubsup' : 'munderover', {}, mrow);
    	          outputNAryMO(src, outer, src, grow);
    	          let subrow1 = el('mrow', {}, outer)
    	            , subrow2 = el('mrow', {}, outer)
    	          ;
    	          w.walk(subrow1, select('m:sub[1]', src));
    	          w.walk(subrow2, select('m:sup[1]', src));
    	        }
    	        let erow = el('mrow', {}, mrow);
    	        w.walk(erow, select('m:e[1]', src));
    	      }
    	    )
    	    .match(
    	      m.el('m:d'),
    	      (src, out, w) => {
    	        let attr = {}
    	          , begChr = selectAttr('m:dPr[1]/m:begChr', 'm:val', src, true)
    	          , endChr = selectAttr('m:dPr[1]/m:endChr', 'm:val', src, true)
    	          , sepChr = selectAttr('m:dPr[1]/m:sepChr', 'm:val', src) || '|'
    	        ;
    	        if (typeof begChr !== 'undefined' && begChr !== '(') attr.open = begChr;
    	        if (typeof endChr !== 'undefined' && endChr !== ')') attr.close = endChr;
    	        if (sepChr !== ',') attr.separators = sepChr;
    	        let mfenced = el('mfenced', attr, out);
    	        select('m:e', src).forEach(me => {
    	          let row = el('mrow', {}, mfenced);
    	          w.walk(row, me);
    	        });
    	      }
    	    )
    	    .match(
    	      m.el('m:eqArr'),
    	      (src, out, w) => {
    	        let mtable = el('mtable', {}, out);
    	        select('m:e', src)
    	          .forEach(me => {
    	            let mtr = el('mtr', {}, mtable)
    	              , mtd = el('mtd', {}, mtr)
    	              , scrLvl = selectAttr('m:argPr[last()]/m:scrLvl', 'm:val', me)
    	              , outer
    	            ;
    	            if (scrLvl !== '0' || !scrLvl) outer = el('mrow', {}, mtd);
    	            else outer = el('mstyle', { scriptlevel: scrLvl }, mtd);
    	            el('maligngroup', {}, outer);
    	            createEqArrRow(w, src, outer, 1, select('*[1]', me)[0]);
    	          })
    	        ;
    	      }
    	    )
    	    .match(
    	      m.el('m:func'),
    	      (src, out, w) => {
    	        let outer = el('mrow', {}, out)
    	          , row1 = el('mrow', {}, outer)
    	        ;
    	        select('m:fName', src).forEach(fn => w.walk(row1, fn));
    	        let mo = el('mo', {}, outer);
    	        mo.textContent = '\u2061';
    	        let row2 = el('mrow', {}, outer);
    	        w.walk(row2, select('m:e', src));
    	      }
    	    )
    	    .match(
    	      m.el('m:acc'),
    	      (src, out, w) => {
    	        let mover = el('mover', { accent: 'true' }, out)
    	          , row = el('mrow', {}, mover)
    	          , acc = selectAttr('m:accPr/m:chr', 'm:val', src).substr(0, 1) || '\u0302'
    	          , nonComb = toNonCombining(acc)
    	        ;
    	        w.walk(row, select('m:e[1]', src));
    	        if (acc.length === 0) {
    	          el('mo', {}, mover);
    	        }
    	        else {
    	          let nor = selectAttr('m:rPr[last()]/m:nor', 'm:val', src) || false;
    	          if (nor) nor = forceFalse(nor);
    	          parseMT(src, mover, {
    	            toParse:  nonComb,
    	            scr:      selectAttr('m:e[1]/*/m:rPr[last()]/m:scr', 'm:val', src),
    	            sty:      selectAttr('m:e[1]/*/m:rPr[last()]/m:sty', 'm:val', src),
    	            nor,
    	          });
    	        }
    	      }
    	    )
    	    .match(
    	      m.el('m:groupChr'),
    	      (src, out, w) => {
    	        let lastGroupChrPr = select('m:groupChrPr[last()]', src)[0]
    	          , pos = selectAttr('m:pos', 'm:val', lastGroupChrPr).toLowerCase()
    	          , vertJc = selectAttr('m:vertJc', 'm:val', lastGroupChrPr).toLowerCase()
    	          , lastChrVal = selectAttr('m:chr', 'm:val', lastGroupChrPr)
    	          , chr = lastChrVal ? lastChrVal.substr(0, 1) : '\u23DF'
    	          , mkMrow = (parent) => {
    	              let mrow = el('mrow', {}, parent);
    	              w.walk(mrow, select('m:e[1]', src));
    	            }
    	          , mkMo = (parent) => {
    	              let mo = el('mo', {}, parent);
    	              mo.textContent = chr;
    	            }
    	        ;
    	        if (pos === 'top') {
    	          if (vertJc === 'bot') {
    	            let outer = el('mover', { accent: 'false' }, out);
    	            mkMrow(outer);
    	            mkMo(outer);
    	          }
    	          else {
    	            let outer = el('munder', { accentunder: 'false' }, out);
    	            mkMo(outer);
    	            mkMrow(outer);
    	          }
    	        }
    	        else {
    	          if (vertJc === 'bot') {
    	            let outer = el('mover', { accent: 'false' }, out);
    	            mkMo(outer);
    	            mkMrow(outer);
    	          }
    	          else {
    	            let outer = el('munder', { accentunder: 'false' }, out);
    	            mkMrow(outer);
    	            mkMo(outer);
    	          }
    	        }
    	      }
    	    )
    	    .match(
    	      m.el('m:borderBox'),
    	      (src, out, w) => {
    	        let hideTop = forceTrue(selectAttr('m:borderBoxPr[last()]/m:hideTop[last()]', 'm:val', src)
    	                                  .toLowerCase())
    	          , hideBot = forceTrue(selectAttr('m:borderBoxPr[last()]/m:hideBot[last()]', 'm:val', src)
    	                                  .toLowerCase())
    	          , hideLeft = forceTrue(selectAttr('m:borderBoxPr[last()]/m:hideLeft[last()]',
    	                                            'm:val', src).toLowerCase())
    	          , hideRight = forceTrue(selectAttr('m:borderBoxPr[last()]/m:hideRight[last()]',
    	                                              'm:val', src).toLowerCase())
    	          , strikeH = forceTrue(selectAttr('m:borderBoxPr[last()]/m:strikeH[last()]', 'm:val', src)
    	                                  .toLowerCase())
    	          , strikeV = forceTrue(selectAttr('m:borderBoxPr[last()]/m:strikeV[last()]', 'm:val', src)
    	                                  .toLowerCase())
    	          , strikeBLTR = forceTrue(selectAttr('m:borderBoxPr[last()]/m:strikeBLTR[last()]',
    	                                              'm:val', src).toLowerCase())
    	          , strikeTLBR = forceTrue(selectAttr('m:borderBoxPr[last()]/m:strikeTLBR[last()]',
    	                                              'm:val', src).toLowerCase())
    	          , outer
    	        ;
    	        if (hideTop && hideBot && hideLeft && hideRight &&
    	            !strikeH && !strikeV && !strikeBLTR && !strikeTLBR) {
    	          outer = el('mrow', {}, out);
    	        }
    	        else {
    	          outer = el('menclose', createMEnclodeNotation({
    	            hideTop, hideBot, hideLeft, hideRight, strikeH, strikeV, strikeBLTR, strikeTLBR,
    	          }), out);
    	        }
    	        w.walk(outer, select('m:e[1]', src));
    	      }
    	    )
    	    .match(
    	      m.el('m:bar'),
    	      (src, out, w) => {
    	        let pos = selectAttr('m:barPr/m:pos', 'm:val', src).toLowerCase();
    	        if (pos === 'top') {
    	          let outer = el('mover', { accent: 'false' }, out)
    	            , row = el('mrow', {}, outer)
    	            , mo = el('mo', {}, outer)
    	          ;
    	          w.walk(row, select('m:e[1]', src));
    	          mo.textContent = '\u00af';
    	        }
    	        else {
    	          let outer = el('munder', { underaccent: 'false' }, out)
    	            , row = el('mrow', {}, outer)
    	            , mo = el('mo', {}, outer)
    	          ;
    	          w.walk(row, select('m:e[1]', src));
    	          mo.textContent = '\u005f';
    	        }
    	      }
    	    )
    	    .match(
    	      [m.el('m:e'), m.el('m:den'), m.el('m:num'), m.el('m:lim'), m.el('m:sup'), m.el('m:sub')],
    	      (src, out, w) => {
    	        let scriptlevel = selectAttr('m:argPr[last()]/m:scrLvl', 'm:val', src);
    	        if (!scriptlevel) {
    	          w.walk(out);
    	        }
    	        else {
    	          let style = el('mstyle', { scriptlevel }, out);
    	          w.walk(style);
    	        }
    	      }
    	    )
    	    .match(
    	      m.el('m:phant'),
    	      (src, out, w) => {
    	        let zeroWid = selectAttr('m:phantPr[last()]/m:zeroWid[last()]', 'm:val', src)
    	                        .toLowerCase() || false;
    	        if (zeroWid) zeroWid = forceFalse(zeroWid);
    	        let zeroAsc = selectAttr('m:phantPr[last()]/m:zeroAsc[last()]', 'm:val', src)
    	                        .toLowerCase() || false;
    	        if (zeroAsc) zeroAsc = forceFalse(zeroAsc);
    	        let zeroDesc = selectAttr('m:phantPr[last()]/m:zeroDesc[last()]', 'm:val', src)
    	                        .toLowerCase() || false;
    	        if (zeroDesc) zeroDesc = forceFalse(zeroDesc);
    	        let showVal = forceFalse(selectAttr('m:phantPr[last()]/m:show[last()]', 'm:val', src)
    	                                    .toLowerCase());
    	        let parent;
    	        if (showVal) {
    	          parent = el('mpadded', createMPaddedAttr({ zeroWid, zeroAsc, zeroDesc }), out);
    	        }
    	        else if (!zeroWid && !zeroAsc && !zeroDesc) {
    	          parent = el('mphantom', {}, out);
    	        }
    	        else {
    	          let phant = el('mphantom', {}, out);
    	          parent = el('mpadded', createMPaddedAttr({ zeroWid, zeroAsc, zeroDesc }), phant);
    	        }
    	        let row = el('mrow', {}, parent);
    	        w.walk(row, select('m:e', src));
    	      }
    	    )
    	    .run(omml)
    	  ;
    	};

    	function fracProp (type) {
    	  if (type === 'skw' || type === 'lin') return { bevelled: 'true' };
    	  if (type === 'nobar') return { linethickness: '0pt' };
    	  return {};
    	  // TODO: the original XSLT had traces of trying to set `numalign` on both numerator and
    	  // denominator, but the variables were never properly defined and could absolutely not match
    	}

    	function nbsp (str) {
    	  if (!str) return;
    	  return str.replace(/\s/g, '\u00a0');
    	}

    	function tf (str) {
    	  if (str == null) return;
    	  str = str.toLowerCase();
    	  if (str === 'on' || str === '1' || str === 'true') return true;
    	  if (str === 'off' || str === '0' || str === 'false') return false;
    	}

    	function forceFalse (str) {
    	  let res = tf(str);
    	  if (res === false) return false;
    	  return true;
    	}

    	function forceTrue (str) {
    	  return tf(str) || false;
    	}

    	function parseMT (ctx, out, { toParse = '', scr, sty, nor }) {
    	  if (!toParse.length) return;
    	  let firstOper = rxIndexOf(toParse, oprx)
    	    , firstNum = rxIndexOf(toParse, /\d/)
    	    , startsWithOper = (firstOper === 1)
    	    , startsWithNum = (firstNum === 1)
    	  ;
    	  if (!startsWithOper && !startsWithNum) {
    	    let charToPrint;
    	    if (select('ancestor::m:fName', ctx)[0]) {
    	      if (!firstOper && !firstNum) charToPrint = toParse.length;
    	      else charToPrint = Math.min(firstOper || Number.MAX_VALUE, firstNum || Number.MAX_VALUE) - 1;
    	    }
    	    else charToPrint = 1;
    	    let mi = el('mi', tokenAttributes({ scr, sty, nor, charToPrint, tokenType: 'mi' }), out);
    	    mi.textContent = nbsp(toParse.substr(0, charToPrint));
    	    parseMT(ctx, out, { toParse: toParse.substr(charToPrint), scr, sty, nor });
    	  }
    	  else if (startsWithOper) {
    	    let mo = el('mo', tokenAttributes({ nor, tokenType: 'mo' }), out);
    	    mo.textContent = toParse.substr(0, 1);
    	    parseMT(ctx, out, { toParse: toParse.substr(1), scr, sty, nor });
    	  }
    	  else {
    	    let num = numStart(toParse)
    	      , mn = el('mn', tokenAttributes({ scr, sty: 'p', nor, tokenType: 'mn' }), out)
    	    ;
    	    mn.textContent = num;
    	    parseMT(ctx, out, { toParse: toParse.substr(num.length), scr, sty, nor });
    	  }
    	}

    	function parseEqArrMr (ctx, out, { toParse = '', scr, sty, nor, align }) {
    	  if (!toParse.length) return;
    	  if (toParse[0] === '&') {
    	    el(align ? 'malignmark' : 'maligngroup', {}, out);
    	    parseEqArrMr(ctx, out, {
    	      toParse:  toParse.substr(1),
    	      align:    !align,
    	      scr, sty, nor,
    	    });
    	  }
    	  else {
    	    let firstOper = rxIndexOf(toParse, oprx)
    	      , firstNum = rxIndexOf(toParse, /\d/)
    	      , startsWithOper = (firstOper === 1)
    	      , startsWithNum = (firstNum === 1)
    	    ;
    	    if (!startsWithOper && !startsWithNum) {
    	      if (!nor) {
    	        let mi = el('mi', tokenAttributes({ scr, sty, nor, charToPrint: 1, tokenType: 'mi' }), out);
    	        mi.textContent = nbsp(toParse.substr(0, 1));
    	      }
    	      else {
    	        let mt = el('mtext', {}, out);
    	        mt.textContent = nbsp(toParse.substr(0, 1));
    	      }
    	      parseEqArrMr(ctx, out, { toParse: toParse.substr(1), scr, sty, nor, align });
    	    }
    	    else if (startsWithOper) {
    	      if (!nor) {
    	        let mo = el('mo', tokenAttributes({ nor, charToPrint: 1, tokenType: 'mo' }), out);
    	        mo.textContent = toParse.substr(0, 1);
    	      }
    	      else {
    	        let mt = el('mtext', {}, out);
    	        mt.textContent = toParse.substr(0, 1);
    	      }
    	      parseEqArrMr(ctx, out, { toParse: toParse.substr(1), scr, sty, nor, align });
    	    }
    	    else {
    	      let num = numStart(toParse);
    	      if (!nor) {
    	        let mn = el('mn', tokenAttributes({ sty: 'p', nor, charToPrint: 1, tokenType: 'mn' }), out);
    	        mn.textContent = toParse.substr(0, num.length);
    	      }
    	      else {
    	        let mt = el('mtext', {}, out);
    	        mt.textContent = toParse.substr(0, num.length);
    	      }
    	      parseEqArrMr(ctx, out, { toParse: toParse.substr(num.length), scr, sty, nor, align });
    	    }
    	  }
    	}

    	function rxIndexOf (str, rx) {
    	  let re = rx.exec(str);
    	  if (!re) return 0;
    	  return re.index + 1;
    	}

    	function tokenAttributes ({ scr, sty, nor, charToPrint = 0, tokenType }) {
    	  let attr = {};
    	  if (nor) attr.mathvariant = 'normal';
    	  else {
    	    let mathvariant
    	      , fontweight = (sty === 'b' || sty === 'bi') ? 'bold' : 'normal'
    	      , fontstyle = (sty === 'b' || sty === 'p') ? 'normal' : 'italic'
    	    ;
    	    if (tokenType !== 'mn') {
    	      if (scr === 'monospace') mathvariant = 'monospace';
    	      else if (scr === 'sans-serif' && sty === 'i') mathvariant = 'sans-serif-italic';
    	      else if (scr === 'sans-serif' && sty === 'b') mathvariant = 'bold-sans-serif';
    	      else if (scr === 'sans-serif' && sty === 'bi') mathvariant = 'sans-serif-bold-italic';
    	      else if (scr === 'sans-serif') mathvariant = 'sans-serif';
    	      else if (scr === 'fraktur' && (sty === 'b' || sty === 'i')) mathvariant = 'bold-fraktur';
    	      else if (scr === 'fraktur') mathvariant = 'fraktur';
    	      else if (scr === 'double-struck') mathvariant = 'double-struck';
    	      else if (scr === 'script' && (sty === 'b' || sty === 'i')) mathvariant = 'bold-script';
    	      else if (scr === 'script') mathvariant = 'script';
    	      else if (scr === 'roman' || !scr) {
    	        if (sty === 'b') mathvariant = 'bold';
    	        else if (sty === 'i') mathvariant = 'italic';
    	        else if (sty === 'p') mathvariant = 'normal';
    	        else if (sty === 'bi') mathvariant = 'bold-italic';
    	      }
    	    }
    	    if (tokenType === 'mo' && mathvariant !== 'normal') return attr;
    	    if (tokenType === 'mi' && charToPrint === 1 && (mathvariant === 'italic' || !mathvariant)) {
    	      return attr;
    	    }
    	    if (tokenType === 'mi' && charToPrint > 1 && (mathvariant === 'italic' || !mathvariant)) {
    	      attr.mathvariant = 'italic';
    	    }
    	    else if (mathvariant && mathvariant !== 'italic') {
    	      attr.mathvariant = mathvariant;
    	    }
    	    else {
    	      if (fontstyle === 'italic' && !(tokenType === 'mi' && charToPrint === 1)) {
    	        attr.fontstyle = 'italic';
    	      }
    	      if (fontweight === 'bold') attr.fontweight = 'bold';
    	    }
    	  }
    	  return attr;
    	}

    	function numStart (str) {
    	  if (!str) return '';
    	  let ret = '';
    	  str.replace(/^(\d+)/, (_, m) => {
    	    ret = m;
    	  });
    	  return ret;
    	}

    	function outputScript (w, out, cur) {
    	  if (cur && cur.length) {
    	    let row = el('mrow', {}, out);
    	    w.walk(row, cur);
    	  }
    	  else el('none', {}, out);
    	}

    	function outputNAryMO (src, out, cur, grow = false) {
    	  let mo = el('mo', { stretchy: grow ? 'true' : 'false' }, out)
    	    , val = selectAttr('./m:naryPr[last()]/m:chr', 'm:val', src)
    	  ;
    	  mo.textContent = val || '\u222b';
    	}

    	function createEqArrRow (w, src, out, align, cur) {
    	  let allMt = select('m:t', cur).map(mt => mt.textContent).join('');
    	  if (select('self::m:r', cur)[0]) {
    	    let nor = selectAttr('m:rPr[last()]/m:nor', 'm:val', src) || false;
    	    if (nor) nor = forceFalse(nor);
    	    parseEqArrMr(src, out, {
    	      toParse:  allMt,
    	      scr:      selectAttr('../m:rPr[last()]/m:scr', 'm:val', src),
    	      sty:      selectAttr('../m:rPr[last()]/m:sty', 'm:val', src),
    	      nor,
    	      align,
    	    });
    	  }
    	  else {
    	    w.walk(out, cur);
    	  }
    	  if (select('following-sibling::*', cur).length) {
    	    let amp = countAmp(allMt);
    	    createEqArrRow(w, src, out, (align + (amp % 2)) % 2, select('following-sibling::*', cur)[0]);
    	  }
    	}

    	function countAmp (allMt) {
    	  return ((allMt || '').match(/&/g) || []).length;
    	}

    	let combiMap = {
    	  '\u0306': '\u02D8',
    	  '\u032e': '\u02D8',
    	  '\u0312': '\u00B8',
    	  '\u0327': '\u00B8',
    	  '\u0300': '\u0060',
    	  '\u0316': '\u0060',
    	  '\u0305': '\u002D',
    	  '\u0332': '\u002D',
    	  '\u0323': '\u002E',
    	  '\u0307': '\u02D9',
    	  '\u030B': '\u02DD',
    	  '\u0317': '\u00B4',
    	  '\u0301': '\u00B4',
    	  '\u0330': '\u007E',
    	  '\u0303': '\u007E',
    	  '\u0324': '\u00A8',
    	  '\u0308': '\u00A8',
    	  '\u032C': '\u02C7',
    	  '\u030C': '\u02C7',
    	  '\u0302': '\u005E',
    	  '\u032D': '\u005E',
    	  '\u20D7': '\u2192',
    	  '\u20EF': '\u2192',
    	  '\u20D6': '\u2190',
    	  '\u20EE': '\u2190',
    	};
    	function toNonCombining (ch) {
    	  return combiMap[ch] || ch;
    	}

    	function createMEnclodeNotation ({ hideTop, hideBot, hideLeft, hideRight, strikeH, strikeV,
    	                                    strikeBLTR, strikeTLBR }) {
    	  let notation = [];
    	  if (!hideTop && !hideBot && !hideLeft && !hideRight) notation.push('box');
    	  else {
    	    if (!hideTop) notation.push('top');
    	    if (!hideBot) notation.push('bottom');
    	    if (!hideLeft) notation.push('left');
    	    if (!hideRight) notation.push('right');
    	  }
    	  if (strikeH) notation.push('horizontalstrike');
    	  if (strikeV) notation.push('verticalstrike');
    	  if (strikeBLTR) notation.push('updiagonalstrike');
    	  if (strikeTLBR) notation.push('downdiagonalstrike');
    	  return { notation: notation.join(' ') };
    	}

    	function createMPaddedAttr ({ zeroWid, zeroAsc, zeroDesc }) {
    	  let attr = {};
    	  if (zeroWid) attr.width = '0in';
    	  if (zeroAsc) attr.height = '0in';
    	  if (zeroDesc) attr.depth = '0in';
    	  return attr;
    	}

    	function setup (src, out, w) {
    	  if (w.res) return;
    	  let doc = dom.implementation().createHTMLDocument('')
    	    , nod = nodal(doc, {}, nsMap)
    	    , math = doc.createElementNS(MATH_NS, 'math')
    	  ;
    	  math.setAttribute('display', 'inline');
    	  el = nod.el;
    	  w.result(math);
    	  w.walk(math);
    	}
    	return omml2mathml$1;
    }

    var omml2mathmlExports = requireOmml2mathml();
    var omml2mathml = /*@__PURE__*/getDefaultExportFromCjs(omml2mathmlExports);

    function normalizeMathML(input) {
        const MML_NS = 'http://www.w3.org/1998/Math/MathML';
        let rootEl = null;
        if (typeof input === 'string') {
            try {
                const sanitizeToXmlSafe = (s) => {
                    const map = {
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
                const isParserError = doc.getElementsByTagName('parsererror').length > 0
                    || doc.documentElement?.localName?.toLowerCase() === 'parsererror';
                if (isParserError) {
                    return input;
                }
                rootEl = (doc.documentElement?.nodeType === 1 ? doc.documentElement : null);
            }
            catch {
                return typeof input === 'string' ? input : input?.outerHTML ?? '';
            }
        }
        else {
            rootEl = input;
        }
        if (!rootEl) {
            return '';
        }
        const createMo = (text) => {
            const mo = rootEl.ownerDocument.createElementNS(MML_NS, 'mo');
            mo.textContent = text;
            return mo;
        };
        const transformMfenced = (mfenced) => {
            const doc = mfenced.ownerDocument;
            const mrow = doc.createElementNS(MML_NS, 'mrow');
            for (let i = 0; i < mfenced.attributes.length; i++) {
                const attr = mfenced.attributes[i];
                if (attr.name === 'open' || attr.name === 'close' || attr.name === 'separators')
                    continue;
                mrow.setAttribute(attr.name, attr.value);
            }
            const open = mfenced.getAttribute('open');
            const close = mfenced.getAttribute('close');
            const sepsAttr = mfenced.getAttribute('separators');
            const openStr = open !== null ? open : '(';
            const closeStr = close !== null ? close : ')';
            const separatorsStr = sepsAttr !== null ? sepsAttr : ',';
            const children = Array.from(mfenced.children);
            if (openStr.length > 0) {
                mrow.appendChild(createMo(openStr));
            }
            const sepChars = Array.from(separatorsStr);
            children.forEach((child, idx) => {
                mrow.appendChild(child);
                const needSep = idx < children.length - 1;
                if (!needSep)
                    return;
                if (sepChars.length === 0)
                    return;
                const sep = sepChars[Math.min(idx, sepChars.length - 1)];
                if (sep && sep.length > 0) {
                    mrow.appendChild(createMo(sep));
                }
            });
            if (closeStr.length > 0) {
                mrow.appendChild(createMo(closeStr));
            }
            mfenced.replaceWith(mrow);
        };
        const toTransform = [];
        toTransform.push(...Array.from(rootEl.getElementsByTagName('mfenced')));
        if (rootEl.localName && rootEl.localName.toLowerCase() === 'mfenced') {
            toTransform.push(rootEl);
        }
        for (let i = toTransform.length - 1; i >= 0; i--) {
            transformMfenced(toTransform[i]);
        }
        const serialized = rootEl.outerHTML ?? new XMLSerializer().serializeToString(rootEl);
        return serialized;
    }
    function renderOmmlToHtml(omml) {
        if (!omml)
            return '';
        try {
            const node = omml2mathml(omml);
            if (!node)
                return '';
            console.log(node);
            const mathml = typeof node === 'string' ? node : (node.outerHTML ?? '');
            return normalizeMathML(mathml);
        }
        catch (e) {
            console.log(e);
            return '';
        }
    }

    const defaultTab = { pos: 0, leader: "none", style: "left" };
    const maxTabs = 50;
    function computePixelToPoint(container = document.body) {
        const temp = document.createElement("div");
        temp.style.width = '100pt';
        container.appendChild(temp);
        const result = 100 / temp.offsetWidth;
        container.removeChild(temp);
        return result;
    }
    function updateTabStop(elem, tabs, defaultTabSize, pixelToPoint = 72 / 96) {
        const p = elem.closest("p");
        const ebb = elem.getBoundingClientRect();
        const pbb = p.getBoundingClientRect();
        const pcs = getComputedStyle(p);
        const tabStops = tabs?.length > 0 ? tabs.map(t => ({
            pos: lengthToPoint(t.position),
            leader: t.leader,
            style: t.style
        })).sort((a, b) => a.pos - b.pos) : [defaultTab];
        const lastTab = tabStops[tabStops.length - 1];
        const pWidthPt = pbb.width * pixelToPoint;
        const size = lengthToPoint(defaultTabSize);
        let pos = lastTab.pos + size;
        if (pos < pWidthPt) {
            for (; pos < pWidthPt && tabStops.length < maxTabs; pos += size) {
                tabStops.push({ ...defaultTab, pos: pos });
            }
        }
        const marginLeft = parseFloat(pcs.marginLeft);
        const pOffset = pbb.left + marginLeft;
        const left = (ebb.left - pOffset) * pixelToPoint;
        const tab = tabStops.find(t => t.style != "clear" && t.pos > left);
        if (tab == null)
            return;
        let width = 1;
        if (tab.style == "right" || tab.style == "center") {
            const tabStops = Array.from(p.querySelectorAll(`.${elem.className}`));
            const nextIdx = tabStops.indexOf(elem) + 1;
            const range = document.createRange();
            range.setStart(elem, 1);
            if (nextIdx < tabStops.length) {
                range.setEndBefore(tabStops[nextIdx]);
            }
            else {
                range.setEndAfter(p);
            }
            const mul = tab.style == "center" ? 0.5 : 1;
            const nextBB = range.getBoundingClientRect();
            const offset = nextBB.left + mul * nextBB.width - (pbb.left - marginLeft);
            width = tab.pos - offset * pixelToPoint;
        }
        else {
            width = tab.pos - left;
        }
        elem.innerHTML = "&nbsp;";
        elem.style.textDecoration = "inherit";
        elem.style.wordSpacing = `${width.toFixed(0)}pt`;
        switch (tab.leader) {
            case "dot":
            case "middleDot":
                elem.style.textDecoration = "underline";
                elem.style.textDecorationStyle = "dotted";
                break;
            case "hyphen":
            case "heavy":
            case "underscore":
                elem.style.textDecoration = "underline";
                break;
        }
    }
    function lengthToPoint(length) {
        return parseFloat(length);
    }

    const ns = {
        svg: "http://www.w3.org/2000/svg",
        mathML: "http://www.w3.org/1998/Math/MathML"
    };
    class HtmlRenderer {
        constructor(htmlDocument) {
            this.htmlDocument = htmlDocument;
            this.className = "docx";
            this.styleMap = {};
            this.currentPart = null;
            this.tableVerticalMerges = [];
            this.currentVerticalMerge = null;
            this.tableCellPositions = [];
            this.currentCellPosition = null;
            this.footnoteMap = {};
            this.endnoteMap = {};
            this.currentEndnoteIds = [];
            this.usedHederFooterParts = [];
            this.currentTabs = [];
            this.commentMap = {};
            this.tasks = [];
            this.postRenderTasks = [];
        }
        async render(document, bodyContainer, styleContainer = null, options) {
            this.document = document;
            this.options = options;
            this.className = options.className;
            this.rootSelector = options.inWrapper ? `.${this.className}-wrapper` : ':root';
            this.styleMap = null;
            this.tasks = [];
            if (this.options.renderComments && globalThis.Highlight) {
                this.commentHighlight = new Highlight();
            }
            styleContainer = styleContainer || bodyContainer;
            removeAllElements(styleContainer);
            removeAllElements(bodyContainer);
            styleContainer.appendChild(this.createComment("docxjs library predefined styles"));
            styleContainer.appendChild(this.renderDefaultStyle());
            if (document.themePart) {
                styleContainer.appendChild(this.createComment("docxjs document theme values"));
                this.renderTheme(document.themePart, styleContainer);
            }
            if (document.stylesPart != null) {
                this.styleMap = this.processStyles(document.stylesPart.styles);
                styleContainer.appendChild(this.createComment("docxjs document styles"));
                styleContainer.appendChild(this.renderStyles(document.stylesPart.styles));
            }
            if (document.numberingPart) {
                this.prodessNumberings(document.numberingPart.domNumberings);
                styleContainer.appendChild(this.createComment("docxjs document numbering styles"));
                styleContainer.appendChild(this.renderNumbering(document.numberingPart.domNumberings, styleContainer));
            }
            if (document.footnotesPart) {
                this.footnoteMap = keyBy(document.footnotesPart.notes, x => x.id);
            }
            if (document.endnotesPart) {
                this.endnoteMap = keyBy(document.endnotesPart.notes, x => x.id);
            }
            if (document.settingsPart) {
                this.defaultTabSize = document.settingsPart.settings?.defaultTabStop;
            }
            if (!options.ignoreFonts && document.fontTablePart)
                this.renderFontTable(document.fontTablePart, styleContainer);
            var sectionElements = this.renderSections(document.documentPart.body);
            if (this.options.inWrapper) {
                bodyContainer.appendChild(this.renderWrapper(sectionElements));
            }
            else {
                appendChildren(bodyContainer, sectionElements);
            }
            if (this.commentHighlight && options.renderComments) {
                CSS.highlights.set(`${this.className}-comments`, this.commentHighlight);
            }
            this.postRenderTasks.forEach(t => t());
            await Promise.allSettled(this.tasks);
            this.refreshTabStops();
        }
        renderTheme(themePart, styleContainer) {
            const variables = {};
            const fontScheme = themePart.theme?.fontScheme;
            if (fontScheme) {
                if (fontScheme.majorFont) {
                    variables['--docx-majorHAnsi-font'] = fontScheme.majorFont.latinTypeface;
                }
                if (fontScheme.minorFont) {
                    variables['--docx-minorHAnsi-font'] = fontScheme.minorFont.latinTypeface;
                }
            }
            const colorScheme = themePart.theme?.colorScheme;
            if (colorScheme) {
                for (let [k, v] of Object.entries(colorScheme.colors)) {
                    variables[`--docx-${k}-color`] = `#${v}`;
                }
            }
            const cssText = this.styleToString(`.${this.className}`, variables);
            styleContainer.appendChild(this.createStyleElement(cssText));
        }
        renderFontTable(fontsPart, styleContainer) {
            for (let f of fontsPart.fonts) {
                for (let ref of f.embedFontRefs) {
                    this.tasks.push(this.document.loadFont(ref.id, ref.key).then(fontData => {
                        const cssValues = {
                            'font-family': encloseFontFamily(f.name),
                            'src': `url(${fontData})`
                        };
                        if (ref.type == "bold" || ref.type == "boldItalic") {
                            cssValues['font-weight'] = 'bold';
                        }
                        if (ref.type == "italic" || ref.type == "boldItalic") {
                            cssValues['font-style'] = 'italic';
                        }
                        const cssText = this.styleToString("@font-face", cssValues);
                        styleContainer.appendChild(this.createComment(`docxjs ${f.name} font`));
                        styleContainer.appendChild(this.createStyleElement(cssText));
                    }));
                }
            }
        }
        processStyleName(className) {
            return className ? `${this.className}_${escapeClassName(className)}` : this.className;
        }
        processStyles(styles) {
            const stylesMap = keyBy(styles.filter(x => x.id != null), x => x.id);
            for (const style of styles.filter(x => x.basedOn)) {
                var baseStyle = stylesMap[style.basedOn];
                if (baseStyle) {
                    style.paragraphProps = mergeDeep(style.paragraphProps, baseStyle.paragraphProps);
                    style.runProps = mergeDeep(style.runProps, baseStyle.runProps);
                    for (const baseValues of baseStyle.styles) {
                        const styleValues = style.styles.find(x => x.target == baseValues.target);
                        if (styleValues) {
                            this.copyStyleProperties(baseValues.values, styleValues.values);
                        }
                        else {
                            style.styles.push({ ...baseValues, values: { ...baseValues.values } });
                        }
                    }
                }
                else if (this.options.debug)
                    console.warn(`Can't find base style ${style.basedOn}`);
            }
            for (let style of styles) {
                style.cssName = this.processStyleName(style.id);
            }
            return stylesMap;
        }
        prodessNumberings(numberings) {
            for (let num of numberings.filter(n => n.pStyleName)) {
                const style = this.findStyle(num.pStyleName);
                if (style?.paragraphProps?.numbering) {
                    style.paragraphProps.numbering.level = num.level;
                }
            }
        }
        processElement(element) {
            if (element.children) {
                for (var e of element.children) {
                    e.parent = element;
                    if (e.type == DomType.Table) {
                        this.processTable(e);
                    }
                    else {
                        this.processElement(e);
                    }
                }
            }
        }
        processTable(table) {
            for (var r of table.children) {
                for (var c of r.children) {
                    c.cssStyle = this.copyStyleProperties(table.cellStyle, c.cssStyle, [
                        "border-left", "border-right", "border-top", "border-bottom",
                        "padding-left", "padding-right", "padding-top", "padding-bottom"
                    ]);
                    this.processElement(c);
                }
            }
        }
        copyStyleProperties(input, output, attrs = null) {
            if (!input)
                return output;
            if (output == null)
                output = {};
            if (attrs == null)
                attrs = Object.getOwnPropertyNames(input);
            for (var key of attrs) {
                if (input.hasOwnProperty(key) && !output.hasOwnProperty(key))
                    output[key] = input[key];
            }
            return output;
        }
        createPageElement(className, props) {
            var elem = this.createElement("section", { className });
            if (props) {
                if (props.pageMargins) {
                    elem.style.paddingLeft = props.pageMargins.left;
                    elem.style.paddingRight = props.pageMargins.right;
                    elem.style.paddingTop = props.pageMargins.top;
                    elem.style.paddingBottom = props.pageMargins.bottom;
                }
                if (props.pageSize) {
                    if (!this.options.ignoreWidth)
                        elem.style.width = props.pageSize.width;
                    if (!this.options.ignoreHeight)
                        elem.style.minHeight = props.pageSize.height;
                }
            }
            return elem;
        }
        createSectionContent(props) {
            var elem = this.createElement("article");
            if (props.columns && props.columns.numberOfColumns) {
                elem.style.columnCount = `${props.columns.numberOfColumns}`;
                elem.style.columnGap = props.columns.space;
                if (props.columns.separator) {
                    elem.style.columnRule = "1px solid black";
                }
            }
            return elem;
        }
        renderSections(document) {
            const result = [];
            this.processElement(document);
            const sections = this.splitBySection(document.children, document.props);
            const pages = this.groupByPageBreaks(sections);
            let prevProps = null;
            for (let i = 0, l = pages.length; i < l; i++) {
                this.currentFootnoteIds = [];
                const section = pages[i][0];
                let props = section.sectProps;
                const pageElement = this.createPageElement(this.className, props);
                this.renderStyleValues(document.cssStyle, pageElement);
                this.options.renderHeaders && this.renderHeaderFooter(props.headerRefs, props, result.length, prevProps != props, pageElement);
                for (const sect of pages[i]) {
                    var contentElement = this.createSectionContent(sect.sectProps);
                    this.renderElements(sect.elements, contentElement);
                    pageElement.appendChild(contentElement);
                    props = sect.sectProps;
                }
                if (this.options.renderFootnotes) {
                    this.renderNotes(this.currentFootnoteIds, this.footnoteMap, pageElement);
                }
                if (this.options.renderEndnotes && i == l - 1) {
                    this.renderNotes(this.currentEndnoteIds, this.endnoteMap, pageElement);
                }
                this.options.renderFooters && this.renderHeaderFooter(props.footerRefs, props, result.length, prevProps != props, pageElement);
                result.push(pageElement);
                prevProps = props;
            }
            return result;
        }
        renderHeaderFooter(refs, props, page, firstOfSection, into) {
            if (!refs)
                return;
            var ref = (props.titlePage && firstOfSection ? refs.find(x => x.type == "first") : null)
                ?? (page % 2 == 1 ? refs.find(x => x.type == "even") : null)
                ?? refs.find(x => x.type == "default");
            var part = ref && this.document.findPartByRelId(ref.id, this.document.documentPart);
            if (part) {
                this.currentPart = part;
                if (!this.usedHederFooterParts.includes(part.path)) {
                    this.processElement(part.rootElement);
                    this.usedHederFooterParts.push(part.path);
                }
                const [el] = this.renderElements([part.rootElement], into);
                if (props?.pageMargins) {
                    if (part.rootElement.type === DomType.Header) {
                        el.style.marginTop = `calc(${props.pageMargins.header} - ${props.pageMargins.top})`;
                        el.style.minHeight = `calc(${props.pageMargins.top} - ${props.pageMargins.header})`;
                    }
                    else if (part.rootElement.type === DomType.Footer) {
                        el.style.marginBottom = `calc(${props.pageMargins.footer} - ${props.pageMargins.bottom})`;
                        el.style.minHeight = `calc(${props.pageMargins.bottom} - ${props.pageMargins.footer})`;
                    }
                }
                this.currentPart = null;
            }
        }
        isPageBreakElement(elem) {
            if (elem.type != DomType.Break)
                return false;
            if (elem.break == "lastRenderedPageBreak")
                return !this.options.ignoreLastRenderedPageBreak;
            return elem.break == "page";
        }
        isPageBreakSection(prev, next) {
            if (!prev)
                return false;
            if (!next)
                return false;
            return prev.pageSize?.orientation != next.pageSize?.orientation
                || prev.pageSize?.width != next.pageSize?.width
                || prev.pageSize?.height != next.pageSize?.height;
        }
        splitBySection(elements, defaultProps) {
            var current = { sectProps: null, elements: [], pageBreak: false };
            var result = [current];
            for (let elem of elements) {
                if (elem.type == DomType.Paragraph) {
                    const s = this.findStyle(elem.styleName);
                    if (s?.paragraphProps?.pageBreakBefore) {
                        current.sectProps = sectProps;
                        current.pageBreak = true;
                        current = { sectProps: null, elements: [], pageBreak: false };
                        result.push(current);
                    }
                }
                current.elements.push(elem);
                if (elem.type == DomType.Paragraph) {
                    const p = elem;
                    var sectProps = p.sectionProps;
                    var pBreakIndex = -1;
                    var rBreakIndex = -1;
                    if (this.options.breakPages && p.children) {
                        pBreakIndex = p.children.findIndex(r => {
                            rBreakIndex = r.children?.findIndex(this.isPageBreakElement.bind(this)) ?? -1;
                            return rBreakIndex != -1;
                        });
                    }
                    if (sectProps || pBreakIndex != -1) {
                        current.sectProps = sectProps;
                        current.pageBreak = pBreakIndex != -1;
                        current = { sectProps: null, elements: [], pageBreak: false };
                        result.push(current);
                    }
                    if (pBreakIndex != -1) {
                        let breakRun = p.children[pBreakIndex];
                        let splitRun = rBreakIndex < breakRun.children.length - 1;
                        if (pBreakIndex < p.children.length - 1 || splitRun) {
                            var children = elem.children;
                            var newParagraph = { ...elem, children: children.slice(pBreakIndex) };
                            elem.children = children.slice(0, pBreakIndex);
                            current.elements.push(newParagraph);
                            if (splitRun) {
                                let runChildren = breakRun.children;
                                let newRun = { ...breakRun, children: runChildren.slice(0, rBreakIndex) };
                                elem.children.push(newRun);
                                breakRun.children = runChildren.slice(rBreakIndex);
                            }
                        }
                    }
                }
            }
            let currentSectProps = null;
            for (let i = result.length - 1; i >= 0; i--) {
                if (result[i].sectProps == null) {
                    result[i].sectProps = currentSectProps ?? defaultProps;
                }
                else {
                    currentSectProps = result[i].sectProps;
                }
            }
            return result;
        }
        groupByPageBreaks(sections) {
            let current = [];
            let prev;
            const result = [current];
            for (let s of sections) {
                current.push(s);
                if (this.options.ignoreLastRenderedPageBreak || s.pageBreak || this.isPageBreakSection(prev, s.sectProps))
                    result.push(current = []);
                prev = s.sectProps;
            }
            return result.filter(x => x.length > 0);
        }
        renderWrapper(children) {
            return this.createElement("div", { className: `${this.className}-wrapper` }, children);
        }
        renderDefaultStyle() {
            var c = this.className;
            var wrapperStyle = `
.${c}-wrapper { background: gray; padding: 30px; padding-bottom: 0px; display: flex; flex-flow: column; align-items: center; } 
.${c}-wrapper>section.${c} { background: white; box-shadow: 0 0 10px rgba(0, 0, 0, 0.5); margin-bottom: 30px; }`;
            if (this.options.hideWrapperOnPrint) {
                wrapperStyle = `@media not print { ${wrapperStyle} }`;
            }
            var styleText = `${wrapperStyle}
.${c} { color: black; hyphens: auto; text-underline-position: from-font; }
section.${c} { box-sizing: border-box; display: flex; flex-flow: column nowrap; position: relative; overflow: hidden; }
section.${c}>article { margin-bottom: auto; z-index: 1; }
section.${c}>footer { z-index: 1; }
.${c} table { border-collapse: collapse; }
.${c} table td, .${c} table th { vertical-align: top; }
.${c} p { margin: 0pt; min-height: 1em; }
.${c} span { white-space: pre-wrap; overflow-wrap: break-word; }
.${c} a { color: inherit; text-decoration: inherit; }
.${c} svg { fill: transparent; }
`;
            if (this.options.renderComments) {
                styleText += `
.${c}-comment-ref { cursor: default; }
.${c}-comment-popover { display: none; z-index: 1000; padding: 0.5rem; background: white; position: absolute; box-shadow: 0 0 0.25rem rgba(0, 0, 0, 0.25); width: 30ch; }
.${c}-comment-ref:hover~.${c}-comment-popover { display: block; }
.${c}-comment-author,.${c}-comment-date { font-size: 0.875rem; color: #888; }
`;
            }
            return this.createStyleElement(styleText);
        }
        renderNumbering(numberings, styleContainer) {
            var styleText = "";
            var resetCounters = [];
            for (var num of numberings) {
                var selector = `p.${this.numberingClass(num.id, num.level)}`;
                var listStyleType = "none";
                if (num.bullet) {
                    let valiable = `--${this.className}-${num.bullet.src}`.toLowerCase();
                    styleText += this.styleToString(`${selector}:before`, {
                        "content": "' '",
                        "display": "inline-block",
                        "background": `var(${valiable})`
                    }, num.bullet.style);
                    this.tasks.push(this.document.loadNumberingImage(num.bullet.src).then(data => {
                        var text = `${this.rootSelector} { ${valiable}: url(${data}) }`;
                        styleContainer.appendChild(this.createStyleElement(text));
                    }));
                }
                else if (num.levelText) {
                    let counter = this.numberingCounter(num.id, num.level);
                    const counterReset = counter + " " + (num.start - 1);
                    if (num.level > 0) {
                        styleText += this.styleToString(`p.${this.numberingClass(num.id, num.level - 1)}`, {
                            "counter-set": counterReset
                        });
                    }
                    resetCounters.push(counterReset);
                    styleText += this.styleToString(`${selector}:before`, {
                        "content": this.levelTextToContent(num.levelText, num.suff, num.id, this.numFormatToCssValue(num.format)),
                        "counter-increment": counter,
                        ...num.rStyle,
                    });
                }
                else {
                    listStyleType = this.numFormatToCssValue(num.format);
                }
                styleText += this.styleToString(selector, {
                    "display": "list-item",
                    "list-style-position": "inside",
                    "list-style-type": listStyleType,
                    ...num.pStyle
                });
            }
            if (resetCounters.length > 0) {
                styleText += this.styleToString(this.rootSelector, {
                    "counter-reset": resetCounters.join(" ")
                });
            }
            return this.createStyleElement(styleText);
        }
        renderStyles(styles) {
            var styleText = "";
            const stylesMap = this.styleMap;
            const defautStyles = keyBy(styles.filter(s => s.isDefault), s => s.target);
            for (const style of styles) {
                var subStyles = style.styles;
                if (style.linked) {
                    var linkedStyle = style.linked && stylesMap[style.linked];
                    if (linkedStyle)
                        subStyles = subStyles.concat(linkedStyle.styles);
                    else if (this.options.debug)
                        console.warn(`Can't find linked style ${style.linked}`);
                }
                for (const subStyle of subStyles) {
                    var selector = `${style.target ?? ''}.${style.cssName}`;
                    if (style.target != subStyle.target)
                        selector += ` ${subStyle.target}`;
                    if (defautStyles[style.target] == style)
                        selector = `.${this.className} ${style.target}, ` + selector;
                    styleText += this.styleToString(selector, subStyle.values);
                }
            }
            return this.createStyleElement(styleText);
        }
        renderNotes(noteIds, notesMap, into) {
            var notes = noteIds.map(id => notesMap[id]).filter(x => x);
            if (notes.length > 0) {
                var result = this.createElement("ol", null, this.renderElements(notes));
                into.appendChild(result);
            }
        }
        renderElement(elem) {
            switch (elem.type) {
                case DomType.Paragraph:
                    return this.renderParagraph(elem);
                case DomType.BookmarkStart:
                    return this.renderBookmarkStart(elem);
                case DomType.BookmarkEnd:
                    return null;
                case DomType.Run:
                    return this.renderRun(elem);
                case DomType.Table:
                    return this.renderTable(elem);
                case DomType.Row:
                    return this.renderTableRow(elem);
                case DomType.Cell:
                    return this.renderTableCell(elem);
                case DomType.Hyperlink:
                    return this.renderHyperlink(elem);
                case DomType.SmartTag:
                    return this.renderSmartTag(elem);
                case DomType.Drawing:
                    return this.renderDrawing(elem);
                case DomType.Image:
                    return this.renderImage(elem);
                case DomType.Text:
                    return this.renderText(elem);
                case DomType.Text:
                    return this.renderText(elem);
                case DomType.DeletedText:
                    return this.renderDeletedText(elem);
                case DomType.Tab:
                    return this.renderTab(elem);
                case DomType.Symbol:
                    return this.renderSymbol(elem);
                case DomType.Break:
                    return this.renderBreak(elem);
                case DomType.Footer:
                    return this.renderContainer(elem, "footer");
                case DomType.Header:
                    return this.renderContainer(elem, "header");
                case DomType.Footnote:
                case DomType.Endnote:
                    return this.renderContainer(elem, "li");
                case DomType.FootnoteReference:
                    return this.renderFootnoteReference(elem);
                case DomType.EndnoteReference:
                    return this.renderEndnoteReference(elem);
                case DomType.NoBreakHyphen:
                    return this.createElement("wbr");
                case DomType.VmlPicture:
                    return this.renderVmlPicture(elem);
                case DomType.VmlElement:
                    return this.renderVmlElement(elem);
                case DomType.MmlMath: {
                    const html = renderOmmlToHtml(elem._raw);
                    if (html) {
                        const wrapper = this.createElement('span');
                        wrapper.innerHTML = html;
                        return wrapper;
                    }
                    return this.renderContainerNS(elem, ns.mathML, "math", { xmlns: ns.mathML });
                }
                case DomType.MmlMathParagraph: {
                    const html = renderOmmlToHtml(elem._raw);
                    if (html) {
                        const wrapper = this.createElement('span');
                        wrapper.innerHTML = html;
                        return wrapper;
                    }
                    return this.renderContainer(elem, "span");
                }
                case DomType.MmlFraction:
                    return this.renderContainerNS(elem, ns.mathML, "mfrac");
                case DomType.MmlBase:
                    return this.renderContainerNS(elem, ns.mathML, elem.parent.type == DomType.MmlMatrixRow ? "mtd" : "mrow");
                case DomType.MmlNumerator:
                case DomType.MmlDenominator:
                case DomType.MmlFunction:
                case DomType.MmlLimit:
                case DomType.MmlBox:
                    return this.renderContainerNS(elem, ns.mathML, "mrow");
                case DomType.MmlGroupChar:
                    return this.renderMmlGroupChar(elem);
                case DomType.MmlLimitLower:
                    return this.renderContainerNS(elem, ns.mathML, "munder");
                case DomType.MmlMatrix:
                    return this.renderContainerNS(elem, ns.mathML, "mtable");
                case DomType.MmlMatrixRow:
                    return this.renderContainerNS(elem, ns.mathML, "mtr");
                case DomType.MmlRadical:
                    return this.renderMmlRadical(elem);
                case DomType.MmlSuperscript:
                    return this.renderContainerNS(elem, ns.mathML, "msup");
                case DomType.MmlSubscript:
                    return this.renderContainerNS(elem, ns.mathML, "msub");
                case DomType.MmlDegree:
                case DomType.MmlSuperArgument:
                case DomType.MmlSubArgument:
                    return this.renderContainerNS(elem, ns.mathML, "mn");
                case DomType.MmlFunctionName:
                    return this.renderContainerNS(elem, ns.mathML, "ms");
                case DomType.MmlDelimiter:
                    return this.renderMmlDelimiter(elem);
                case DomType.MmlRun:
                    return this.renderMmlRun(elem);
                case DomType.MmlNary:
                    return this.renderMmlNary(elem);
                case DomType.MmlPreSubSuper:
                    return this.renderMmlPreSubSuper(elem);
                case DomType.MmlBar:
                    return this.renderMmlBar(elem);
                case DomType.MmlEquationArray:
                    return this.renderMllList(elem);
                case DomType.Inserted:
                    return this.renderInserted(elem);
                case DomType.Deleted:
                    return this.renderDeleted(elem);
                case DomType.CommentRangeStart:
                    return this.renderCommentRangeStart(elem);
                case DomType.CommentRangeEnd:
                    return this.renderCommentRangeEnd(elem);
                case DomType.CommentReference:
                    return this.renderCommentReference(elem);
                case DomType.AltChunk:
                    return this.renderAltChunk(elem);
            }
            return null;
        }
        renderElements(elems, into) {
            if (elems == null)
                return null;
            var result = elems.flatMap(e => this.renderElement(e)).filter(e => e != null);
            if (into)
                appendChildren(into, result);
            return result;
        }
        renderContainer(elem, tagName, props) {
            return this.createElement(tagName, props, this.renderElements(elem.children));
        }
        renderContainerNS(elem, ns, tagName, props) {
            return this.createElementNS(ns, tagName, props, this.renderElements(elem.children));
        }
        renderParagraph(elem) {
            var result = this.renderContainer(elem, "p");
            const style = this.findStyle(elem.styleName);
            elem.tabs ?? (elem.tabs = style?.paragraphProps?.tabs);
            this.renderClass(elem, result);
            this.renderStyleValues(elem.cssStyle, result);
            this.renderCommonProperties(result.style, elem);
            const numbering = elem.numbering ?? style?.paragraphProps?.numbering;
            if (numbering) {
                result.classList.add(this.numberingClass(numbering.id, numbering.level));
            }
            return result;
        }
        renderRunProperties(style, props) {
            this.renderCommonProperties(style, props);
        }
        renderCommonProperties(style, props) {
            if (props == null)
                return;
            if (props.color) {
                style["color"] = props.color;
            }
            if (props.fontSize) {
                style["font-size"] = props.fontSize;
            }
        }
        renderHyperlink(elem) {
            var result = this.renderContainer(elem, "a");
            this.renderStyleValues(elem.cssStyle, result);
            let href = '';
            if (elem.id) {
                const rel = this.document.documentPart.rels.find(it => it.id == elem.id && it.targetMode === "External");
                href = rel?.target ?? href;
            }
            if (elem.anchor) {
                href += `#${elem.anchor}`;
            }
            result.href = href;
            return result;
        }
        renderSmartTag(elem) {
            return this.renderContainer(elem, "span");
        }
        renderCommentRangeStart(commentStart) {
            if (!this.options.renderComments)
                return null;
            const rng = new Range();
            this.commentHighlight?.add(rng);
            const result = this.htmlDocument.createComment(`start of comment #${commentStart.id}`);
            this.later(() => rng.setStart(result, 0));
            this.commentMap[commentStart.id] = rng;
            return result;
        }
        renderCommentRangeEnd(commentEnd) {
            if (!this.options.renderComments)
                return null;
            const rng = this.commentMap[commentEnd.id];
            const result = this.htmlDocument.createComment(`end of comment #${commentEnd.id}`);
            this.later(() => rng?.setEnd(result, 0));
            return result;
        }
        renderCommentReference(commentRef) {
            if (!this.options.renderComments)
                return null;
            var comment = this.document.commentsPart?.commentMap[commentRef.id];
            if (!comment)
                return null;
            const frg = new DocumentFragment();
            const commentRefEl = this.createElement("span", { className: `${this.className}-comment-ref` }, ['💬']);
            const commentsContainerEl = this.createElement("div", { className: `${this.className}-comment-popover` });
            this.renderCommentContent(comment, commentsContainerEl);
            frg.appendChild(this.htmlDocument.createComment(`comment #${comment.id} by ${comment.author} on ${comment.date}`));
            frg.appendChild(commentRefEl);
            frg.appendChild(commentsContainerEl);
            return frg;
        }
        renderAltChunk(elem) {
            if (!this.options.renderAltChunks)
                return null;
            var result = this.createElement("iframe");
            this.tasks.push(this.document.loadAltChunk(elem.id, this.currentPart).then(x => {
                result.srcdoc = x;
            }));
            return result;
        }
        renderCommentContent(comment, container) {
            container.appendChild(this.createElement('div', { className: `${this.className}-comment-author` }, [comment.author]));
            container.appendChild(this.createElement('div', { className: `${this.className}-comment-date` }, [new Date(comment.date).toLocaleString()]));
            this.renderElements(comment.children, container);
        }
        renderDrawing(elem) {
            var result = this.renderContainer(elem, "div");
            result.style.display = "inline-block";
            result.style.position = "relative";
            result.style.textIndent = "0px";
            this.renderStyleValues(elem.cssStyle, result);
            return result;
        }
        renderImage(elem) {
            let result = this.createElement("img");
            let transform = elem.cssStyle?.transform;
            this.renderStyleValues(elem.cssStyle, result);
            if (elem.srcRect && elem.srcRect.some(x => x != 0)) {
                var [left, top, right, bottom] = elem.srcRect;
                transform = `scale(${1 / (1 - left - right)}, ${1 / (1 - top - bottom)})`;
                result.style['clip-path'] = `rect(${(100 * top).toFixed(2)}% ${(100 * (1 - right)).toFixed(2)}% ${(100 * (1 - bottom)).toFixed(2)}% ${(100 * left).toFixed(2)}%)`;
            }
            if (elem.rotation)
                transform = `rotate(${elem.rotation}deg) ${transform ?? ''}`;
            result.style.transform = transform?.trim();
            if (this.document) {
                this.tasks.push(this.document.loadDocumentImage(elem.src, this.currentPart).then(x => {
                    result.src = x;
                }));
            }
            return result;
        }
        renderText(elem) {
            return this.htmlDocument.createTextNode(elem.text);
        }
        renderDeletedText(elem) {
            return this.options.renderEndnotes ? this.htmlDocument.createTextNode(elem.text) : null;
        }
        renderBreak(elem) {
            if (elem.break == "textWrapping") {
                return this.createElement("br");
            }
            return null;
        }
        renderInserted(elem) {
            if (this.options.renderChanges)
                return this.renderContainer(elem, "ins");
            return this.renderElements(elem.children);
        }
        renderDeleted(elem) {
            if (this.options.renderChanges)
                return this.renderContainer(elem, "del");
            return null;
        }
        renderSymbol(elem) {
            var span = this.createElement("span");
            span.style.fontFamily = elem.font;
            span.innerHTML = `&#x${elem.char};`;
            return span;
        }
        renderFootnoteReference(elem) {
            var result = this.createElement("sup");
            this.currentFootnoteIds.push(elem.id);
            result.textContent = `${this.currentFootnoteIds.length}`;
            return result;
        }
        renderEndnoteReference(elem) {
            var result = this.createElement("sup");
            this.currentEndnoteIds.push(elem.id);
            result.textContent = `${this.currentEndnoteIds.length}`;
            return result;
        }
        renderTab(elem) {
            var tabSpan = this.createElement("span");
            tabSpan.innerHTML = "&emsp;";
            if (this.options.experimental) {
                tabSpan.className = this.tabStopClass();
                var stops = findParent(elem, DomType.Paragraph)?.tabs;
                this.currentTabs.push({ stops, span: tabSpan });
            }
            return tabSpan;
        }
        renderBookmarkStart(elem) {
            return this.createElement("span", { id: elem.name });
        }
        renderRun(elem) {
            if (elem.fieldRun)
                return null;
            const result = this.createElement("span");
            if (elem.id)
                result.id = elem.id;
            this.renderClass(elem, result);
            this.renderStyleValues(elem.cssStyle, result);
            if (elem.verticalAlign) {
                const wrapper = this.createElement(elem.verticalAlign);
                this.renderElements(elem.children, wrapper);
                result.appendChild(wrapper);
            }
            else {
                this.renderElements(elem.children, result);
            }
            return result;
        }
        renderTable(elem) {
            let result = this.createElement("table");
            this.tableCellPositions.push(this.currentCellPosition);
            this.tableVerticalMerges.push(this.currentVerticalMerge);
            this.currentVerticalMerge = {};
            this.currentCellPosition = { col: 0, row: 0 };
            if (elem.columns)
                result.appendChild(this.renderTableColumns(elem.columns));
            this.renderClass(elem, result);
            this.renderElements(elem.children, result);
            this.renderStyleValues(elem.cssStyle, result);
            this.currentVerticalMerge = this.tableVerticalMerges.pop();
            this.currentCellPosition = this.tableCellPositions.pop();
            return result;
        }
        renderTableColumns(columns) {
            let result = this.createElement("colgroup");
            for (let col of columns) {
                let colElem = this.createElement("col");
                if (col.width)
                    colElem.style.width = col.width;
                result.appendChild(colElem);
            }
            return result;
        }
        renderTableRow(elem) {
            let result = this.createElement("tr");
            this.currentCellPosition.col = 0;
            if (elem.gridBefore)
                result.appendChild(this.renderTableCellPlaceholder(elem.gridBefore));
            this.renderClass(elem, result);
            this.renderElements(elem.children, result);
            this.renderStyleValues(elem.cssStyle, result);
            if (elem.gridAfter)
                result.appendChild(this.renderTableCellPlaceholder(elem.gridAfter));
            this.currentCellPosition.row++;
            return result;
        }
        renderTableCellPlaceholder(colSpan) {
            const result = this.createElement("td", { colSpan });
            result.style['border'] = 'none';
            return result;
        }
        renderTableCell(elem) {
            let result = this.renderContainer(elem, "td");
            const key = this.currentCellPosition.col;
            if (elem.verticalMerge) {
                if (elem.verticalMerge == "restart") {
                    this.currentVerticalMerge[key] = result;
                    result.rowSpan = 1;
                }
                else if (this.currentVerticalMerge[key]) {
                    this.currentVerticalMerge[key].rowSpan += 1;
                    result.style.display = "none";
                }
            }
            else {
                this.currentVerticalMerge[key] = null;
            }
            this.renderClass(elem, result);
            this.renderStyleValues(elem.cssStyle, result);
            if (elem.span)
                result.colSpan = elem.span;
            this.currentCellPosition.col += result.colSpan;
            return result;
        }
        renderVmlPicture(elem) {
            return this.renderContainer(elem, "div");
        }
        renderVmlElement(elem) {
            var container = this.createSvgElement("svg");
            container.setAttribute("style", elem.cssStyleText);
            const result = this.renderVmlChildElement(elem);
            if (elem.imageHref?.id) {
                this.tasks.push(this.document?.loadDocumentImage(elem.imageHref.id, this.currentPart)
                    .then(x => result.setAttribute("href", x)));
            }
            container.appendChild(result);
            requestAnimationFrame(() => {
                const bb = container.firstElementChild.getBBox();
                container.setAttribute("width", `${Math.ceil(bb.x + bb.width)}`);
                container.setAttribute("height", `${Math.ceil(bb.y + bb.height)}`);
            });
            return container;
        }
        renderVmlChildElement(elem) {
            const result = this.createSvgElement(elem.tagName);
            Object.entries(elem.attrs).forEach(([k, v]) => result.setAttribute(k, v));
            for (let child of elem.children) {
                if (child.type == DomType.VmlElement) {
                    result.appendChild(this.renderVmlChildElement(child));
                }
                else {
                    result.appendChild(...asArray(this.renderElement(child)));
                }
            }
            return result;
        }
        renderMmlRadical(elem) {
            const base = elem.children.find(el => el.type == DomType.MmlBase);
            if (elem.props?.hideDegree) {
                return this.createElementNS(ns.mathML, "msqrt", null, this.renderElements([base]));
            }
            const degree = elem.children.find(el => el.type == DomType.MmlDegree);
            return this.createElementNS(ns.mathML, "mroot", null, this.renderElements([base, degree]));
        }
        renderMmlDelimiter(elem) {
            const children = [];
            children.push(this.createElementNS(ns.mathML, "mo", null, [elem.props.beginChar ?? '(']));
            children.push(...this.renderElements(elem.children));
            children.push(this.createElementNS(ns.mathML, "mo", null, [elem.props.endChar ?? ')']));
            return this.createElementNS(ns.mathML, "mrow", null, children);
        }
        renderMmlNary(elem) {
            const children = [];
            const grouped = keyBy(elem.children, x => x.type);
            const sup = grouped[DomType.MmlSuperArgument];
            const sub = grouped[DomType.MmlSubArgument];
            const supElem = sup ? this.createElementNS(ns.mathML, "mo", null, asArray(this.renderElement(sup))) : null;
            const subElem = sub ? this.createElementNS(ns.mathML, "mo", null, asArray(this.renderElement(sub))) : null;
            const charElem = this.createElementNS(ns.mathML, "mo", null, [elem.props?.char ?? '\u222B']);
            if (supElem || subElem) {
                children.push(this.createElementNS(ns.mathML, "munderover", null, [charElem, subElem, supElem]));
            }
            else if (supElem) {
                children.push(this.createElementNS(ns.mathML, "mover", null, [charElem, supElem]));
            }
            else if (subElem) {
                children.push(this.createElementNS(ns.mathML, "munder", null, [charElem, subElem]));
            }
            else {
                children.push(charElem);
            }
            children.push(...this.renderElements(grouped[DomType.MmlBase].children));
            return this.createElementNS(ns.mathML, "mrow", null, children);
        }
        renderMmlPreSubSuper(elem) {
            const children = [];
            const grouped = keyBy(elem.children, x => x.type);
            const sup = grouped[DomType.MmlSuperArgument];
            const sub = grouped[DomType.MmlSubArgument];
            const supElem = sup ? this.createElementNS(ns.mathML, "mo", null, asArray(this.renderElement(sup))) : null;
            const subElem = sub ? this.createElementNS(ns.mathML, "mo", null, asArray(this.renderElement(sub))) : null;
            const stubElem = this.createElementNS(ns.mathML, "mo", null);
            children.push(this.createElementNS(ns.mathML, "msubsup", null, [stubElem, subElem, supElem]));
            children.push(...this.renderElements(grouped[DomType.MmlBase].children));
            return this.createElementNS(ns.mathML, "mrow", null, children);
        }
        renderMmlGroupChar(elem) {
            const tagName = elem.props.verticalJustification === "bot" ? "mover" : "munder";
            const result = this.renderContainerNS(elem, ns.mathML, tagName);
            if (elem.props.char) {
                result.appendChild(this.createElementNS(ns.mathML, "mo", null, [elem.props.char]));
            }
            return result;
        }
        renderMmlBar(elem) {
            const result = this.renderContainerNS(elem, ns.mathML, "mrow");
            switch (elem.props.position) {
                case "top":
                    result.style.textDecoration = "overline";
                    break;
                case "bottom":
                    result.style.textDecoration = "underline";
                    break;
            }
            return result;
        }
        renderMmlRun(elem) {
            const result = this.createElementNS(ns.mathML, "ms", null, this.renderElements(elem.children));
            this.renderClass(elem, result);
            this.renderStyleValues(elem.cssStyle, result);
            return result;
        }
        renderMllList(elem) {
            const result = this.createElementNS(ns.mathML, "mtable");
            this.renderClass(elem, result);
            this.renderStyleValues(elem.cssStyle, result);
            for (let child of this.renderElements(elem.children)) {
                result.appendChild(this.createElementNS(ns.mathML, "mtr", null, [
                    this.createElementNS(ns.mathML, "mtd", null, [child])
                ]));
            }
            return result;
        }
        renderStyleValues(style, ouput) {
            for (let k in style) {
                if (k.startsWith("$")) {
                    ouput.setAttribute(k.slice(1), style[k]);
                }
                else {
                    ouput.style[k] = style[k];
                }
            }
        }
        renderClass(input, ouput) {
            if (input.className)
                ouput.className = input.className;
            if (input.styleName)
                ouput.classList.add(this.processStyleName(input.styleName));
        }
        findStyle(styleName) {
            return styleName && this.styleMap?.[styleName];
        }
        numberingClass(id, lvl) {
            return `${this.className}-num-${id}-${lvl}`;
        }
        tabStopClass() {
            return `${this.className}-tab-stop`;
        }
        styleToString(selectors, values, cssText = null) {
            let result = `${selectors} {\r\n`;
            for (const key in values) {
                if (key.startsWith('$'))
                    continue;
                result += `  ${key}: ${values[key]};\r\n`;
            }
            if (cssText)
                result += cssText;
            return result + "}\r\n";
        }
        numberingCounter(id, lvl) {
            return `${this.className}-num-${id}-${lvl}`;
        }
        levelTextToContent(text, suff, id, numformat) {
            const suffMap = {
                "tab": "\\9",
                "space": "\\a0",
            };
            var result = text.replace(/%\d*/g, s => {
                let lvl = parseInt(s.substring(1), 10) - 1;
                return `"counter(${this.numberingCounter(id, lvl)}, ${numformat})"`;
            });
            return `"${result}${suffMap[suff] ?? ""}"`;
        }
        numFormatToCssValue(format) {
            var mapping = {
                none: "none",
                bullet: "disc",
                decimal: "decimal",
                lowerLetter: "lower-alpha",
                upperLetter: "upper-alpha",
                lowerRoman: "lower-roman",
                upperRoman: "upper-roman",
                decimalZero: "decimal-leading-zero",
                aiueo: "katakana",
                aiueoFullWidth: "katakana",
                chineseCounting: "simp-chinese-informal",
                chineseCountingThousand: "simp-chinese-informal",
                chineseLegalSimplified: "simp-chinese-formal",
                chosung: "hangul-consonant",
                ideographDigital: "cjk-ideographic",
                ideographTraditional: "cjk-heavenly-stem",
                ideographLegalTraditional: "trad-chinese-formal",
                ideographZodiac: "cjk-earthly-branch",
                iroha: "katakana-iroha",
                irohaFullWidth: "katakana-iroha",
                japaneseCounting: "japanese-informal",
                japaneseDigitalTenThousand: "cjk-decimal",
                japaneseLegal: "japanese-formal",
                thaiNumbers: "thai",
                koreanCounting: "korean-hangul-formal",
                koreanDigital: "korean-hangul-formal",
                koreanDigital2: "korean-hanja-informal",
                hebrew1: "hebrew",
                hebrew2: "hebrew",
                hindiNumbers: "devanagari",
                ganada: "hangul",
                taiwaneseCounting: "cjk-ideographic",
                taiwaneseCountingThousand: "cjk-ideographic",
                taiwaneseDigital: "cjk-decimal",
            };
            return mapping[format] ?? format;
        }
        refreshTabStops() {
            if (!this.options.experimental)
                return;
            setTimeout(() => {
                const pixelToPoint = computePixelToPoint();
                for (let tab of this.currentTabs) {
                    updateTabStop(tab.span, tab.stops, this.defaultTabSize, pixelToPoint);
                }
            }, 500);
        }
        createElementNS(ns, tagName, props, children) {
            var result = ns ? this.htmlDocument.createElementNS(ns, tagName) : this.htmlDocument.createElement(tagName);
            Object.assign(result, props);
            children && appendChildren(result, children);
            return result;
        }
        createElement(tagName, props, children) {
            return this.createElementNS(undefined, tagName, props, children);
        }
        createSvgElement(tagName, props, children) {
            return this.createElementNS(ns.svg, tagName, props, children);
        }
        createStyleElement(cssText) {
            return this.createElement("style", { innerHTML: cssText });
        }
        createComment(text) {
            return this.htmlDocument.createComment(text);
        }
        later(func) {
            this.postRenderTasks.push(func);
        }
    }
    function removeAllElements(elem) {
        elem.innerHTML = '';
    }
    function appendChildren(elem, children) {
        children.forEach(c => elem.appendChild(isString(c) ? document.createTextNode(c) : c));
    }
    function findParent(elem, type) {
        var parent = elem.parent;
        while (parent != null && parent.type != type)
            parent = parent.parent;
        return parent;
    }

    const defaultOptions = {
        ignoreHeight: false,
        ignoreWidth: false,
        ignoreFonts: false,
        breakPages: true,
        debug: false,
        experimental: false,
        className: "docx",
        inWrapper: true,
        hideWrapperOnPrint: false,
        trimXmlDeclaration: true,
        ignoreLastRenderedPageBreak: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        useBase64URL: false,
        renderChanges: false,
        renderComments: false,
        renderAltChunks: true
    };
    function parseAsync(data, userOptions) {
        const ops = { ...defaultOptions, ...userOptions };
        return WordDocument.load(data, new DocumentParser(ops), ops);
    }
    async function renderDocument(document, bodyContainer, styleContainer, userOptions) {
        const ops = { ...defaultOptions, ...userOptions };
        const renderer = new HtmlRenderer(window.document);
        return await renderer.render(document, bodyContainer, styleContainer, ops);
    }
    async function renderAsync(data, bodyContainer, styleContainer, userOptions) {
        const doc = await parseAsync(data, userOptions);
        await renderDocument(doc, bodyContainer, styleContainer, userOptions);
        return doc;
    }

    exports.defaultOptions = defaultOptions;
    exports.parseAsync = parseAsync;
    exports.renderAsync = renderAsync;
    exports.renderDocument = renderDocument;

}));
//# sourceMappingURL=docx-preview.js.map
