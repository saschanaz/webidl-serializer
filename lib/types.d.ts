export interface ImportRemoteDescription {
    url: string;
    title: string;
    hasIdlIndex?: boolean;
    idl?: "local" | "none" | "raw"; // TODO: merge hasIdlIndex as "indexed"
}

export interface FetchResult {
    description: ImportRemoteDescription;
    content: string;
}

export interface IDLImportResult {
    snippets: IDLSnippetContent[];
    origin: FetchResult;
    idl: string;
}

export interface IDLSnippetContent {
    callbackFunctions: Element[];
    callbackInterfaces: Element[];
    dictionaries: Element[];
    enums: Element[];
    interfaces: Element[];
    mixinInterfaces: Element[];
    typedefs: Element[];
    namespaces: Element[];
}

export interface MSEdgeIgnore {
    interfaces: string[],
    events: string[],
    cssProperties: string[]
}