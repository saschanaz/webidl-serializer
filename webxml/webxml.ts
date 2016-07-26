"use strict";

import * as WebIDL2 from "webidl2";
import { XMLSerializer, DOMImplementation } from "xmldom";
import * as jsdom from "jsdom";
import fetch from "node-fetch";

const impl = new DOMImplementation();
const serializer = new XMLSerializer();

const exportList = [
    "https://html.spec.whatwg.org/"
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
    const results = await Promise.all(exportList.map(async (exportUrl) => {
        const idls = await exportIDLs(exportUrl);
        for (const idl of idls) {
            console.log(WebIDL2.parse(idl));

        }
    }));

}

async function exportIDLs(url: string) {
    const response = await fetch(url);
    const text = await response.text();

    const doc = jsdom.jsdom(text);
    return Array.from(doc.querySelectorAll("pre.idl")).map(element => element.textContent);
}

interface ConversionResult {

}

function convert(webidl: WebIDL2.IDLRootTypes[]) {
    // callbacks to <callback-functions>
    // callback-interfaces to <callback-interfaces>
    // dictionaries to <dictionaries>
    // enums to <enums>
    // non-partial non-callback interfaces and exceptions to <interfaces>
    // partial interfaces to <mixin-interfaces>
    // typedefs to <typedefs>


    
}

function pack(results: ConversionResult[]) {


    const xmlns = "http://schemas.microsoft.com/ie/webidl-xml"
    const xsi = "http://www.w3.org/2001/XMLSchema-instance";

    const doc = impl.createDocument(xmlns, "webidl-xml", null);
    doc.documentElement.setAttribute("name", "WHATWG Web Platform");
    doc.documentElement.setAttribute("original-file", "null");
    doc.documentElement.setAttribute("xmlns", xmlns); // xmldom bug #97
    doc.documentElement.setAttributeNS(xmlns, "xmlns:xsi", xsi);
    doc.documentElement.setAttributeNS(xsi, "xsi:schemaLocation", "http://schemas.microsoft.com/ie/webidl-xml webidl-xml-schema.xsd");
}