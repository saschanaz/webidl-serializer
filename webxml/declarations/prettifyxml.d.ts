declare module "prettify-xml" {
    interface prettifyXmlOptions {
        indent?: number;
    }
    function prettifyXml(input: string, options?: prettifyXmlOptions): void
    export = prettifyXml;
}