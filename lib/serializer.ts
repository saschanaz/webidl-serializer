"use strict";

import * as WebIDL2 from "webidl2";
import { DOMParser } from "xmldom";
import * as jsdom from "jsdom";
import fetch from "node-fetch";
import prettifyXml = require("prettify-xml");
import * as mz from "mz/fs";
import * as yargs from "yargs";
import stringify from "json-compactline";
import { IDLProviderDescription, IDLExtractResult, IDLSnippetContent, FetchResult, MSEdgeIgnore, IDLDefinitions } from "./types";
import * as supplements from "./supplements.js";
import * as merger from "./partial-type-merger.js";
import nameSorter from "./namesort.js";

const unionLineBreakRegex = / or[\s]*/g;

run().catch(err => {
    console.error(err);
    process.exit(1);
});

async function run() {
    console.log("Loading spec list...");
    const providerList: IDLProviderDescription[] = JSON.parse(await mz.readFile("specs.json", "utf8"));

    const argv = yargs.array("pick").argv;
    if (argv._[0] === "local") {
        for (const provider of providerList) {
            // use remote copy only when specified
            if (provider.idl !== "none") {
                provider.idl = "local";
            }
        }
    }
    if (argv.pick) {
        const list = providerList.filter(item => (argv.pick as string[]).includes(item.title));
        providerList.length = 0;
        providerList.push(...list);
    }

    console.log("Fetching from web...");
    const results = await Promise.all(providerList.map(async (description): Promise<FetchResult> => {
        if (description.idl === "local") {
            const result: FetchResult = {
                description,
                content: await mz.readFile(`localcopies/${description.title}.widl`, "utf8")
            }
            console.log(`Got a local copy for ${description.title}`);
            return result;
        }
        else if (description.idl === "none") {
            return {
                description,
                content: ""
            }
        }

        const response = await fetch(description.url);
        if (!response.ok) {
            throw new Error(`Fetching ${description.url} failed: HTTP ${response.status} ${response.statusText}`);
        }
        const result: FetchResult = {
            description,
            content: await response.text()
        }
        console.log(`Fetching finished from ${description.url}`);
        return result;
    }));
    console.log("Fetching complete 100%");

    if (!(await mz.exists("built"))) {
        await mz.mkdir("built");
    }
    if (!(await mz.exists("built/partial"))) {
        await mz.mkdir("built/partial");
    }

    console.log("Extracting and parsing WebIDL...");

    // Importing IDL texts
    const extracts = await Promise.all(results.map(result => extractIDL(result)));
    
    for (const extracted of extracts) {
        if (extracted.origin.description.idl === "local" || extracted.origin.description.idl === "none") {
            continue;
        }
        await mz.writeFile(`localcopies/${extracted.origin.description.title}.widl`, extracted.idl);
    }

    console.log("Loading supplements...");
    for (const extractResult of extracts) {
        supplements.apply(extractResult);
    }

    for (const extracted of extracts) {
        const path = `built/partial/${extracted.origin.description.title}.webidl.json`;
        await mz.writeFile(path, stringify(mergeIDLSnippets(extracted.snippets)));
        console.log(`Writing as ${path}`);
    }
    console.log("Conversion as merged one as browser.webidl.json");
    await mz.writeFile("built/browser.webidl.json", stringify(mergeIDLSnippetsBatch(extracts)));
    console.log("Finished 100%");
}

function mergeIDLSnippetsBatch(extracts: IDLExtractResult[]) {
    const snippets: IDLSnippetContent[] = [];
    for (const item of extracts) {
        snippets.push(...item.snippets);
    }
    return mergeIDLSnippets(snippets);
}

function isWebIDLParseError(err: any): err is WebIDL2.WebIDLParseError {
    return Array.isArray(err.tokens);
}

async function extractIDL(result: FetchResult): Promise<IDLExtractResult> {
    if (result.description.idl === "local" || result.description.idl === "raw") {
        // IDL file is provided from local/remote, no need to manually get one
        return {
            snippets: [parseIDL(result.content, result)], origin: result, idl: result.content
        };
    }
    else if (result.description.idl === "none") {
        // The spec only has local supplements without actual IDL
        return {
            snippets: [], origin: result, idl: ""
        };
    }

    const win = await jsdomEnv(result.content);
    const idlElements = Array.from(win.document.querySelectorAll("pre.idl:not(.extract),code.idl-code")); /* .extract is used on an example IDL on specs including HTML and CSSOM */
    if (!idlElements.length) {
        throw new Error(`No IDLs in ${result.description.url}`);
    }
    const idlTexts =
        result.description.hasIdlIndex ? [idlElements[idlElements.length - 1].textContent!] :
            idlElements.map(element => element.textContent!);
    const idl = idlTexts.join('\n\n');

    win.close();
    return {
        snippets: [parseIDL(idl, result)], origin: result, idl
    };
}

