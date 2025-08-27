import JSZip from "jszip";
import { parseXmlString, XmlParser } from "../parser/xml-parser";
import { splitPath } from "../utils";
import { parseRelationships, Relationship } from "./relationship";

export interface OpenXmlPackageOptions {
    trimXmlDeclaration: boolean,
    keepOrigin: boolean,
    /** Preprocess embedded images such as TIFF to PNG for browser compatibility */
    preprocessImages?: boolean,
}

export class OpenXmlPackage {
    xmlParser: XmlParser = new XmlParser();

    constructor(private _zip: JSZip, public options: OpenXmlPackageOptions) {
    }

    get(path: string): any {
        const p = normalizePath(path);
        return this._zip.files[p] ?? this._zip.files[p.replace(/\//g, '\\')];
    }

    update(path: string, content: any) {
        this._zip.file(path, content);
    }

    static async load(input: Blob | any, options: OpenXmlPackageOptions): Promise<OpenXmlPackage> {
        let zip = await JSZip.loadAsync(input);

        if (options?.preprocessImages) {
            zip = await preprocessImagesInZip(zip);
        }

        return new OpenXmlPackage(zip, options);
    }

    save(type: any = "blob"): Promise<any>  {
        return this._zip.generateAsync({ type });
    }

    load(path: string, type: JSZip.OutputType = "string"): Promise<any> {
        return this.get(path)?.async(type) ?? Promise.resolve(null);
    }

    async loadRelationships(path: string = null): Promise<Relationship[]> {
        let relsPath = `_rels/.rels`;

        if (path != null) {
            const [f, fn] = splitPath(path);
            relsPath = `${f}_rels/${fn}.rels`;
        }

        const txt = await this.load(relsPath);
		return txt ? parseRelationships(this.parseXmlDocument(txt).firstElementChild, this.xmlParser) : null;
    }

    /** @internal */
    parseXmlDocument(txt: string): Document {
        return parseXmlString(txt, this.options.trimXmlDeclaration);
    }
}

function normalizePath(path: string) {
    return path.startsWith('/') ? path.substr(1) : path;
}

// --- Image preprocessing helpers ---

/**
 * Convert unsupported image formats inside the docx to browser-friendly ones.
 * Currently: converts .tif/.tiff to PNG using UTIF.js + canvas.
 */
async function preprocessImagesInZip(zip: JSZip): Promise<JSZip> {
    // Gather TIFF entries
    const tiffFiles = zip.file(/[.]tiff?$/i) || [];
    if (!tiffFiles.length) return zip;

    for (const f of tiffFiles) {
        try {
            const buf = await f.async("uint8array");
            const pngBlob = await tiffToPngBlob(buf);
            if (pngBlob) {
                zip.file(f.name, pngBlob);
            }
        } catch (e) {
            console && console.warn && console.warn("DOCX: TIFF preprocess failed for", f.name, e);
        }
    }

    // Return a reloaded JSZip to ensure consistent state
    const blob = await zip.generateAsync({ type: "blob" });
    return await JSZip.loadAsync(blob);
}

/**
 * Minimal TIFF -> PNG conversion using UTIF if available, falling back to Tiff.js if present.
 */
async function tiffToPngBlob(buffer: Uint8Array): Promise<Blob | null> {
    // Prefer UTIF.js global if present
    const anyGlobal: any = (globalThis as any);
    const UTIF = anyGlobal?.UTIF;
    if (UTIF && typeof UTIF.decode === "function") {
        try {
            const ifds = UTIF.decode(buffer);
            if (!ifds?.length) return null;
            UTIF.decodeImage(buffer, ifds[0]);
            const rgba = UTIF.toRGBA8(ifds[0]); // Uint8Array RGBA
            const { width, height } = ifds[0];
            return rgbaToPngBlob(rgba, width, height);
        } catch {}
    }

    // Fallback to Tiff.js global if present
    const Tiff = anyGlobal?.Tiff;
    if (Tiff) {
        try {
            const t = new Tiff({ buffer });
            const canvas: HTMLCanvasElement = t.toCanvas();
            return await new Promise<Blob>(res => canvas.toBlob(b => res(b), "image/png"));
        } catch {}
    }

    return null;
}

function rgbaToPngBlob(rgba: Uint8Array, width: number, height: number): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);
    return new Promise(res => canvas.toBlob(b => res(b), "image/png"));
}