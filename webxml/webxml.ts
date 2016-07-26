"use strict";

import * as WebIDL2 from "webidl2";
import { XMLSerializer, DOMImplementation } from "xmldom";
import * as jsdom from "jsdom";
import fetch from "node-fetch";
import prettifyXml = require("prettify-xml");

const impl = new DOMImplementation();

const exportList = [
    "https://html.spec.whatwg.org/",
    "https://dom.spec.whatwg.org/"
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

async function run() {
    const doc = createWebIDLXMLDocument();

    console.log("Fetching from web...");
    const results = await Promise.all(exportList.map(exportIDLs));
    console.log("Fetch complete 100%");

    for (const result of results) {
        for (const item of result.idls) {
            try {
                const parsed = WebIDL2.parse(item);

                for (const rootItem of parsed) {
                    insert(rootItem, doc);
                }
            }
            catch (err) {
                if (isWebIDLParseError(err)) {
                    const werr = err as WebIDL2.WebIDLParseError; // type narrowing does not work :(
                    console.warn(`A syntax error has found in a WebIDL code line ${werr.line} from ${result.url}:\n${werr.input}\n`);
                }
                else {
                    throw new Error(`An error occured while converting WebIDL from ${result.url}: ${err.message || err}`);;
                }
            }
        }
    }

    const serializer = new XMLSerializer();
    console.log(prettifyXml(serializer.serializeToString(doc)));
    //console.log(serializer.serializeToString(doc));
}

function isWebIDLParseError(err: any): err is WebIDL2.WebIDLParseError {
    return Array.isArray(err.tokens);
}

async function exportIDLs(url: string) {
    const response = await fetch(url);
    console.log(`Got response from ${url}, status ok: ${response.ok}`);
    const text = await response.text();
    console.log(`Fetching complete from ${url}`);

    const doc = jsdom.jsdom(text);
    const result = {
        url,
        idls: Array.from(doc.querySelectorAll("pre.idl")).map(element => element.textContent)
    };
    console.log(`Exported IDLs from ${url}`);
    return result;
}

function insert(webidl: WebIDL2.IDLRootTypes, xmlDocument: Document) {
    // callbacks to <callback-functions>
    // callback-interfaces to <callback-interfaces>
    // dictionaries to <dictionaries>
    // enums to <enums>
    // non-partial non-callback interfaces and exceptions to <interfaces>
    // partial interfaces to <mixin-interfaces>
    // typedefs to <typedefs>

    if (webidl.type === "dictionary") {
        insertDictionary(webidl as WebIDL2.DictionaryType, xmlDocument);
    }

    //const callbackFunctions = xmlDocument.getElementsByTagName("callback-functions")[0];
    //const callbackInterfaces = xmlDocument.getElementsByTagName("callback-interfaces")[0];
    //const dictionaries = xmlDocument.getElementsByTagName("dictionaries")[0];
    //const enums = xmlDocument.getElementsByTagName("enums")[0];
    //const interfaces = xmlDocument.getElementsByTagName("interfaces")[0];
    //const mixinInterfaces = xmlDocument.getElementsByTagName("mixin-interfaces")[0];
    //const typedefs = xmlDocument.getElementsByTagName("typedefs")[0];
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