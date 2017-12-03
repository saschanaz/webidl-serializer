import { IDLProviderDescription, IDLExtractResult, IDLSnippetContent, FetchResult, IDLDefinitions } from "./types"
import nameSorter from "./namesort.js";

export function mergePartialTypes(snippet: IDLSnippetContent) {
    mergePartialInterfaces(snippet);
    mergePartialDictionaries(snippet);
    // TODO: partial namespaces (not used in specs yet)
}

/** 
 * merge partial interfaces to create a unique name-object relation for TSJS-lib-generator
 * as the tool uses it to track event types.
 */
function mergePartialInterfaces(snippet: IDLSnippetContent) {
    const interfaces = snippet.interfaces;
    const baseInterfaces = interfaces.filter(interfaceEl => !interfaceEl.partial);
    const baseInterfaceMap = new Map(baseInterfaces.map<[string, IDLDefinitions.Interface]>(baseInterface => [baseInterface.name, baseInterface]));

    for (const interfaceDef of interfaces) {
        if (!interfaceDef.partial) {
            // Not a partial interface element
            continue;
        }

        const name = interfaceDef.name;
        const baseInterface = baseInterfaceMap.get(name);

        if (!baseInterface) {
            baseInterfaces.push(interfaceDef);
            baseInterfaceMap.set(name, interfaceDef);
            continue;
        }

        mergeInterface(baseInterface, interfaceDef);
    }

    interfaceBatchSort(baseInterfaces);
    snippet.interfaces = baseInterfaces;
}

function interfaceBatchSort(interfaces: IDLDefinitions.Interface[]) {
    for (const interfaceDef of interfaces) {
        if (interfaceDef.constants) {
            interfaceDef.constants.sort(nameSorter);
        }
        if (interfaceDef.operations) {
            interfaceDef.operations.sort(nameSorter);
        }
        if (interfaceDef.attributes) {
            interfaceDef.attributes.sort(nameSorter);
        }
    }
    return interfaces;
}

/** Has side effect on its arguments */
function mergeInterface(baseInterface: IDLDefinitions.Interface, partialInterface: IDLDefinitions.Interface) {
    mergeMemberSet(baseInterface, partialInterface, "anonymousOperations");
    mergeMemberSet(baseInterface, partialInterface, "constants");
    mergeMemberSet(baseInterface, partialInterface, "operations");
    mergeMemberSet(baseInterface, partialInterface, "attributes");
    // Note: no partial interface is found to have iterable<> or named constructor

    mergeMemberSet(baseInterface, partialInterface, "constructors");
    mergeMemberSet(baseInterface, partialInterface, "implements");

    mergeMemberSet(baseInterface, partialInterface, "events");
    mergeMemberSet(baseInterface, partialInterface, "elements");
}

/** Has side effect on its arguments */
function mergeMemberSet(baseParent: any, partialParent: any, setName: string) {
    let baseSet = baseParent[setName];
    const partialSet = partialParent[setName];

    if (!partialSet) {
        // no merge occurs
        return;
    }

    if (!baseSet) {
        baseSet = [];
    }

    if (!Array.isArray(baseSet) || !Array.isArray(partialSet)) {
        throw new Error(`Unexpected non-array member set with its name "${setName}"`)
    }

    mergeSet(baseSet, partialSet, partialParent.exposed);

    if (!baseParent[setName]) {
        baseParent[setName] = baseSet;
    }
}

function mergeSet(baseSet: any[], partialSet: any[], exposed: string) {
    for (const member of partialSet) {
        if (exposed) {
            member.exposed = exposed;
        }
        baseSet.push(member);
    }
}

/** This is done to prevent unintential diff caused by sorting same-named multiple dictionaries */
function mergePartialDictionaries(snippet: IDLSnippetContent) {
    const baseDictionaries = snippet.dictionaries.filter(interfaceEl => !interfaceEl.partial);
    const baseDictionaryMap = new Map(baseDictionaries.map<[string, IDLDefinitions.Dictionary]>(baseDictionary => [baseDictionary.name, baseDictionary]));

    for (const dictionary of snippet.dictionaries) {
        if (!dictionary.partial) {
            // Not a partial dictionary element
            continue;
        }

        const name = dictionary.name;
        const baseDictionary = baseDictionaryMap.get(name);

        if (!baseDictionary) {
            baseDictionaries.push(dictionary);
            baseDictionaryMap.set(name, dictionary);
            continue;
        }

        baseDictionary.members.push(...dictionary.members);
    }

    for (const baseDictionary of baseDictionaries) {
        baseDictionary.members.sort(nameSorter);
    }
    snippet.dictionaries = baseDictionaries;
}
