export function getChildrenArray(element: Element) {
    // xmldom does not support element.children
    return Array.from(element.childNodes).filter(node => node.nodeType === 1) as Element[];
}

export function getChild(element: Element, childTagName: string) {
    // xmldom does not support getElementsByTagName on Element
    return getChildrenArray(element).filter(element => element.tagName.toLowerCase() === childTagName.toLowerCase())[0];
}

export function getChildWithProperty(element: Element, childTagName: string, property: string, value: string) {
    // xmldom does not support querySelector
    return getChildrenArray(element).filter(element => element.tagName.toLowerCase() === childTagName.toLowerCase() && element.getAttribute(property) === value)[0];
}

export function cloneNode(node: Node) {
    // xmldom does not support cloneNode
    const newNode = node.ownerDocument.createElement(node.nodeName);
    for (const attribute of Array.from(node.attributes)) {
        newNode.setAttribute(attribute.name, attribute.value);
    }
    return newNode;
}

export function cloneNodeDeep(node: Node): Node {
    const newNode = cloneNode(node);
    for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 1) {
            newNode.appendChild(cloneNodeDeep(child));
        }
    }
    return newNode;
}