function parseIDL(item: string, origin: FetchResult) {
    try {
        const snippet = createIDLSnippetContentContainer();
        const parsed = WebIDL2.parse(item);
        const implementsMap = new Map<string, string[]>();

        for (const rootItem of parsed) {
            /*
            implements: if the IDL snippet has target interface or partial interface, then insert <implements> into it
            if not, create a new partial interface that contains <implements>
            */
            if (rootItem.type === "implements") {
                if (!implementsMap.has(rootItem.target)) {
                    implementsMap.set(rootItem.target, [rootItem.implements]);
                }
                else {
                    implementsMap.get(rootItem.target)!.push(rootItem.implements);
                }
            }
            else {
                insert(rootItem, snippet);
            }
        }

        for (const entry of implementsMap.entries()) {
            let interfaceDef = snippet.interfaces.filter(item => item.name === entry[0])[0];
            if (!interfaceDef) {
                interfaceDef = {
                    name: entry[0],
                    partial: true
                };
                snippet.interfaces.push(interfaceDef);
            }
            if (!interfaceDef.implements) {
                interfaceDef.implements = [];
            }
            interfaceDef.implements.push(...entry[1]);
        }

        return snippet;
    }
    catch (err) {
        if (isWebIDLParseError(err)) {
            err.message = `A syntax error has found in a WebIDL code line ${err.line} from ${origin.description.url}:\n${err.message}\n${err.input}\n`;
        }
        else {
            err.message = `An error occured while converting WebIDL from ${origin.description.url}: ${err.message}`;
        }
        throw err;
    }
}

function mergeIDLSnippets(snippets: IDLSnippetContent[]) {
    const result = createIDLSnippetContentContainer();

    for (const snippet of snippets) {
        result.callbackFunctions.push(...cloneAsJSON(snippet.callbackFunctions));
        result.callbackInterfaces.push(...cloneAsJSON(snippet.callbackInterfaces));
        result.dictionaries.push(...cloneAsJSON(snippet.dictionaries));
        result.enums.push(...cloneAsJSON(snippet.enums));
        result.interfaces.push(...cloneAsJSON(snippet.interfaces));
        result.typedefs.push(...cloneAsJSON(snippet.typedefs));
        result.namespaces.push(...cloneAsJSON(snippet.namespaces));
    }

    merger.mergePartialTypes(result);

    result.callbackFunctions.sort(nameSorter);
    result.callbackInterfaces.sort(nameSorter);
    result.dictionaries.sort(nameSorter);
    result.enums.sort(nameSorter);
    result.interfaces.sort(nameSorter);
    result.typedefs.sort(nameSorter);
    result.namespaces.sort(nameSorter);

    return result;
}

function insert(webidl: WebIDL2.IDLRootType, snippetContent: IDLSnippetContent) {
    // callbacks to <callback-functions>
    // callback-interfaces to <callback-interfaces>
    // dictionaries to <dictionaries>
    // enums to <enums>
    // non-partial non-callback interfaces and exceptions to <interfaces>
    // partial interfaces to <mixin-interfaces>
    // typedefs to <typedefs>

    if (webidl.type === "callback") {
        snippetContent.callbackFunctions.push(createCallbackFunction(webidl));
    }
    else if (webidl.type === "callback interface") {
        snippetContent.callbackInterfaces.push(createInterface(webidl));
    }
    else if (webidl.type === "dictionary") {
        snippetContent.dictionaries.push(createDictionary(webidl));
    }
    else if (webidl.type === "enum") {
        snippetContent.enums.push(createEnum(webidl));
    }
    else if (webidl.type === "interface") {
        snippetContent.interfaces.push(createInterface(webidl));
    }
    else if (webidl.type === "typedef") {
        snippetContent.typedefs.push(createTypedef(webidl));
    }
    else if (webidl.type === "namespace") {
        snippetContent.namespaces.push(createNamespace(webidl));
    }
    else {
        console.log(`Skipped root IDL type ${webidl.type}`);
    }
}

