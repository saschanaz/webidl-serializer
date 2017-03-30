"use strict";

import { XMLSerializer, DOMImplementation, DOMParser } from "xmldom";
import * as fspromise from "./fspromise";

run();

async function run() {
    const msedgeDocument = new DOMParser().parseFromString(await fspromise.readFile("supplements/browser.webidl.xml"), "text/xml");
    const standardDocument = new DOMParser().parseFromString(await fspromise.readFile("built/browser.webidl.xml"), "text/xml");
    const ignore = JSON.parse(await fspromise.readFile("specs-ignore.json"));

    compareArray(extractInterfaceNames(msedgeDocument), extractInterfaceNames(standardDocument), ignore);
}

function extractInterfaceNames(doc: Document) {
    const callbackInterfaces = doc.getElementsByTagName("callback-interfaces")[0];
    const interfaces = doc.getElementsByTagName("interfaces")[0];
    const mixinInterfaces = doc.getElementsByTagName("mixin-interfaces")[0];

    return [
        ...getChildrenArray(callbackInterfaces),
        ...getChildrenArray(interfaces),
        ...getChildrenArray(mixinInterfaces)
    ].filter(interfaceEl => interfaceEl.getAttribute("tags") !== "MSAppOnly").map(interfaceEl => interfaceEl.getAttribute("name"));
}

function compareArray(base: string[], comparand: string[], ignore: string[]) {
    for (const item of ignore) {
        if (base.indexOf(item) === -1) {
            console.log(`${item} is removed in base xml so no need to check anymore.`);
        }
    }
    // naive algorithm
    let count = 0;
    for (const item of base) {
        if (comparand.indexOf(item) === -1) {
            if (ignore.indexOf(item) !== -1) {
                // ignore
                continue;
            }
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