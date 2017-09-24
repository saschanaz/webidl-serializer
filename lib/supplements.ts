import { ImportRemoteDescription, IDLImportResult, IDLSnippetContent, FetchResult, IDLDefinitions } from "./types";
import * as mz from "mz/fs";

interface Supplement {
    events: EventSupplement[];
    cssProperties: string[];
    elements: { [key: string]: string };
    elementsPrefix: string;
}

interface EventSupplement {
    target: string
    types: {
        [key: string]: EventType;
    }
}

interface EventType {
    "interface": string;
    property: string;
}

interface EventTypeInterfacePair {
    eventType: string;
    eventInterface: string;
}

export async function apply(base: IDLImportResult) {
    const path = `supplements/${base.origin.description.title}.json`;
    const exists = await mz.exists(path);
    if (exists) {
        console.log(`A supplement is detected for ${base.origin.description.title}`);
    }
    // create an empty map when no supplement
    // to check every event handler property has its event type
    const supplement: Supplement = exists ? JSON.parse(await mz.readFile(path, "utf8")) : {};
    if (!supplement.events) {
        supplement.events = [];
    }

    if (supplement.elements) {
        base.snippets.push(createElementMapSnippet(supplement));
    }
    applyEventProperties(base, supplement);
    if (supplement.cssProperties) {
        base.snippets.push(createCSSPropertySnippet(supplement));
    }
}

function applyEventProperties(base: IDLImportResult, supplement: Supplement) {
    const propertyMap = createEventPropertyMap(supplement);

    for (const snippet of base.snippets) {
        for (const interfaceDef of snippet.interfaces) {
            const { attributes } = interfaceDef;
            if (!attributes) {
                continue;
            }
            const events = interfaceDef.events || [];
            for (const attribute of attributes) {
                if (!attribute.type.endsWith("EventHandler")) {
                    // not an event handler property
                    continue;
                }
                const key = `${interfaceDef.name}:${attribute.name}`;
                const eventInfo = propertyMap.get(key);
                if (!eventInfo) {
                    if (!attribute.eventHandler) {
                        console.warn(`WARNING: event type for ${key} is unknown`);
                    }
                    continue;
                }
                attribute.eventHandler = eventInfo.eventType;
                // Note: 'event type' means event name for web specification
                // but again means event interface type on TypeScript
                events.push({
                    name: eventInfo.eventType,
                    type: eventInfo.eventInterface
                });

                // should not appear twice
                propertyMap.delete(key);
            }

            if (events.length && !interfaceDef.events) {
                interfaceDef.events = events;
            }
        }
    }

    // warn if map still has items
    if (propertyMap.size) {
        console.warn(`WARNING: supplement for ${base.origin.description.title} has unmatched event properties:`)
        for (const key of propertyMap.keys()) {
            console.warn(key);
        }
    }
}

function createEventPropertyMap(supplement: Supplement) {
    const map = new Map<string, EventTypeInterfacePair>();
    for (const event of supplement.events) {
        for (const eventType in event.types) {
            const eventTypeInfo = event.types[eventType];
            // if property is defined then use it, otherwise autogenerate property name if type name is in lower case
            // (uppercased event types frequently does not have properties e.g. DOMContentLoaded)
            if (eventTypeInfo.property === null) {
                // property is explicitly disabled
                continue;
            }
            const property = eventTypeInfo.property || (eventType.toLowerCase() === eventType && `on${eventType}`);
            try {
                map.set(`${event.target}:${property}`, { eventType, eventInterface: eventTypeInfo["interface"] || "Event" });
            }
            catch (e) {
                console.warn(`WARNING: failed to map ${event.target}:${property}\n${e.message}`);
            }
        }
    }
    return map;
}

function createCSSPropertySnippet(supplement: Supplement): IDLSnippetContent {
    const cssStyleDeclaration: IDLDefinitions.Interface = {
        name: "CSSStyleDeclaration",
        partial: true,
        attributes: []
    };

    for (const cssProperty of supplement.cssProperties) {
        cssStyleDeclaration.attributes!.push({
            name: convertCSSNameToCamelCase(cssProperty),
            cssProperty,
            type: "CSSOMString"
        });
    }

    return {
        callbackFunctions: [],
        callbackInterfaces: [],
        dictionaries: [],
        enums: [],
        interfaces: [cssStyleDeclaration],
        typedefs: [],
        namespaces: []
    }
}

function convertCSSNameToCamelCase(name: string) {
    return name.split("-").map((value, index) => index === 0 ? value : convertLowercasedNameToPascalCase(value)).join('');
}

function convertLowercasedNameToPascalCase(name: string) {
    return `${name[0].toUpperCase()}${name.slice(1)}`
}

function createElementMapSnippet(supplement: Supplement): IDLSnippetContent {
    const interfaces: IDLDefinitions.Interface[] = [];
    for (const elementName in supplement.elements) {
        const elementInterfaceValue = supplement.elements[elementName];
        const elementInterfaceValueComputed = elementInterfaceValue == null ? convertLowercasedNameToPascalCase(elementName) : elementInterfaceValue;
        const elementInterfaceName = `${supplement.elementsPrefix}${elementInterfaceValueComputed}Element`;

        interfaces.push({
            name: elementInterfaceName,
            partial: true,
            elements: [{ name: elementName, namespace: supplement.elementsPrefix }]
        });
    }

    return {
        callbackFunctions: [],
        callbackInterfaces: [],
        dictionaries: [],
        enums: [],
        interfaces,
        typedefs: [],
        namespaces: []
    }
}