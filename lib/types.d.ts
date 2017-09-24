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
    callbackFunctions: IDLDefinitions.CallbackFunction[];
    callbackInterfaces: IDLDefinitions.Interface[];
    dictionaries: IDLDefinitions.Dictionary[];
    enums: IDLDefinitions.Enum[];
    interfaces: IDLDefinitions.Interface[];
    mixinInterfaces: IDLDefinitions.Interface[];
    typedefs: IDLDefinitions.Typedef[];
    namespaces: IDLDefinitions.Namespace[];
}

export interface MSEdgeIgnore {
    interfaces: string[],
    events: string[],
    cssProperties: string[]
}

export namespace IDLDefinitions {
    export interface CallbackFunction {
        name: string;
        nullable: boolean;
        type: string;
        params: Argument[];
    }

    export interface Dictionary {
        name: string;
        extends: string;
        partial?: boolean;
        members: DictionaryMember[];
    }

    export interface DictionaryMember {
        name: string;
        default?: string;
        nullable: boolean;
        type: string;
        required?: boolean;
    }

    export interface Enum {
        name: string;
        values: string[];
    }

    export interface Interface {
        name: string;
        extends?: string;
        partial?: boolean;

        noInterfaceObject?: boolean;
        namedConstructor?: { name: string; arguments: Argument[]; };
        constructors?: { arguments: Argument[]; }[];
        global?: string;
        primaryGlobal?: boolean;
        overrideBuiltins?: boolean;
        exposed?: string[];

        anonymousOperations?: AnonymousOperation[];
        constants?: Constant[];
        operations?: Operation[];
        attributes?: Attribute[];
        implements?: string[];

        iterable?: Iterable;

        events?: Event[];
        elements?: { name: string; namespace: string; }[];
    }

    export interface Constant {
        name: string;
        type: string;
        value: string;
    }

    export interface Iterable { 
        keytype?: string;
        type: string;
    }

    export interface Event {
        name: string;
        type: string;
    }

    export interface Namespace {
        name: string;
        partial?: boolean;

        exposed?: string[];

        operations?: Operation[];
        attributes?: Attribute[];
    }

    export interface Operation extends AnonymousOperation {
        name: string;
    }

    export interface AnonymousOperation {
        arguments?: Argument[];
        nullable: boolean;
        type: string;

        getter?: true;
        setter?: true;
        creator?: true;
        deleter?: true;
        static?: true;
        stringifier?: true;

        exposed?: string[];
    }

    export interface Attribute {
        name: string;
        readonly?: boolean;
        static?: boolean;
        stringifier?: boolean;
        nullable?: boolean;
        type: string;
        exposed?: string[];

        cssProperty?: string;
        eventHandler?: string;
    }

    export interface Argument {
        name: string;
        default?: string;
        optional?: boolean;
        nullable: boolean;
        type: string;
        variadic?: boolean;
    }

    export interface Typedef {
        name: string;
        nullable: boolean;
        type: string;
    }
}