function createCallbackFunction(callbackType: WebIDL2.CallbackType): IDLDefinitions.CallbackFunction {
    const callback: IDLDefinitions.CallbackFunction = {
        name: callbackType.name,
        type: uncapQuestionMark(callbackType.idlType),
        arguments: [...getArguments(callbackType.arguments)]
    };
    if (callbackType.idlType.nullable) {
        callback.nullable = true;
    }
    return callback;
}

function createDictionary(dictionaryType: WebIDL2.DictionaryType) {
    const dictionary: IDLDefinitions.Dictionary = {
        name: dictionaryType.name,
        members: []
    };

    if (dictionaryType.inheritance) {
        dictionary.extends = dictionaryType.inheritance;
    }
    if (dictionaryType.partial) {
        dictionary.partial = true;
    }

    for (const memberType of dictionaryType.members) {
        const member: IDLDefinitions.DictionaryMember = {
            name: memberType.name,
            type: uncapQuestionMark(memberType.idlType)
        };
        if (memberType.idlType.nullable) {
            member.nullable = true;
        }
        if (memberType.default) {
            member.default = getValueString(memberType.default)
        }
        if (memberType.required) {
            member.required = true;
        }
        dictionary.members.push(member);
    }

    dictionary.members.sort(nameSorter);
    return dictionary;
}

