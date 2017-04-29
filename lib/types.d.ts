export interface ExportRemoteDescription {
    url: string;
    title: string;
    hasIdlIndex?: boolean;
    useLocalCopy?: boolean;
}

export interface FetchResult {
    description: ExportRemoteDescription;
    content: string;
}

export interface IDLExportResult {
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