export function sorter(x: Element, y: Element) {
    return x.getAttribute("name").localeCompare(y.getAttribute("name"));
}

export function xmlSort(element: Element) {
    if (!element) {
        return;
    }
    const nodes = Array.from(element.childNodes).sort(sorter);
    for (const node of nodes) {
        element.removeChild(node);
        (node as any).parentNode = null; // xmldom bug
    }
    for (const node of nodes) {
        element.appendChild(node);
    }
    return element;
}

export function xmlMemberSetSort(parent: Element, memberSets: string[]) {
    for (const memberSet of memberSets) {
        xmlSort(parent.getElementsByTagName(memberSet)[0]);
    }
    return parent;
}