function createInterface(interfaceType: WebIDL2.InterfaceType) {
    const interfaceDef: IDLDefinitions.Interface = {
        name: interfaceType.name,
    };

    if (interfaceType.inheritance) {
        interfaceDef.extends = interfaceType.inheritance;
    }
    if (interfaceType.partial) {
        interfaceDef.partial = true;
    }

    for (const extAttr of interfaceType.extAttrs) {
        if (extAttr.name === "NoInterfaceObject") {
            interfaceDef.noInterfaceObject = true;
        }
        else if (extAttr.name === "HTMLConstructor") {
            // empty constuctor, only callable when subclassed
        }
        else if (extAttr.name === "NamedConstructor") {
            interfaceDef.namedConstructor = {
                name: extAttr.rhs.value as string,
                arguments: [...getArguments(extAttr.arguments)]
            }
        }
        else if (extAttr.name === "Constructor") {
            if (!interfaceDef.constructors) {
                interfaceDef.constructors = [];
            }
            interfaceDef.constructors.push({
                arguments: extAttr.arguments ? [...getArguments(extAttr.arguments)] : []
            });
        }
        else if (extAttr.name === "Global") {
            if (!extAttr.rhs) {
                interfaceDef.global = interfaceType.name;
            }
            else {
                interfaceDef.global = (extAttr.rhs.value as string[]).join(' ');
            }
        }
        else if (extAttr.name === "PrimaryGlobal") {
            interfaceDef.primaryGlobal = true;
        }
        else if (extAttr.name === "OverrideBuiltins") {
            interfaceDef.overrideBuiltins = true;
        }
        else if (extAttr.name === "LegacyUnenumerableNamedProperties") {
            // do nothing, just continue
        }
        else if (extAttr.name === "Exposed") {
            interfaceDef.exposed = Array.isArray(extAttr.rhs.value) ? extAttr.rhs.value : [extAttr.rhs.value];
        }
        else {
            console.log(`(TODO) Skipping extended attribute ${extAttr.name}`);
        }
    }

    const anonymousOperations: IDLDefinitions.AnonymousOperation[] = [];
    const constants: IDLDefinitions.Constant[] = [];
    const operations: IDLDefinitions.Operation[] = [];
    const attributes: IDLDefinitions.Attribute[] = [];

    for (const memberType of interfaceType.members) {
        if (memberType.type === "const") {
            constants.push(createConstant(memberType));
        }
        else if (memberType.type === "operation") {
            const operation = createAnonymousOperation(memberType);
            if (memberType.name) {
                operations.push({ name: memberType.name, ...operation })
            }
            else {
                anonymousOperations.push(operation);
            }
        }
        else if (memberType.type === "attribute") {
            attributes.push(createAttribute(memberType));
        }
        else if (memberType.type === "iterable") {
            interfaceDef.iterable = createIterableDeclarationMember(memberType);
        }
        else {
            console.log(`Skipped type ${memberType.type}`);
            // TODO: other member types
        }
    }

    // No need to sort here, they will be sorted inside partial type merger
    if (anonymousOperations.length) {
        interfaceDef.anonymousOperations = anonymousOperations;
    }
    if (constants.length) {
        interfaceDef.constants = constants;
    }
    if (operations.length) {
        interfaceDef.operations = operations;
    }
    if (attributes.length) {
        interfaceDef.attributes = attributes;
    }

    return interfaceDef;

    function createConstant(memberType: WebIDL2.ConstantMemberType): IDLDefinitions.Constant {
        return {
            name: memberType.name,
            type: memberType.idlType.trim(),
            value: getValueString(memberType.value)
        };
    }

    function createAnonymousOperation(operationType: WebIDL2.OperationMemberType) {
        const operation: IDLDefinitions.AnonymousOperation = {
            type: getReturnType()
        };
        if (operationType.idlType && operationType.idlType.nullable) {
            operation.nullable = true;
        }

        if (operationType.arguments) {
            operation.arguments = [...getArguments(operationType.arguments)];
        }

        if (operationType.getter) {
            operation.getter = true;
        }
        if (operationType.setter) {
            operation.setter = true;
        }
        if (operationType.creator) {
            operation.creator = true;
        }
        if (operationType.deleter) {
            operation.deleter = true;
        }
        if (operationType.static) {
            operation.static = true;
        }
        if (operationType.stringifier) {
            operation.stringifier = true;
        }

        for (const extAttr of operationType.extAttrs) {
            if (extAttr.name === "Exposed") {
                operation.exposed = Array.isArray(extAttr.rhs.value) ? extAttr.rhs.value : [extAttr.rhs.value];
            }
            else {
                console.log(`(TODO) Skipping extended attribute ${extAttr.name}`);
            }
        }

        return operation;

        function getReturnType() {
            if (!operationType.idlType && operationType.stringifier) {
                return "DOMString";
            }
            else {
                return uncapQuestionMark(operationType.idlType!);
            }
        }
    }

    function createAttribute(attributeType: WebIDL2.AttributeMemberType) {
        const attribute: IDLDefinitions.Attribute = {
            name: attributeType.name,
            type: uncapQuestionMark(attributeType.idlType)
        };
        if (attributeType.idlType.nullable) {
            attribute.nullable = true;
        }

        if (attributeType.readonly) {
            attribute.readonly = true;
        }
        if (attributeType.static) {
            attribute.static = true;
        }
        if (attributeType.inherit) {
            console.log("(TODO) Met an inherited attribute. What should be done for it?");
        }
        if (attributeType.stringifier) {
            attribute.stringifier = true;
        }

        for (const extAttr of attributeType.extAttrs) {
            if (extAttr.name === "Exposed") {
                attribute.exposed = Array.isArray(extAttr.rhs.value) ? extAttr.rhs.value : [extAttr.rhs.value];
            }
            else {
                console.log(`(TODO) Skipping extended attribute ${extAttr.name}`);
            }
        }

        return attribute;
    }

    function createIterableDeclarationMember(declarationMemberType: WebIDL2.IterableDeclarationMemberType) {
        if (Array.isArray(declarationMemberType.idlType)) {
            // key, value
            return {
                keytype: declarationMemberType.idlType[0].origin.trim(),
                type: declarationMemberType.idlType[1].origin.trim()
            }
        }
        else {
            // value only
            return {
                type: declarationMemberType.idlType.origin.trim()
            }
        }
        // TODO: extAttr
    }
}

function createEnum(enumType: WebIDL2.EnumType): IDLDefinitions.Enum {
    return {
        name: enumType.name,
        values: enumType.values
    };
}

function createTypedef(typedefType: WebIDL2.TypedefType) {
    const typedef: IDLDefinitions.Typedef = {
        name: typedefType.name,
        type: uncapQuestionMark(typedefType.idlType)
    };
    if (typedefType.idlType.nullable) {
        typedef.nullable = true;
    }
    return typedef;
}

