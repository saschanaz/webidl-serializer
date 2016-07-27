"use strict";

import * as WebIDL2 from "webidl2";
import { XMLSerializer, DOMImplementation } from "xmldom";
import * as jsdom from "jsdom";
import fetch from "node-fetch";
import prettifyXml = require("prettify-xml");

const impl = new DOMImplementation();

interface ExportRemoteDescription {
    url: string;
    title: string;
    hasIdlIndex: boolean;
}

const exportList: ExportRemoteDescription[] = [
    {
        url: "https://html.spec.whatwg.org/",
        title: "HTML",
        hasIdlIndex: false
    },
    {
        url: "https://dom.spec.whatwg.org/",
        title: "DOM",
        hasIdlIndex: true
    },
    {
        url: "https://cdn.rawgit.com/w3c/csswg-drafts/master/cssom-view/Overview.bs",
        title: "CSSOM View Module",
        hasIdlIndex: false
    },
    {
        url: "https://notifications.spec.whatwg.org/",
        title: "Notifications API",
        hasIdlIndex: true
    }
];

//const result = WebIDL2.parse(`
//interface CustomElementsRegistry {
//[CEReactions]
//void          define(DOMString name,
//                                        Function constructor,
//                                        optional ElementDefinitionOptions options);
//any           get(DOMString name);
//Promise<void> whenDefined(DOMString name);
//};

//dictionary ElementDefinitionOptions {
//DOMString extends;
//};`);
//console.log(convert(result));

run().catch(err => console.error(err));

interface FetchResult {
    description: ExportRemoteDescription;
    html: string;
}

async function run() {

    console.log("Fetching from web...");
    const results = await Promise.all(exportList.map(async (description): Promise<FetchResult> => {
        const response = await fetch(description.url);
        return {
            description,
            html: await response.text()
        }
    }));
    console.log("Fetch complete 100%");

    //const doc = convertAsSingleDocument(results);
    //const serializer = new XMLSerializer();
    //console.log(prettifyXml(serializer.serializeToString(doc)));

    const docs = convertAsMultipleDocument(results);
    const serializer = new XMLSerializer();
    for (const doc of docs) {
        console.log(prettifyXml(serializer.serializeToString(doc)));
    }
}

function convertAsSingleDocument(results: FetchResult[]) {
    const doc = createWebIDLXMLDocument();
    for (const result of results) {
        insertFetchResult(result, doc);
    }
    return doc;
}

function convertAsMultipleDocument(results: FetchResult[]) {
    const docs: Document[] = [];
    for (const result of results) {
        const doc = createWebIDLXMLDocument();
        insertFetchResult(result, doc);
        docs.push(doc);
    }
    return docs;
}

function isWebIDLParseError(err: any): err is WebIDL2.WebIDLParseError {
    return Array.isArray(err.tokens);
}

function exportIDLs(result: FetchResult) {
    const idlElements = Array.from(jsdom.jsdom(result.html).querySelectorAll("pre.idl"));
    if (!idlElements.length) {
        throw new Error(`No IDLs in ${result.description.url}`)
    }
    if (result.description.hasIdlIndex) {
        return [idlElements[idlElements.length - 1].textContent];
    }
    else {
        return Array.from(jsdom.jsdom(result.html).querySelectorAll("pre.idl")).map(element => element.textContent)
    }
}

function insertFetchResult(result: FetchResult, xmlDocument: Document) {
    const idls = exportIDLs(result);
    for (const item of idls) {
        try {
            const parsed = WebIDL2.parse(item);

            for (const rootItem of parsed) {
                insert(rootItem, xmlDocument);
            }
        }
        catch (err) {
            if (isWebIDLParseError(err)) {
                const werr = err as WebIDL2.WebIDLParseError; // type narrowing does not work :(
                console.warn(`A syntax error has found in a WebIDL code line ${werr.line} from ${result.description.url}:\n${werr.input}\n`);
            }
            else {
                throw new Error(`An error occured while converting WebIDL from ${result.description.url}: ${err.message || err}`);
            }
        }
    }
}

function insert(webidl: WebIDL2.IDLRootTypes, xmlDocument: Document) {
    // callbacks to <callback-functions>
    // callback-interfaces to <callback-interfaces>
    // dictionaries to <dictionaries>
    // enums to <enums>
    // non-partial non-callback interfaces and exceptions to <interfaces>
    // partial interfaces to <mixin-interfaces>
    // typedefs to <typedefs>

    if (webidl.type === "callback") {
        insertCallbackFunction(webidl, xmlDocument);
    }
    else if (webidl.type === "callback interface") {
        insertInterface(webidl, xmlDocument);
    }
    //const callbackInterfaces = xmlDocument.getElementsByTagName("callback-interfaces")[0];
    else if (webidl.type === "dictionary") {
        insertDictionary(webidl, xmlDocument);
    }
    //const enums = xmlDocument.getElementsByTagName("enums")[0];
    //const interfaces = xmlDocument.getElementsByTagName("interfaces")[0];
    //const mixinInterfaces = xmlDocument.getElementsByTagName("mixin-interfaces")[0];
    //const typedefs = xmlDocument.getElementsByTagName("typedefs")[0];
}

