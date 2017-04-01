import { ExportRemoteDescription, IDLExportResult, IDLSnippetContent, FetchResult } from "./types";
import * as fspromise from "./fspromise";
import * as xhelper from "./xmldom-helper";

interface Supplement {
    events: EventSupplement[];
}

interface EventSupplement {
    target: string
    properties: {
        [key: string]: string;
    },
    types: {
        [key: string]: EventType;
    }
}

interface EventType {
    "interface": string;
}

interface EventTypeInterfacePair {
    eventType: string;
    eventInterface: string;
}

export async function apply(base: IDLExportResult) {
    const path = `supplements/${base.origin.description.title}.json`;
    const exists = await fspromise.exists(path);
    if (exists) {
        console.log(`A supplement is detected for ${base.origin.description.title}`);
    }
    const supplement: Supplement = exists && JSON.parse(await fspromise.readFile(path));

    // create an empty map when no supplement
    // to check every event handler property has its event type
    const propertyMap = exists ? createEventPropertyMap(supplement) : new Map<string, EventTypeInterfacePair>();

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
        for (const property in event.properties) {
            const eventType = event.properties[property];
            try {
                map.set(`${event.target}:${property}`, { eventType, eventInterface: event.types[eventType]["interface"] });
            }
            catch (e) {
                console.warn(`WARNING: failed to map ${event.target}:${property}\n${e.message}`);
            }
        }
    }
    return map;
}