function createNamespace(namespaceType: WebIDL2.NamespaceType) {
    const namespace: IDLDefinitions.Namespace = {
        name: namespaceType.name
    };

    if (namespaceType.partial) {
        namespace.partial = true;
    }

    for (const extAttr of namespaceType.extAttrs) {
        if (extAttr.name === "Exposed") {
            namespace.exposed = Array.isArray(extAttr.rhs.value) ? extAttr.rhs.value : [extAttr.rhs.value];
        }
        else {
            console.log(`(TODO) Skipping extended attribute ${extAttr.name}`);
        }
    }

    const operations: IDLDefinitions.Operation[] = [];
    const attributes: IDLDefinitions.Attribute[] = [];

    // TODO: separate member processor function
    // TODO: process extAttr for members
    for (const memberType of namespaceType.members) {
        if (memberType.type === "operation") {
            const operation: IDLDefinitions.Operation = {
                name: memberType.name!,
                type: uncapQuestionMark(memberType.idlType!)
            };
            if (memberType.idlType!.nullable) {
                operation.nullable = true;
            }

            if (memberType.arguments) {
                operation.arguments = [...getArguments(memberType.arguments)];
            }
            operations.push(operation);
        }
        else if (memberType.type === "attribute") {
            const attribute: IDLDefinitions.Attribute = {
                name: memberType.name,
                type: uncapQuestionMark(memberType.idlType)
            }
            if (memberType.idlType.nullable) {
                attribute.nullable = true;
            }
            if (memberType.readonly) {
                attribute.readonly = true;
            }
            attributes.push(attribute);
        }
    }

    if (operations.length) {
        operations.sort(nameSorter);
        namespace.operations = operations;
    }
    if (attributes.length) {
        attributes.sort(nameSorter);
        namespace.attributes = attributes;
    }
    return namespace;
}

function* getArguments(argumentTypes: WebIDL2.Argument[]) {
    for (const argumentType of argumentTypes) {
        const arg: IDLDefinitions.Argument = {
            name: argumentType.name,
            type: uncapQuestionMark(argumentType.idlType)
        };
        if (argumentType.idlType.nullable) {
            arg.nullable = true;
        }
        if (argumentType.optional) {
            arg.optional = true;
        }
        if (argumentType.variadic) {
            arg.variadic = true;
        }
        if (argumentType.default) {
            arg.default = getValueString(argumentType.default);
        }
        yield arg;
    }
}

function getParamList(argumentTypes: WebIDL2.Argument[]) {
    const paramList: Element[] = [];
    for (const argumentType of argumentTypes) {
        const param = document.createElement("param");
        param.setAttribute("name", argumentType.name);
        if (argumentType.default) {
            param.setAttribute("default", getValueString(argumentType.default));
        }
        if (argumentType.optional) {
            param.setAttribute("optional", "1");
        }
        if (argumentType.idlType.nullable) {
            param.setAttribute("nullable", "1");
            param.setAttribute("type", argumentType.idlType.origin.trim().slice(0, -1));
        }
        else {
            param.setAttribute("type", argumentType.idlType.origin.trim());
        }
        if (argumentType.variadic) {
            param.setAttribute("variadic", "1");
        }
        paramList.push(param);
    }
    return paramList;
}

function getValueString(typePair: WebIDL2.ValueDescription) {
    if (typePair.type === "string") {
        return `"${typePair.value}"`;
    }
    else if (typePair.type === "null") {
        return "null";
    }
    else if (typePair.type === "number" || typePair.type === "boolean") {
        return '' + typePair.value;
    }
    else if (typePair.type === "sequence") {
        return "[]"; // always empty array
    }
    else {
        throw new Error(`Unknown value string typed ${typePair.type}`);
    }
};

function appendChildrenAs(doc: Document, newParentName: string, children: Element[]) {
    const newParent = doc.createElement(newParentName);
    for (const child of children) {
        newParent.appendChild(child);
    }
    doc.documentElement.appendChild(newParent);
}

function createIDLSnippetContentContainer(): IDLSnippetContent {
    return {
        callbackFunctions: [],
        callbackInterfaces: [],
        dictionaries: [],
        enums: [],
        interfaces: [],
        typedefs: [],
        namespaces: []
    }
}

function jsdomEnv(html: string) {
    return new Promise<Window>((resolve, reject) => {
        jsdom.env(html, (error, window) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(window);
            }
        });
    });
}

/** TODO: uncapping may not be needed */
function uncapQuestionMark(idlType: WebIDL2.IDLTypeDescription) {
    const type = idlType.origin.trim().replace(unionLineBreakRegex, " or ");
    if (idlType.nullable) {
        return type.slice(0, -1);
    }
    return type;
}

function cloneAsJSON<T>(obj: T) {
    return JSON.parse(JSON.stringify(obj));
}
