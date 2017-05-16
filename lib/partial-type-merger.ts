import { ExportRemoteDescription, IDLExportResult, IDLSnippetContent, FetchResult } from "./types"
import * as xhelper from "./xmldom-helper.js"
import { xmlMemberSetSort } from "./xmlsort.js"

export function mergePartialTypes(snippet: IDLSnippetContent) {
    mergePartialInterfaces(snippet);
    mergePartialDictionaries(snippet);
}

/** 
 * merge partial interfaces to create a unique name-object relation for TSJS-lib-generator
 * as the tool uses it to track event types.
 */
function mergePartialInterfaces(snippet: IDLSnippetContent) {
    const interfaces = [...snippet.interfaces, ...snippet.mixinInterfaces];
    const baseInterfaces = interfaces.filter(interfaceEl => !interfaceEl.getAttribute("sn:partial"));
    const baseInterfaceMap = new Map(baseInterfaces.map<[string, Element]>(baseInterface => [baseInterface.getAttribute("name"), baseInterface]));

    for (const interfaceEl of interfaces) {
        if (!interfaceEl.getAttribute("sn:partial")) {
            // Not a partial interface element
            continue;
        }

        const name = interfaceEl.getAttribute("name");
        const baseInterface = baseInterfaceMap.get(name);

        if (!baseInterface) {
            baseInterfaces.push(interfaceEl);
            baseInterfaceMap.set(name, interfaceEl);
            continue;
        }

        mergeInterface(baseInterface, interfaceEl);
    }

    xmlInterfaceBatchSort(baseInterfaces);
    snippet.interfaces = baseInterfaces.filter(interfaceEl => !interfaceEl.getAttribute("no-interface-object"));
    snippet.mixinInterfaces = baseInterfaces.filter(interfaceEl => interfaceEl.getAttribute("no-interface-object"));
}

function xmlInterfaceBatchSort(interfaces: Element[]) {
    const targetMemberSets = ["constants", "methods", "properties", "declarations"];
    for (const interfaceEl of interfaces) {
        xmlMemberSetSort(interfaceEl, targetMemberSets);
    }
    return interfaces;
}

/** Has side effect on its arguments */
function mergeInterface(baseInterface: Element, partialInterface: Element) {
    mergeMemberSet(baseInterface, partialInterface, "anonymous-methods");
    mergeMemberSet(baseInterface, partialInterface, "constants");
    mergeMemberSet(baseInterface, partialInterface, "methods");
    mergeMemberSet(baseInterface, partialInterface, "properties");
    mergeMemberSet(baseInterface, partialInterface, "events");
    mergeMemberSet(baseInterface, partialInterface, "sn:declarations");
    mergeInterfaceDeclaration(baseInterface, partialInterface, "element");

    const children = xhelper.getChildrenArray(partialInterface);
    for (const constructor of Array.from(children.filter(child => child.nodeName.toLowerCase() === "constructor"))) {
        partialInterface.removeChild(constructor);
        baseInterface.appendChild(constructor);
    }
    for (const implementsEl of Array.from(children.filter(child => child.nodeName.toLowerCase() === "implements"))) {
        partialInterface.removeChild(implementsEl);
        baseInterface.appendChild(implementsEl);
    }
}

/** Has side effect on its arguments */
function mergeMemberSet(baseParent: Element, partialParent: Element, setName: string) {
    let baseSet = xhelper.getChild(baseParent, setName);
    const partialSet = xhelper.getChild(partialParent, setName);

    if (!partialSet) {
        // no merge occurs
        return;
    }

    if (!baseSet) {
        baseSet = baseParent.ownerDocument.createElement(setName);
    }

    mergeSet(baseSet, partialSet, partialParent.getAttribute("exposed"));

    if (!xhelper.getChild(baseParent, setName) /* no parentNode support on xmldom */) {
        baseParent.appendChild(baseSet);
    }
}

function mergeSet(baseSet: Element, partialSet: Element, exposed: string) {
    for (const member of xhelper.getChildrenArray(partialSet)) {
        partialSet.removeChild(member);
        if (exposed) {
            member.setAttribute("exposed", exposed);
        }
        baseSet.appendChild(member);
    }
}

function mergeInterfaceDeclaration(baseInterface: Element, partialInterface: Element, declarationName: string) {
    const declarations = xhelper.getChildren(partialInterface, declarationName);
    if (!declarations.length) {
        // no merge occurs
        return;
    }

    for (const declaration of declarations) {
        partialInterface.removeChild(declaration);
        baseInterface.appendChild(declaration);
    }
}


/** This is done to prevent unintential diff caused by sorting same-named multiple dictionaries */
function mergePartialDictionaries(snippet: IDLSnippetContent) {
    const baseDictionaries = snippet.dictionaries.filter(interfaceEl => !interfaceEl.getAttribute("sn:partial"));
    const baseDictionaryMap = new Map(baseDictionaries.map<[string, Element]>(baseDictionary => [baseDictionary.getAttribute("name"), baseDictionary]));

    for (const dictionary of snippet.dictionaries) {
        if (!dictionary.getAttribute("sn:partial")) {
            // Not a partial dictionary element
            continue;
        }

        const name = dictionary.getAttribute("name");
        const baseDictionary = baseDictionaryMap.get(name);

        if (!baseDictionary) {
            baseDictionaries.push(dictionary);
            baseDictionaryMap.set(name, dictionary);
            continue;
        }

        mergeMemberSet(baseDictionary, dictionary, "members");
    }

    for (const baseDictionary of baseDictionaries) {
        xmlMemberSetSort(baseDictionary, ["members"]);
    }
    snippet.dictionaries = baseDictionaries;
}