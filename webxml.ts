"use strict";

import * as WebIDL2 from "webidl2";
import { XMLSerializer, DOMImplementation, DOMParser } from "xmldom";
import * as jsdom from "jsdom";
import fetch from "node-fetch";
import prettifyXml = require("prettify-xml");
import * as fspromise from "./fspromise";

const impl = new DOMImplementation();
const unionLineBreakRegex = / or[\s]*/g;
const document = impl.createDocument("http://example.com/", "global", null);

interface ExportRemoteDescription {
    url: string;
    title: string;
    hasIdlIndex: boolean;
}

run().catch(err => console.error(err));

interface FetchResult {
    description: ExportRemoteDescription;
    html: string;
}
interface IDLExportResult {
    snippets: IDLSnippetContent[];
    origin: FetchResult;
}

function getChildrenArray(element: Element) {
    // xmldom does not support element.children
    return Array.from(element.childNodes).filter(node => node.nodeType === 1) as Element[];
}

function getChild(element: Element, childTagName: string) {
    // xmldom does not support getChildrenByTagName
    return getChildrenArray(element).filter(element => element.tagName.toLowerCase() === childTagName.toLowerCase())[0];
}

function getChildWithProperty(element: Element, childTagName: string, property: string, value: string) {
    // xmldom does not support querySelector
    return getChildrenArray(element).filter(element => element.tagName.toLowerCase() === childTagName.toLowerCase() && element.getAttribute(property) === value)[0];
}

function cloneNode(node: Node) {
    // xmldom does not support cloneNode
    const newNode = document.createElement(node.nodeName);
    for (const attribute of Array.from(node.attributes)) {
        newNode.setAttribute(attribute.name, attribute.value);
    }
    return newNode;
}

async function run() {
    /*
    TODO: load event information from browser.webidl.xml and create interfaces for each event target
    */

    console.log("Loading spec list...");
    const exportList: ExportRemoteDescription[] = JSON.parse(await fspromise.readFile("specs.json"));

    console.log("Fetching from web...");
    const results = await Promise.all(exportList.map(async (description): Promise<FetchResult> => {
        const response = await fetch(description.url);
        if (!response.ok) {
            throw new Error(`Fetching failed: HTTP ${response.status} ${response.statusText}`);
        }
        const result: FetchResult = {
            description,
            html: await response.text()
        }
        console.log(`Fetching finished from ${description.url}`);
        return result;
    }));
    console.log("Fetching complete 100%");
    
    if (!(await fspromise.exists("built"))) {
        await fspromise.makeDirectory("built");
    }

    console.log("Exporting and parsing WebIDL...");

    // Exporting IDL texts
    const exports = await Promise.all(results.map(result => exportIDLs(result)));

    console.log("Loading event information from MSEdge data...");
    const msedgeEvents = filterEventInformation(new DOMParser().parseFromString(await fspromise.readFile("supplements/browser.webidl.xml"), "text/xml"));
    transferEventInformation(exports, msedgeEvents);

    const serializer = new XMLSerializer();
    for (const doc of convertAsMultipleDocument(exports)) {
        const path = `built/${doc.documentElement.getAttribute("name")}.webidl.xml`;
        await fspromise.writeFile(path, prettifyXml(serializer.serializeToString(doc)));
        console.log(`Writing as ${path}`);
    }
    console.log("Conversion as merged one as all.webidl.xml");
    await fspromise.writeFile("built/all.webidl.xml", prettifyXml(serializer.serializeToString(convertAsSingleDocument(exports))));
    console.log("Finished 100%");
}

function filterEventInformation(edgeIdl: Document) {
    const eventMap = new Map<string, Element | string>();

    const interfaceSets = [edgeIdl.getElementsByTagName("interfaces")[0], edgeIdl.getElementsByTagName("mixin-interfaces")[0]];
    for (const interfaceSet of interfaceSets) {
        for (const interfaceEl of Array.from(interfaceSet.getElementsByTagName("interface"))) {
            const events = interfaceEl.getElementsByTagName("events")[0];

            const properties = interfaceEl.getElementsByTagName("properties")[0];

            if (properties) {
                for (const property of getChildrenArray(properties)) {
                    const handler = property.getAttribute("event-handler");
                    if (!handler) {
                        continue;
                    }

                    eventMap.set(`${interfaceEl.getAttribute("name")}:${property.getAttribute("name")}`, (events && getChildWithProperty(events, "event", "name", handler)) || handler);
                }
            }
        }
    }

    return eventMap;
}

