import { ExportRemoteDescription, IDLExportResult, IDLSnippetContent, FetchResult } from "./types"
import * as xhelper from "./xmldom-helper";

/** 
 * merge partial interfaces to create a unique name-object relation for TSJS-lib-generator
 * as the tool uses it to track event types.
 * (no event for dictionaries so no need to merge them)
 */
export function mergePartialInterfaces(snippet: IDLSnippetContent) {
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
    
    snippet.interfaces = baseInterfaces.filter(interfaceEl => !interfaceEl.getAttribute("no-interface-object"));
    snippet.mixinInterfaces = baseInterfaces.filter(interfaceEl => interfaceEl.getAttribute("no-interface-object"));
}

/** Has side effect on its arguments */
function mergeInterface(baseInterface: Element, partialInterface: Element) {
    mergeInterfaceMemberSet(baseInterface, partialInterface, "anonymous-methods");
    mergeInterfaceMemberSet(baseInterface, partialInterface, "constants");
    mergeInterfaceMemberSet(baseInterface, partialInterface, "methods");
    mergeInterfaceMemberSet(baseInterface, partialInterface, "properties");
    mergeInterfaceMemberSet(baseInterface, partialInterface, "events");
    mergeInterfaceMemberSet(baseInterface, partialInterface, "sn:declarations");

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
function mergeInterfaceMemberSet(baseInterface: Element, partialInterface: Element, setName: string) {
    let baseSet = xhelper.getChild(baseInterface, setName);
    const partialSet = xhelper.getChild(partialInterface, setName);

    if (!partialSet) {
        // no merge occurs
        return;
    }

    if (!baseSet) {
        baseSet = baseInterface.ownerDocument.createElement(setName);
    }

    for (const member of xhelper.getChildrenArray(partialSet)) {
        partialSet.removeChild(member);
        baseSet.appendChild(member);
    }

    if (!xhelper.getChild(baseInterface, setName) /* no parentNode support on xmldom */) {
        baseInterface.appendChild(baseSet);
    }
}