function insertCallbackFunction(callbackType: WebIDL2.CallbackType, xmlDocument: Document) {
    const callbackFunctions = xmlDocument.getElementsByTagName("callback-functions")[0];

    const callbackFunction = xmlDocument.createElement("callback-function");
    callbackFunction.setAttribute("name", callbackType.name);
    callbackFunction.setAttribute("callback", "1");
    callbackFunction.setAttribute("type", callbackType.idlType.origin.trim());

    for (const argumentType of callbackType.arguments) {
        const param = xmlDocument.createElement("param");
        param.setAttribute("name", argumentType.name);
        param.setAttribute("type", argumentType.idlType.origin.trim());
        callbackFunction.appendChild(param);
    }

    callbackFunctions.appendChild(callbackFunction);
}

function insertInterface(callbackType: WebIDL2.InterfaceType, xmlDocument: Document) {
    const callbackInterfaces = xmlDocument.getElementsByTagName("callback-interfaces")[0];

    const interfaceEl = xmlDocument.createElement("interface");
    interfaceEl.setAttribute("name", callbackType.name);

    const methods = xmlDocument.createElement("methods");
    const anonymousMethods = xmlDocument.createElement("methods");

    for (const memberType of callbackType.members) {
        if (memberType.type === "operation") {
            const method = xmlDocument.createElement("method");

            for (const argumentType of memberType.arguments) {
                const param = xmlDocument.createElement("param");
                param.setAttribute("name", argumentType.name);
                param.setAttribute("type", argumentType.idlType.origin.trim());
                method.appendChild(param);
            }

            if (memberType.name) {
                method.setAttribute("name", memberType.name);
                methods.appendChild(method);
            }
            else {
                methods.appendChild(anonymousMethods);
            }

            if (memberType.getter) {
                method.setAttribute("getter", "1");
            }
            if (memberType.setter) {
                method.setAttribute("setter", "1");
            }
            if (memberType.creator) {
                method.setAttribute("creator", "1");
            }
            if (memberType.deleter) {
                method.setAttribute("deleter", "1");
            }
            if (memberType.legacycaller) {
                method.setAttribute("legacy-caller", "1");
            }
            if (memberType.static) {
                method.setAttribute("static", "1");
            }
            if (memberType.stringifier) {
                method.setAttribute("stringifier", "1");
            }

            method.setAttribute("type", memberType.idlType.origin.trim());
        }
        else {
            console.log(`(TODO) skipped type ${memberType.type}`);
            // TODO: other member types
        }
    }

    if (methods.childNodes.length) {
        interfaceEl.appendChild(methods);
    }
    if (anonymousMethods.childNodes.length) {
        interfaceEl.appendChild(anonymousMethods);
    }
    callbackInterfaces.appendChild(interfaceEl);
}

function insertDictionary(dictionaryType: WebIDL2.DictionaryType, xmlDocument: Document) {
    const dictionaries = xmlDocument.getElementsByTagName("dictionaries")[0];

    const dictionary = xmlDocument.createElement("dictionary");
    dictionary.setAttribute("name", dictionaryType.name);
    if (dictionaryType.inheritance) {
        dictionary.setAttribute("extends", dictionaryType.inheritance);
    }

    const members = xmlDocument.createElement("members");

    for (const memberType of dictionaryType.members) {
        const member = xmlDocument.createElement("member");
        member.setAttribute("name", memberType.name);
        if (memberType.default) {
            member.setAttribute("default", memberType.default.value);
        }
        member.setAttribute("type", memberType.idlType.origin.trim());
        members.appendChild(member);
    }

    dictionary.appendChild(members);
    dictionaries.appendChild(dictionary);
}

function createWebIDLXMLDocument() {
    const xmlns = "http://schemas.microsoft.com/ie/webidl-xml"
    const xsi = "http://www.w3.org/2001/XMLSchema-instance";

    const doc = impl.createDocument(xmlns, "webidl-xml", null);
    doc.documentElement.setAttribute("name", "WHATWG Web Platform");
    doc.documentElement.setAttribute("original-file", "null");
    doc.documentElement.setAttribute("xmlns", xmlns); // xmldom bug #97
    doc.documentElement.setAttributeNS(xmlns, "xmlns:xsi", xsi);
    doc.documentElement.setAttributeNS(xsi, "xsi:schemaLocation", "http://schemas.microsoft.com/ie/webidl-xml webidl-xml-schema.xsd");

    doc.documentElement.appendChild(doc.createElement("callback-functions"));
    doc.documentElement.appendChild(doc.createElement("callback-interfaces"));
    doc.documentElement.appendChild(doc.createElement("dictionaries"));
    doc.documentElement.appendChild(doc.createElement("enums"));
    doc.documentElement.appendChild(doc.createElement("interfaces"));
    doc.documentElement.appendChild(doc.createElement("mixin-interfaces"));
    doc.documentElement.appendChild(doc.createElement("typedefs"));

    return doc;
}