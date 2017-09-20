"use strict";

import * as WebIDL2 from "webidl2";
import * as jsdom from "jsdom";
import fetch from "node-fetch";
import * as mz from "mz/fs";
import stringify from "json-compactline";

export interface ExportRemoteDescription {
    url: string;
    title: string;
    hasIdlIndex?: boolean;
    idl?: "local" | "none" | "raw"; // TODO: merge hasIdlIndex as "indexed"
}

export interface FetchResult {
    description: ExportRemoteDescription;
    content: string;
}

export interface IDLExportResult {
    snippets: IDLSnippetContent[];
    origin: FetchResult;
    idl: string;
}

export interface IDLSnippetContent {
    callbackFunctions: WebIDL2.CallbackType[];
    callbackInterfaces: WebIDL2.InterfaceType[];
    dictionaries: WebIDL2.DictionaryType[];
    enums: WebIDL2.EnumType[];
    implements: WebIDL2.ImplementsType[];
    interfaces: WebIDL2.InterfaceType[];
    namespaces: WebIDL2.NamespaceType[];
    typedefs: WebIDL2.TypedefType[];
}

export interface MSEdgeIgnore {
    interfaces: string[];
    events: string[];
    cssProperties: string[];
}

export interface WebIDLSerializerInterfaceType extends WebIDL2.InterfaceType {
    elements?: string[];
    events?: { property: string; handler: string; interface: string; }[];
}

run();

async function run() {
    console.log("Loading spec list...");
    
    const exportList: ExportRemoteDescription[] = JSON.parse(await mz.readFile("specs.json", "utf8"));
    if (process.argv[2] === "local") {
        for (const exportInfo of exportList) {
            // use remote copy only when specified
            if (exportInfo.idl !== "none") {
                exportInfo.idl = "local";
            }
        }
    }

    console.log("Fetching from web...");
    const results = await Promise.all(exportList.map(async (description): Promise<FetchResult> => {
        if (description.idl === "local") {
            const result: FetchResult = {
                description,
                content: await mz.readFile(`localcopies/${description.title}.widl`, "utf8")
            }
            console.log(`Got a local copy for ${description.title}`);
            return result;
        }
        else if (description.idl === "none") {
            return {
                description,
                content: ""
            }
        }

        const response = await fetch(description.url);
        if (!response.ok) {
            throw new Error(`Fetching failed: HTTP ${response.status} ${response.statusText}`);
        }
        const result: FetchResult = {
            description,
            content: await response.text()
        }
        console.log(`Fetching finished from ${description.url}`);
        return result;
    }));
    console.log("Fetching complete 100%");
    
    if (!(await mz.exists("built"))) {
        await mz.mkdir("built");
    }
    if (!(await mz.exists("built/partial"))) {
        await mz.mkdir("built/partial");
    }

    console.log("Exporting and parsing WebIDL...");

    // Exporting IDL texts
    const exports = await Promise.all(results.map(result => exportIDLs(result)));
    for (const exported of exports) {
        if (exported.origin.description.idl === "local" || exported.origin.description.idl === "none") {
            continue;
        }
        await mz.writeFile(`localcopies/${exported.origin.description.title}.widl`, exported.idl);
    }

    // Loads event information from browser.webidl.xml and create interfaces for each event target
    // console.log("Loading event information from MSEdge data...");
    // const msedgeEventDocument = new DOMParser().parseFromString(await mz.readFile("supplements/browser.webidl.xml", "utf8"), "text/xml");
    // const msedgeIgnore: MSEdgeIgnore = JSON.parse(await mz.readFile("msedge-ignore.json", "utf8"));
    // const msedgeEventHandlers = exportEventHandlers(msedgeEventDocument, msedgeIgnore);
    // const msedgeEventPropertyMap = exportEventPropertyMap(msedgeEventDocument);
    // transferEventInformation(exports, msedgeEventPropertyMap);
    // exports.push(msedgeEventHandlers);

    // console.log("Loading supplements...");
    // for (const exportResult of exports) {
    //     supplements.apply(exportResult, document);
    // }

    for (const exported of exports) {
        const path = `built/partial/${exported.origin.description.title}.webidl.json`;
        await mz.writeFile(path, stringify(mergeIDLSnippets(exported.snippets)));
        console.log(`Writing as ${path}`);
    }
    console.log("Conversion as merged one as browser.webidl.json");
    await mz.writeFile("built/browser.webidl.json", stringify(mergeMultipleResults(exports)));
    console.log("Finished 100%");
}