function transferEventInformation(exports: IDLExportResult[], eventMap: Map<string, string | Element>) {
    for (const exportResult of exports) {
        for (const snippet of exportResult.snippets) {
            for (const interfaceEl of snippet.interfaces) {
                const properties = getChild(interfaceEl, "properties");
                if (!properties) {
                    continue;
                }

                let events: Element;

                for (const property of getChildrenArray(properties)) {
                    if (property.getAttribute("type") === "EventHandler") {
                        const key = `${interfaceEl.getAttribute("name")}:${property.getAttribute("name")}`;
                        const event = eventMap.get(key);
                        if (!event) {
                            console.warn(`WARNING: no event data for ${key}`);
                            continue;
                        }
                        
                        if (typeof event !== "string") {
                            property.setAttribute("event-handler", event.getAttribute("name"));
                            if (!events) {
                                events = document.createElement("events");
                            }
                            events.appendChild(cloneNode(event));
                        }
                        else {
                            property.setAttribute("event-handler", event);
                        }
                    }
                }

                if (events) {
                    interfaceEl.appendChild(events);
                }
            }
        }
    }
}

function convertAsSingleDocument(exports: IDLExportResult[]) {
    const snippets: IDLSnippetContent[] = [];
    for (const item of exports) {
        snippets.push(...item.snippets);
    }
    return createWebIDLXMLDocument("WHATWG/W3C Web Platform", "null", mergeIDLSnippets(snippets));
}

function convertAsMultipleDocument(exports: IDLExportResult[]) {
    const docs: Document[] = [];
    for (const item of exports) {
        console.log(`Conversion started for ${item.origin.description.title}`);
        const doc = createWebIDLXMLDocument(item.origin.description.title, item.origin.description.url, mergeIDLSnippets(item.snippets));
        console.log(`Conversion finished for ${item.origin.description.title}`);
        docs.push(doc);
    }
    return docs;
}

function isWebIDLParseError(err: any): err is WebIDL2.WebIDLParseError {
    return Array.isArray(err.tokens);
}

async function exportIDLs(result: FetchResult): Promise<IDLExportResult> {
    const win = await jsdomEnv(result.html);
    const idlElements = Array.from(win.document.querySelectorAll("pre.idl"));
    if (!idlElements.length) {
        throw new Error(`No IDLs in ${result.description.url}`)
    }
    const idlTexts = 
        result.description.hasIdlIndex ? [idlElements[idlElements.length - 1].textContent] :
            idlElements.map(element => element.textContent);
    
    win.close();
    return {
        snippets: exportIDLSnippets(idlTexts, result), origin: result
    };
}

