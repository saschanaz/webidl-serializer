"use strict";

import { XMLSerializer, DOMImplementation, DOMParser } from "xmldom";
import * as fspromise from "./fspromise";

run();

async function run() {
    const msedgeDocument = new DOMParser().parseFromString(await fspromise.readFile("supplements/browser.webidl.xml"), "text/xml");
    const standardDocument = new DOMParser().parseFromString(await fspromise.readFile("built/all.webidl.xml"), "text/xml");

    compareArray(extractInterfaceNames(msedgeDocument), extractInterfaceNames(standardDocument));
}

function extractInterfaceNames(doc: Document) {
    const interfaces = doc.getElementsByTagName("interfaces")[0];
    const mixinInterfaces = doc.getElementsByTagName("mixin-interfaces")[0];

    return [...getChildrenArray(interfaces), ...getChildrenArray(mixinInterfaces)].map(interfaceEl => interfaceEl.getAttribute("name"));
}

function compareArray(base: string[], comparand: string[]) {
    // naive algorithm
    let count = 0;
    for (const item of base) {
        if (comparand.indexOf(item) === -1) {
            count++;
            console.warn(`${item} is not found in comparand.`)
        }
    }
    if (count !== 0) {
        console.warn(`Total: ${count} unmatched.`)
    }
}

function getChildrenArray(element: Element) {
    // xmldom does not support element.children
    return Array.from(element.childNodes).filter(node => node.nodeType === 1) as Element[];
}