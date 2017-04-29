import { ExportRemoteDescription, IDLExportResult, IDLSnippetContent, FetchResult } from "./types";
import * as mz from "mz/fs";
import * as xhelper from "./xmldom-helper";

interface Supplement {
    events: EventSupplement[];
    cssProperties: string[];
    elements: { [key: string]: string };
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

export async function apply(base: IDLExportResult, doc: Document) {
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

    applyEventProperties(base, supplement);
    if (supplement.cssProperties) {
        base.snippets.push(createCSSPropertySnippet(supplement, doc));
    }
    if (supplement.elements) {
        base.snippets.push(createElementMapSnippet(supplement, doc));
    }
}

function applyEventProperties(base: IDLExportResult, supplement: Supplement) {
    const propertyMap = createEventPropertyMap(supplement);

    for (const snippet of base.snippets) {
        for (const interfaceEl of [...snippet.interfaces, ...snippet.mixinInterfaces]) {
            const properties = xhelper.getChild(interfaceEl, "properties");
            if (!properties) {
                continue;
            }
            const events = xhelper.getChild(interfaceEl, "events") || interfaceEl.ownerDocument.createElement("events");
            for (const property of xhelper.getChildrenArray(properties)) {
                if (property.getAttribute("type") !== "EventHandler") {
                    // not an event handler property
                    continue;
                }
                const key = `${interfaceEl.getAttribute("name")}:${property.getAttribute("name")}`;
                const eventInfo = propertyMap.get(key);
                if (!eventInfo) {
                    if (!property.getAttribute("event-handler")) {
                        console.warn(`WARNING: event type for ${key} is unknown`);
                    }
                    continue;
                }
                property.setAttribute("event-handler", eventInfo.eventType);
                const event = interfaceEl.ownerDocument.createElement("event");
                // Note: 'event type' means event name for web specification
                // but again means event interface type on TypeScript
                event.setAttribute("name", eventInfo.eventType);
                event.setAttribute("type", eventInfo.eventInterface);
                events.appendChild(event);

                // should not appear twice
                propertyMap.delete(key);
            }

            if (events.childNodes.length && !xhelper.getChild(interfaceEl, "events")) {
                interfaceEl.appendChild(events);
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

function createCSSPropertySnippet(supplement: Supplement, doc: Document): IDLSnippetContent {
    const cssStyleDeclaration = doc.createElement("interface");
    cssStyleDeclaration.setAttribute("name", "CSSStyleDeclaration");
    cssStyleDeclaration.setAttribute("no-interface-object", "1");
    cssStyleDeclaration.setAttribute("sn:partial", "1");

    const properties = doc.createElement("properties")

    for (const cssProperty of supplement.cssProperties) {
        const property = doc.createElement("property");
        property.setAttribute("name", cssProperty)
        property.setAttribute("css-property", convertCSSNameToCamelCase(cssProperty));
        properties.appendChild(property);
    }
    cssStyleDeclaration.appendChild(properties);

    return {
        callbackFunctions: [],
        callbackInterfaces: [],
        dictionaries: [],
        enums: [],
        interfaces: [cssStyleDeclaration],
        mixinInterfaces: [],
        typedefs: [],
        namespaces: []
    }
}

function convertCSSNameToCamelCase(name: string) {
    return name.split("-").map((value, index) => index === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`).join('');
}

function createElementMapSnippet(supplement: Supplement, doc: Document): IDLSnippetContent {
    const interfaces: Element[] = [];
    for (const interfaceName in supplement.elements) {
        const interfaceEl = doc.createElement("interface");
        interfaceEl.setAttribute("name", interfaceName);
        interfaceEl.setAttribute("no-interface-object", "1");
        interfaceEl.setAttribute("sn:partial", "1");

        const element = doc.createElement("element")
        element.setAttribute("name", supplement.elements[interfaceName]);
        
        interfaceEl.appendChild(element);
        interfaces.push(interfaceEl);
    }

    return {
        callbackFunctions: [],
        callbackInterfaces: [],
        dictionaries: [],
        enums: [],
        interfaces: interfaces,
        mixinInterfaces: [],
        typedefs: [],
        namespaces: []
    }
}