function exportIDLSnippets(idlTexts: string[], origin: FetchResult) {
    const snippets: IDLSnippetContent[] = [];

    for (const item of idlTexts) {
        try {
            const snippet = createIDLSnippetContentContainer();
            const parsed = WebIDL2.parse(item);
            const implementsMap = new Map<string, Element[]>();

            for (const rootItem of parsed) {
                /*
                implements: if the IDL snippet has target interface or partial interface, then insert <implements> into it
                if not, create a new partial interface that contains <implements>
                */
                if (rootItem.type === "implements") {
                    const implementEl = document.createElement("implements");
                    implementEl.textContent = rootItem.implements;
                    if (!implementsMap.has(rootItem.target)) {
                        implementsMap.set(rootItem.target, [implementEl]);
                    }
                    else {
                        implementsMap.get(rootItem.target).push(implementEl);
                    }
                }
                else {
                    insert(rootItem, snippet);
                }
            }

            for (const entry of implementsMap.entries()) {
                let interfaceEl = snippet.interfaces.filter(item => item.getAttribute("name") === entry[0])[0];
                if (!interfaceEl) {
                    interfaceEl = snippet.interfaces.filter(item => item.getAttribute("name") === entry[0])[0];
                }
                if (!interfaceEl) {
                    interfaceEl = document.createElement("interface");
                    interfaceEl.setAttribute("extends", "Object");
                    interfaceEl.setAttribute("name", entry[0]);
                    snippet.interfaces.push(interfaceEl);
                }

                for (const implementsEl of entry[1]) {
                    interfaceEl.appendChild(implementsEl);
                }
            }

            snippets.push(snippet);
        }
        catch (err) {
            if (isWebIDLParseError(err)) {
                console.warn(`A syntax error has found in a WebIDL code line ${err.line} from ${origin.description.url}:\n${err.input}\n`);
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
    const merger = createIDLSnippetContentContainer();

    for (const snippet of snippets) {
        merger.callbackFunctions.push(...snippet.callbackFunctions);
        merger.callbackInterfaces.push(...snippet.callbackInterfaces);
        merger.dictionaries.push(...snippet.dictionaries);
        merger.enums.push(...snippet.enums);
        merger.interfaces.push(...snippet.interfaces);
        merger.mixinInterfaces.push(...snippet.mixinInterfaces);
        merger.typedefs.push(...snippet.typedefs);
    }

    return merger;
}

function insert(webidl: WebIDL2.IDLRootType, snippetContent: IDLSnippetContent) {
    // callbacks to <callback-functions>
    // callback-interfaces to <callback-interfaces>
    // dictionaries to <dictionaries>
    // enums to <enums>
    // non-partial non-callback interfaces and exceptions to <interfaces>
    // partial interfaces to <mixin-interfaces>
    // typedefs to <typedefs>

    if (webidl.type === "callback") {
        snippetContent.callbackFunctions.push(createCallbackFunction(webidl));
    }
    else if (webidl.type === "callback interface") {
        snippetContent.callbackInterfaces.push(createInterface(webidl));
    }
    else if (webidl.type === "dictionary") {
        snippetContent.dictionaries.push(createDictionary(webidl));
    }
    else if (webidl.type === "enum") {
        snippetContent.enums.push(createEnum(webidl));
    }
    else if (webidl.type === "interface") {
        if (webidl.partial || webidl.extAttrs.filter(extAttr => extAttr.name === "NoInterfaceObject").length) {
            snippetContent.mixinInterfaces.push(createInterface(webidl));
        }
        else {
            snippetContent.interfaces.push(createInterface(webidl));
        }
    }
    else if (webidl.type === "typedef") {
        snippetContent.typedefs.push(createTypedef(webidl));
    }
    else {
        console.log(`Skipped root IDL type ${webidl.type}`);
    }
}

function createCallbackFunction(callbackType: WebIDL2.CallbackType) {
    const callbackFunction = document.createElement("callback-function");
    callbackFunction.setAttribute("name", callbackType.name);
    callbackFunction.setAttribute("callback", "1");
    if (callbackType.idlType.nullable) {
        callbackFunction.setAttribute("nullable", "1");
        callbackFunction.setAttribute("type", callbackType.idlType.origin.trim().slice(0, -1));
    }
    else {
        callbackFunction.setAttribute("type", callbackType.idlType.origin.trim());
    }

    for (const param of getParamList(callbackType.arguments)) {
        callbackFunction.appendChild(param);
    }

    return callbackFunction;
}

function createDictionary(dictionaryType: WebIDL2.DictionaryType) {
    const dictionary = document.createElement("dictionary");
    dictionary.setAttribute("name", dictionaryType.name);
    dictionary.setAttribute("extends", dictionaryType.inheritance || "Object");

    const members = document.createElement("members");

    for (const memberType of dictionaryType.members) {
        const member = document.createElement("member");
        member.setAttribute("name", memberType.name);
        if (memberType.default) {
            member.setAttribute("default", getValueString(memberType.default));
        }
        if (memberType.idlType.nullable) {
            member.setAttribute("nullable", "1");
            member.setAttribute("type", memberType.idlType.origin.trim().slice(0, -1));
        }
        else {
            member.setAttribute("type", memberType.idlType.origin.trim());
        }
        members.appendChild(member);
    }

    dictionary.appendChild(members);

    return dictionary;
}

function createInterface(interfaceType: WebIDL2.InterfaceType) {
    const interfaceEl = document.createElement("interface");
    interfaceEl.setAttribute("name", interfaceType.name);
    interfaceEl.setAttribute("extends", interfaceType.inheritance || "Object");

    let constructorList = interfaceEl;
    if (interfaceType.extAttrs.filter(extAttr => extAttr.name === "Constructor").length > 1) {
        constructorList = document.createElement("constructors");
        interfaceEl.appendChild(constructorList);
    }

    if (interfaceType.partial) {
        interfaceEl.setAttribute("no-interface-object", "1");
    }

    for (const extAttr of interfaceType.extAttrs) {
        if (extAttr.name === "NoInterfaceObject") {
            interfaceEl.setAttribute("no-interface-object", "1");
        }
        else if (extAttr.name === "HTMLConstructor") {
            // empty constuctor, only callable when subclassed
        }
        else if (extAttr.name === "NamedConstructor") {
            const namedConstructor = document.createElement("named-constructor");
            namedConstructor.setAttribute("name", extAttr.rhs.value as string);
            for (const param of getParamList(extAttr.arguments)) {
                namedConstructor.appendChild(param);
            }
            interfaceEl.appendChild(namedConstructor);
        }
        else if (extAttr.name === "Constructor") {
            const constructor = document.createElement("constructor");
            if (extAttr.arguments) {
                for (const param of getParamList(extAttr.arguments)) {
                    constructor.appendChild(param);
                }
            }
            constructorList.appendChild(constructor);
        }
        else if (extAttr.name === "Global") {
            interfaceEl.setAttribute("global", Array.isArray(extAttr.rhs.value) ? extAttr.rhs.value.join(' ') : extAttr.rhs.value);
        }
        else if (extAttr.name === "PrimaryGlobal") {
            interfaceEl.setAttribute("primary-global", "Window");
        }
        else if (extAttr.name === "OverrideBuiltins") {
            interfaceEl.setAttribute("override-builtins", "1");
        }
        else if (extAttr.name === "LegacyUnenumerableNamedProperties") {
            // do nothing, just continue
        }
        else if (extAttr.name === "Exposed") {
            interfaceEl.setAttribute("exposed", Array.isArray(extAttr.rhs.value) ? extAttr.rhs.value.join(' ') : extAttr.rhs.value);
        }
        else {
            console.log(`(TODO) Skipping extended attribute ${extAttr.name}`);
        }
    }

    const anonymousMethods = document.createElement("anonymous-methods");
    const constants = document.createElement("constants");
    const methods = document.createElement("methods");
    const properties = document.createElement("properties");
    const declarations = document.createElement("sn:declarations");

    // TODO: separate member processor function
    // TODO: process extAttr for members
    for (const memberType of interfaceType.members) {
        if (memberType.type === "const") {
            const constant = document.createElement("constant");

            constant.setAttribute("name", memberType.name);
            if (memberType.nullable) {
                constant.setAttribute("nullable", "1");
                constant.setAttribute("type", memberType.idlType.trim().slice(0, -1));
            }
            else {
                constant.setAttribute("type", memberType.idlType.trim());
            }
            constant.setAttribute("value", getValueString(memberType.value));

            constants.appendChild(constant);
        }
        else if (memberType.type === "operation") {
            const method = document.createElement("method");

            if (memberType.arguments) {
                for (const param of getParamList(memberType.arguments)) {
                    method.appendChild(param);
                }
            }

            if (memberType.name) {
                method.setAttribute("name", memberType.name);
                methods.appendChild(method);
            }
            else {
                anonymousMethods.appendChild(method);
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

            if (!memberType.idlType && memberType.stringifier) {
                method.setAttribute("type", "DOMString");
            }
            else {
                if (memberType.idlType.nullable) {
                    method.setAttribute("nullable", "1");
                    method.setAttribute("type", memberType.idlType.origin.trim().slice(0, -1));
                }
                else {
                    method.setAttribute("type", memberType.idlType.origin.trim());
                }
            }
        }
        else if (memberType.type === "attribute") {
            const property = document.createElement("property");
            property.setAttribute("name", memberType.name);
            if (memberType.readonly) {
                property.setAttribute("read-only", "1");
            }
            if (memberType.static) {
                property.setAttribute("static", "1");
            }
            if (memberType.inherit) {
                console.log("(TODO) Met an inherited attribute. What should be done for it?");
            }
            if (memberType.stringifier) {
                property.setAttribute("stringifier", "1");
            }
            if (memberType.idlType.nullable) {
                property.setAttribute("nullable", "1");
                property.setAttribute("type", memberType.idlType.origin.trim().slice(0, -1));
            }
            else {
                property.setAttribute("type", memberType.idlType.origin.trim());
            }
            properties.appendChild(property);
        }
        else if (memberType.type === "iterable") {
            declarations.appendChild(createIterableDeclarationMember(memberType));
        }
        else {
            console.log(`Skipped type ${memberType.type}`);
            // TODO: other member types
        }
    }

    if (anonymousMethods.childNodes.length) {
        interfaceEl.appendChild(anonymousMethods);
    }
    if (constants.childNodes.length) {
        interfaceEl.appendChild(constants);
    }
    if (methods.childNodes.length) {
        interfaceEl.appendChild(methods);
    }
    if (properties.childNodes.length) {
        interfaceEl.appendChild(properties);
    }
    if (declarations.childNodes.length) {
        interfaceEl.appendChild(declarations);
    }
    return interfaceEl;
}

function createIterableDeclarationMember(declarationMemberType: WebIDL2.SingularDeclarationMemberType) {
    const iterable = document.createElement("sn:iterable");
    iterable.setAttribute("type", declarationMemberType.idlType.origin.trim());
    // TODO: extAttr
    return iterable;
}

function createEnum(enumType: WebIDL2.EnumType) {
    const enumEl = document.createElement("enum");
    enumEl.setAttribute("name", enumType.name);

    for (const valueStr of enumType.values) {
        const value = document.createElement("value");
        value.textContent = valueStr;
        enumEl.appendChild(value);
    }

    return enumEl;
}

function createTypedef(typedefType: WebIDL2.TypedefType) {
    const typedef = document.createElement("typedef");
    typedef.setAttribute("new-type", typedefType.name);
    if (typedefType.idlType.nullable) {
        typedef.setAttribute("nullable", "1");
        typedef.setAttribute("type", typedefType.idlType.origin.trim().replace(unionLineBreakRegex, " or ").slice(0, -1));
    }
    else {
        typedef.setAttribute("type", typedefType.idlType.origin.trim().replace(unionLineBreakRegex, " or "));
    }

    return typedef;
}

function getParamList(argumentTypes: WebIDL2.Arguments[]) {
    const paramList: Element[] = [];
    for (const argumentType of argumentTypes) {
        const param = document.createElement("param");
        param.setAttribute("name", argumentType.name);
        if (argumentType.default) {
            param.setAttribute("default", getValueString(argumentType.default));
        }
        if (argumentType.optional) {
            param.setAttribute("optional", "1");
        }
        if (argumentType.idlType.nullable) {
            param.setAttribute("nullable", "1");
            param.setAttribute("type", argumentType.idlType.origin.trim().slice(0, -1));
        }
        else {
            param.setAttribute("type", argumentType.idlType.origin.trim());
        }
        if (argumentType.variadic) {
            param.setAttribute("variadic", "1");
        }
        paramList.push(param);
    }
    return paramList;
}

function getValueString(typePair: WebIDL2.ValueDescription) {
    if (typePair.type === "string") {
        return `"${typePair.value}"`;
    }
    else if (typePair.type === "null") {
        return "null";
    }
    else if (typePair.type === "number" || typePair.type === "boolean") {
        return '' + typePair.value;
    }
    else if (typePair.type === "sequence") {
        return "[]"; // always empty array
    }
    else {
        throw new Error(`Unknown value string typed ${typePair.type}`);
    }
};

function createWebIDLXMLDocument(title: string, originUrl: string, snippetContent: IDLSnippetContent) {
    const xmlns = "http://schemas.microsoft.com/ie/webidl-xml"
    const xsi = "http://www.w3.org/2001/XMLSchema-instance";

    const doc = impl.createDocument(xmlns, "webidl-xml", null);
    doc.documentElement.setAttribute("name", title);
    doc.documentElement.setAttribute("original-file", originUrl);
    doc.documentElement.setAttribute("xmlns", xmlns); // xmldom bug #97
    doc.documentElement.setAttributeNS(xmlns, "xmlns:xsi", xsi);
    doc.documentElement.setAttributeNS(xsi, "xsi:schemaLocation", "http://schemas.microsoft.com/ie/webidl-xml webidl-xml-schema.xsd");
    doc.documentElement.setAttributeNS(xmlns, "xmlns:sn", "http://saschanaz.github.io/ts/webidl-xml-ext/");

    appendChildrenAs(doc, "callback-functions", snippetContent.callbackFunctions);
    appendChildrenAs(doc, "callback-interfaces", snippetContent.callbackInterfaces);
    appendChildrenAs(doc, "dictionaries", snippetContent.dictionaries);
    appendChildrenAs(doc, "enums", snippetContent.enums);
    appendChildrenAs(doc, "interfaces", snippetContent.interfaces);
    appendChildrenAs(doc, "mixin-interfaces", snippetContent.mixinInterfaces);
    appendChildrenAs(doc, "typedefs", snippetContent.typedefs);

    return doc;
}

function appendChildrenAs(doc: Document, newParentName: string, children: Element[]) {
    const newParent = doc.createElement(newParentName);
    for (const child of children) {
        newParent.appendChild(child);
    }
    doc.documentElement.appendChild(newParent);
}

interface IDLSnippetContent {
    callbackFunctions: Element[];
    callbackInterfaces: Element[];
    dictionaries: Element[];
    enums: Element[];
    interfaces: Element[];
    mixinInterfaces: Element[];
    typedefs: Element[];
}
function createIDLSnippetContentContainer(): IDLSnippetContent {
    return {
        callbackFunctions: [],
        callbackInterfaces: [],
        dictionaries: [],
        enums: [],
        interfaces: [],
        mixinInterfaces: [],
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