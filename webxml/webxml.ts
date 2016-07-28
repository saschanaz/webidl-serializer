"use strict";

import * as WebIDL2 from "webidl2";
import { XMLSerializer, DOMImplementation } from "xmldom";
import * as jsdom from "jsdom";
import fetch from "node-fetch";
import prettifyXml = require("prettify-xml");
import * as fspromise from "./fspromise";

const impl = new DOMImplementation();
const unionLineBreakRegex = / or[\s]*/g;

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
        const result: FetchResult = {
            description,
            html: await response.text()
        }
        console.log(`Fetching finished from ${description.url}`);
        return result;
    }));
    console.log("Fetching complete 100%");

    const docs = convertAsMultipleDocument(results);

    if (!(await fspromise.exists("built"))) {
        await fspromise.makeDirectory("built");
    }

    const serializer = new XMLSerializer();
    for (const doc of docs) {
        const path = `built/${doc.documentElement.getAttribute("name")}.webidl.xml`;
        await fspromise.writeFile(path, prettifyXml(serializer.serializeToString(doc)));
        console.log(`Exporting as ${path}`);
    }
    console.log("Finished 100%");
}

function convertAsSingleDocument(results: FetchResult[]) {
    const doc = createWebIDLXMLDocument("WHATWG/W3C Web Platform", "null");
    for (const result of results) {
        insertFetchResult(result, doc);
    }
    return doc;
}

function convertAsMultipleDocument(results: FetchResult[]) {
    const docs: Document[] = [];
    for (const result of results) {
        console.log(`Conversion started for ${result.description.title}`);
        const doc = createWebIDLXMLDocument(result.description.title, result.description.url);
        insertFetchResult(result, doc);
        console.log(`Conversion finished for ${result.description.title}`);
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
                err.message = `An error occured while converting WebIDL from ${result.description.url}: ${err.message}`
                throw err;
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
        insertInterface(webidl, xmlDocument, "callback-interfaces");
    }
    else if (webidl.type === "dictionary") {
        insertDictionary(webidl, xmlDocument);
    }
    else if (webidl.type === "enum") {
        insertEnum(webidl, xmlDocument);
    }
    else if (webidl.type === "interface") {
        if (webidl.partial) {
            insertInterface(webidl, xmlDocument, "mixin-interfaces");
        }
        else {
            insertInterface(webidl, xmlDocument, "interfaces");
        }
    }
    else if (webidl.type === "typedef") {
        insertTypedef(webidl, xmlDocument);
    }
    else {
        console.log(`Skipped root IDL type ${webidl.type}`);
    }
}