function mergeMultipleResults(exports: IDLExportResult[]) {
    const snippets: IDLSnippetContent[] = [];
    for (const item of exports) {
        snippets.push(...item.snippets);
    }
    return mergeIDLSnippets(snippets);
}

function isWebIDLParseError(err: any): err is WebIDL2.WebIDLParseError {
    return Array.isArray(err.tokens);
}

async function exportIDLs(result: FetchResult): Promise<IDLExportResult> {
    if (result.description.idl === "local" || result.description.idl === "raw") {
        return {
            snippets: exportIDLSnippets([result.content], result), origin: result, idl: result.content
        }
    }
    else if (result.description.idl === "none") {
        return {
            snippets: [], origin: result, idl: ""
        }
    }

    const win = await jsdomEnv(result.content);
    const idlElements = Array.from(win.document.querySelectorAll("pre.idl:not(.extract),code.idl-code")); /* .extract is used on an example IDL on specs including HTML and CSSOM */
    if (!idlElements.length) {
        throw new Error(`No IDLs in ${result.description.url}`);
    }
    const idlTexts =
        result.description.hasIdlIndex ? [idlElements[idlElements.length - 1].textContent] :
            idlElements.map(element => element.textContent);

    win.close();
    return {
        snippets: exportIDLSnippets(idlTexts, result), origin: result, idl: idlTexts.join('\n\n')
    };
}

function exportIDLSnippets(idlTexts: string[], origin: FetchResult) {
    const snippets: IDLSnippetContent[] = [];

    for (const item of idlTexts) {
        try {
            const snippet = createIDLSnippetContentContainer();
            const parsed = WebIDL2.parse(item);

            for (const rootItem of parsed) {
                insert(rootItem, snippet);
            }

            snippets.push(snippet);
        }
        catch (err) {
            if (isWebIDLParseError(err)) {
                console.warn(`A syntax error has found in a WebIDL code line ${err.line} from ${origin.description.url}:\n${err.message}\n${err.input}\n`);
            }
            else {
                err.message = `An error occured while converting WebIDL from ${origin.description.url}: ${err.message}`;
                throw err;
            }
        }
    }

    return snippets;
}

function mergeIDLSnippets(snippets: IDLSnippetContent[]) {
    const result = createIDLSnippetContentContainer();

    for (const snippet of snippets) {
        result.callbackFunctions.push(...snippet.callbackFunctions);
        result.callbackInterfaces.push(...snippet.callbackInterfaces);
        result.dictionaries.push(...snippet.dictionaries);
        result.enums.push(...snippet.enums);
        result.implements.push(...snippet.implements);
        result.interfaces.push(...snippet.interfaces);
        result.namespaces.push(...snippet.namespaces);
        result.typedefs.push(...snippet.typedefs);
    }

    // TODO: merger.mergePartialTypes(result);

    // TODO:
    // result.callbackFunctions.sort(sorter);
    // result.callbackInterfaces.sort(sorter);
    // result.dictionaries.sort(sorter);
    // result.enums.sort(sorter);
    // result.implements.sort(sorter);
    // result.interfaces.sort(sorter);
    // result.namespaces.sort(sorter);
    // result.typedefs.sort((x, y) => sorter(x, y, "new-type"));

    return result;
}

function insert(webidl: WebIDL2.IDLRootType, snippetContent: IDLSnippetContent) {
    if (webidl.type === "callback") {
        snippetContent.callbackFunctions.push(webidl);
    }
    else if (webidl.type === "callback interface") {
        snippetContent.callbackInterfaces.push(webidl);
    }
    else if (webidl.type === "dictionary") {
        snippetContent.dictionaries.push(webidl);
    }
    else if (webidl.type === "enum") {
        snippetContent.enums.push(webidl);
    }
    else if (webidl.type === "implements") {
        snippetContent.implements.push(webidl);
    }
    else if (webidl.type === "interface") {
        snippetContent.interfaces.push(webidl);
    }
    else if (webidl.type === "typedef") {
        snippetContent.typedefs.push(webidl);
    }
    else if (webidl.type === "namespace") {
        snippetContent.namespaces.push(webidl);
    }
    else {
        throw new Error(`Detected unsupported root IDL type "${webidl.type}".`);
    }
}

function createIDLSnippetContentContainer(): IDLSnippetContent {
    return {
        callbackFunctions: [],
        callbackInterfaces: [],
        dictionaries: [],
        enums: [],
        implements: [],
        interfaces: [],
        namespaces: [],
        typedefs: []
    }
}

function jsdomEnv(html: string) {
    return new Promise<Window>((resolve, reject) => {
        jsdom.env(html, (error, window) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(window);
            }
        });
    });
}
