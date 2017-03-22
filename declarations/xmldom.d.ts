declare module "xmldom" {
    var DOMImplementation: {
        prototype: DOMImplementation;
        new (): DOMImplementation;
    };
    var XMLSerializer: {
        prototype: XMLSerializer;
        new (): XMLSerializer;
    };
    var DOMParser: {
        prototype: DOMParser;
        new (): DOMParser;
    }
}