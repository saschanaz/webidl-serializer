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

export namespace Definitions {
    export interface CallbackFunction {
        name: string;
        callback: true,
        nullable: boolean;
        type: string;
    }

    export interface Dictionary {
        name: string;
        extends: string;
        partial: boolean;
        members: DictionaryMember[];
    }

    export interface DictionaryMember {
        name: string;
        default: string;
        nullable: boolean;
        type: string;
        required: boolean;
    }

    export interface Enum {
        name: string;
        values: string[];
    }

    export interface Interface {
        name: string;
        extends: string;
        partial?: boolean;

        noInterfaceObject?: boolean;
        namedConstructor?: { name: string; params: Param[]; };
        constructor?: { params: Param[]; }[];
        global?: string;
        primaryGlobal?: string;
        overrideBuiltins?: boolean;
        exposed?: string[];

        constants?: { name: string; nullable: boolean; value: string; }[];
        operations?: Operation[];
        attributes?: Attribute[];

        iterable?: { keytype?: string; type: string; }
    }

    export interface namespace {
        name: string;
        partial?: boolean;

        exposed?: string[];

        operations?: Operation[];
        attributes?: Attribute[];
    }

    export interface Operation {
        name: string;
        params: Param[]
        nullable: boolean;
        type: string;

        getter?: true;
        setter?: true;
        creater?: true;
        deleter?: true;
        static?: true;
        stringifier?: true;

        exposed?: string[];
    }

    export interface Attribute {
        name: string;
        readOnly?: boolean;
        static?: boolean;
        stringifier?: boolean;
        nullable?: boolean;
        type: string;
        exposed?: string[];
    }

    export interface Param {
        name: string;
        default: boolean;
        optional: boolean;
        nullable: boolean;
        type: string;
        variadic: boolean;
    }

    export interface Typedef {
        name: string;
        nullable: boolean;
        type: string;
    }
}