function insertCallbackFunction(callbackType: WebIDL2.CallbackType, xmlDocument: Document) {
    const callbackFunctions = xmlDocument.getElementsByTagName("callback-functions")[0];

    const callbackFunction = xmlDocument.createElement("callback-function");
    callbackFunction.setAttribute("name", callbackType.name);
    callbackFunction.setAttribute("callback", "1");
    if (callbackType.idlType.nullable) {
        callbackFunction.setAttribute("nullable", "1");
        callbackFunction.setAttribute("type", callbackType.idlType.origin.trim().slice(0, -1));
    }
    else {
        callbackFunction.setAttribute("type", callbackType.idlType.origin.trim());
    }

    for (const param of getParamList(callbackType.arguments, xmlDocument)) {
        callbackFunction.appendChild(param);
    }

    callbackFunctions.appendChild(callbackFunction);
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

function insertInterface(interfaceType: WebIDL2.InterfaceType, xmlDocument: Document, parentName: string) {
    const callbackInterfaces = xmlDocument.getElementsByTagName(parentName)[0];

    const interfaceEl = xmlDocument.createElement("interface");
    interfaceEl.setAttribute("name", interfaceType.name);
    if (interfaceType.inheritance) {
        interfaceEl.setAttribute("extends", interfaceType.inheritance);
    }
    for (const extAttr of interfaceType.extAttrs) {
        if (extAttr.name === "NoInterfaceObject") {
            interfaceEl.setAttribute("no-interface-object", "1");
        }
        else if (extAttr.name === "HTMLConstructor") {
            // empty constuctor, only callable when subclassed
        }
        else if (extAttr.name === "NamedConstructor") {
            const namedConstructor = xmlDocument.createElement("named-constructor");
            namedConstructor.setAttribute("name", extAttr.rhs.value);
            for (const param of getParamList(extAttr.arguments, xmlDocument)) {
                namedConstructor.appendChild(param);
            }
            interfaceEl.appendChild(namedConstructor);
        }
        else if (extAttr.name === "Constructor") {
            const constructor = xmlDocument.createElement("constructor");
            if (extAttr.arguments) {
                for (const param of getParamList(extAttr.arguments, xmlDocument)) {
                    constructor.appendChild(param);
                }
            }
            interfaceEl.appendChild(constructor);
        }
        else if (extAttr.name === "Global") {
            interfaceEl.setAttribute("global", extAttr.rhs.value);
        }
        else if (extAttr.name === "PrimaryGlobal") {
            interfaceEl.setAttribute("primary-global", "Window");
        }
        else {
            console.log(`(TODO) Skipping extended attribute ${extAttr.name}`);
        }
    }

    const anonymousMethods = xmlDocument.createElement("anonymous-methods");
    const constants = xmlDocument.createElement("constants");
    const methods = xmlDocument.createElement("methods");
    const properties = xmlDocument.createElement("properties");

    for (const memberType of interfaceType.members) {
        if (memberType.type === "const") {
            const constant = xmlDocument.createElement("constant");

            constant.setAttribute("name", memberType.name);
            if (memberType.nullable) {
                constant.setAttribute("nullable", "1");
                constant.setAttribute("type", memberType.idlType.trim().slice(0, -1));
            }
            else {
                constant.setAttribute("type", memberType.idlType.trim());
            }
            constant.setAttribute("value", memberType.value.value);

            constants.appendChild(constant);
        }
        else if (memberType.type === "operation") {
            const method = xmlDocument.createElement("method");

            if (memberType.arguments) {
                for (const param of getParamList(memberType.arguments, xmlDocument)) {
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
                if ((memberType as WebIDL2.OperationMemberType /* TS2.0 bug */).idlType.nullable) {
                    method.setAttribute("nullable", "1");
                    method.setAttribute("type", (memberType as WebIDL2.OperationMemberType /* TS2.0 bug */).idlType.origin.trim().slice(0, -1));
                }
                else {
                    method.setAttribute("type", (memberType as WebIDL2.OperationMemberType /* TS2.0 bug */).idlType.origin.trim());
                }
            }
        }
        else if (memberType.type === "attribute") {
            const property = xmlDocument.createElement("property");
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
            if ((memberType as WebIDL2.AttributeMemberType /* TS2.0 bug */).idlType.nullable) {
                property.setAttribute("nullable", "1");
                property.setAttribute("type", (memberType as WebIDL2.AttributeMemberType /* TS2.0 bug */).idlType.origin.trim().slice(0, -1));
            }
            else {
                property.setAttribute("type", (memberType as WebIDL2.AttributeMemberType /* TS2.0 bug */).idlType.origin.trim());
            }
            properties.appendChild(property);
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
    callbackInterfaces.appendChild(interfaceEl);
}

function insertEnum(enumType: WebIDL2.EnumType, xmlDocument: Document) {
    const enums = xmlDocument.getElementsByTagName("enums")[0];

    const enumEl = xmlDocument.createElement("enum");
    enumEl.setAttribute("name", enumType.name);

    for (const valueStr of enumType.values) {
        const value = xmlDocument.createElement("value");
        value.textContent = valueStr;
        enumEl.appendChild(value);
    }

    enums.appendChild(enumEl);
}

function insertTypedef(typedefType: WebIDL2.TypedefType, xmlDocument: Document) {
    const typedefs = xmlDocument.getElementsByTagName("typedefs")[0];

    const typedef = xmlDocument.createElement("typedef");
    typedef.setAttribute("new-type", typedefType.idlType.origin.trim().replace(unionLineBreakRegex, " or "));
    typedef.setAttribute("type", typedefType.name);

    typedefs.appendChild(typedef);
}

function getParamList(argumentTypes: WebIDL2.Arguments[], xmlDocument: Document) {
    const paramList: Element[] = [];
    for (const argumentType of argumentTypes) {
        const param = xmlDocument.createElement("param");
        param.setAttribute("name", argumentType.name);
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

function createWebIDLXMLDocument(title: string, originUrl: string) {
    const xmlns = "http://schemas.microsoft.com/ie/webidl-xml"
    const xsi = "http://www.w3.org/2001/XMLSchema-instance";

    const doc = impl.createDocument(xmlns, "webidl-xml", null);
    doc.documentElement.setAttribute("name", title);
    doc.documentElement.setAttribute("original-file", originUrl);
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