import { ImportRemoteDescription, IDLImportResult, IDLSnippetContent, FetchResult, IDLDefinitions } from "./types"
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
    const interfaces = [...snippet.interfaces, ...snippet.mixinInterfaces];
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
    snippet.interfaces = baseInterfaces.filter(interfaceEl => !interfaceEl.partial);
    snippet.mixinInterfaces = baseInterfaces.filter(interfaceEl => interfaceEl.partial);
}

function interfaceBatchSort(interfaces: IDLDefinitions.Interface[]) {
    for (const interfaceDef of interfaces) {
        interfaceDef.constants.sort(nameSorter);
        interfaceDef.operations.sort(nameSorter);
        interfaceDef.attributes.sort(nameSorter);
    }
    return interfaces;
}

/** Has side effect on its arguments */
function mergeInterface(baseInterface: IDLDefinitions.Interface, partialInterface: IDLDefinitions.Interface) {
    baseInterface.anonymousOperations.push(...partialInterface.anonymousOperations);
    baseInterface.constants.push(...partialInterface.constants);
    baseInterface.operations.push(...partialInterface.operations);
    baseInterface.attributes.push(...partialInterface.attributes);
    baseInterface.events.push(...partialInterface.events);
    // Note: no partial interface is found to have iterable<> or named constructor

    baseInterface.constructors.push(...partialInterface.constructors);
    baseInterface.implements.push(...partialInterface.implements);
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