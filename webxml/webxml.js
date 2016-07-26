"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const WebIDL2 = require("webidl2");
const xmldom_1 = require("xmldom");
const jsdom = require("jsdom");
const node_fetch_1 = require("node-fetch");
const impl = new xmldom_1.DOMImplementation();
const serializer = new xmldom_1.XMLSerializer();
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
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = yield Promise.all(exportList.map((exportUrl) => __awaiter(this, void 0, void 0, function* () {
            const idls = yield exportIDLs(exportUrl);
            for (const idl of idls) {
                console.log(WebIDL2.parse(idl));
            }
        })));
    });
}
function exportIDLs(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield node_fetch_1.default(url);
        const text = yield response.text();
        const doc = jsdom.jsdom(text);
        return Array.from(doc.querySelectorAll("pre.idl")).map(element => element.textContent);
    });
}
function convert(webidl) {
    // callbacks to <callback-functions>
    // callback-interfaces to <callback-interfaces>
    // dictionaries to <dictionaries>
    // enums to <enums>
    // non-partial non-callback interfaces and exceptions to <interfaces>
    // partial interfaces to <mixin-interfaces>
    // typedefs to <typedefs>
}
function pack(results) {
    const xmlns = "http://schemas.microsoft.com/ie/webidl-xml";
    const xsi = "http://www.w3.org/2001/XMLSchema-instance";
    const doc = impl.createDocument(xmlns, "webidl-xml", null);
    doc.documentElement.setAttribute("name", "WHATWG Web Platform");
    doc.documentElement.setAttribute("original-file", "null");
    doc.documentElement.setAttribute("xmlns", xmlns); // xmldom bug #97
    doc.documentElement.setAttributeNS(xmlns, "xmlns:xsi", xsi);
    doc.documentElement.setAttributeNS(xsi, "xsi:schemaLocation", "http://schemas.microsoft.com/ie/webidl-xml webidl-xml-schema.xsd");
}
//# sourceMappingURL=webxml.js.map