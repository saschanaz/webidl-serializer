declare module "webidl2" {
    function parse(str: string, options?: ParseOptions): IDLRootType[];

    type IDLRootType = InterfaceType | CallbackType | DictionaryType | ExceptionType | EnumType | TypedefType | ImplementsType | NamespaceType;

    type IDLInterfaceMemberType = OperationMemberType | AttributeMemberType | ConstantMemberType | SerializerMemberType | IteratorMemberType | DeclarationMemberType;

    type IDLNamespaceMemberType = OperationMemberType | AttributeMemberType;

    type DeclarationMemberType = SingularDeclarationMemberType | IterableDeclarationMemberType | MaplikeDeclarationMemberType;

    interface ParseOptions {
        /** Boolean indicating whether the parser should accept typedefs as valid members of interfaces. */
        allowNestedTypedefs?: boolean;
    }

    interface WebIDLParseError {
        /** the error message */
        message: string;
        /** the line at which the error occurred. */
        line: number;
        /** a short peek at the text at the point where the error happened */
        input: string;
        /** the five tokens at the point of error, as understood by the tokeniser */
        tokens: ValueDescription[];

        toString(): string;
    }

    interface IDLTypeDescription {
        /** String indicating the generic type (e.g. "Promise", "sequence"). null otherwise. */
        generic: string | null;
        /** Boolean indicating whether this is nullable or not. */
        nullable: boolean;
        /** Either false to indicate that it is not an array, or a number for the level of array nesting. */
        array: number | boolean;
        /**  It contains booleans that are true if the given array depth contains nullable elements, and false otherwise */
        nullableArray: boolean[] | null;
        /** Boolean indicating whether this is a union type or not. */
        union: boolean;
        /** In most cases, this will just be a string with the type name.
        If the type is a union, then this contains an array of the types it unites.
        If it is a generic type, it contains the IDL type description for the type in the sequence,
        the eventual value of the promise, etc. */
        idlType: string | IDLTypeDescription | IDLTypeDescription[];

        /** (Only on the fork) Original string representation of the IDL type */
        origin: string;
    }

    interface InterfaceType {
        type: "interface" | "callback interface";
        /** The name of the interface */
        name: string;
        /** A boolean indicating whether it's a partial interface. */
        partial: boolean;
        /** An array of interface members (attributes, operations, etc.). Empty if there are none. */
        members: IDLInterfaceMemberType[];
        /** A string giving the name of an interface this one inherits from, null otherwise. */
        inheritance: string | null;
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
    }

    interface CallbackType {
        type: "callback";
        /** The name of the callback. */
        name: string;
        /** An IDL Type describing what the callback returns. */
        idlType: IDLTypeDescription;
        /** A list of arguments, as in function paramters. */
        arguments: Argument[];
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
    }

    interface DictionaryType {
        type: "dictionary";
        /** The dictionary name. */
        name: string;
        /** Boolean indicating whether it's a partial dictionary. */
        partial: boolean;
        /** An array of members (see below). */
        members: DictionaryMemberType[];
        /** A string indicating which dictionary is being inherited from, null otherwise. */
        inheritance: string | null;
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
    }

    interface DictionaryMemberType extends FieldType {
        /** Boolean indicating whether this is a required field. */
        required: boolean;
        /** A default value, absent if there is none. */
        default: ValueDescription | null;
    }

    interface ExceptionType {
        type: "exception";
        /** The exception name. */
        name: string;
        /** An array of members (constants or fields, where fields are described below). */
        members: FieldType[];
        /** A string indicating which exception is being inherited from, null otherwise. */
        inheritance: string | null;
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
    }

    interface FieldType {
        type: "field";
        /** The name of the field. */
        name: string;
        /** An IDL Type describing what field's type. */
        idlType: IDLTypeDescription;
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
        /** A default value, absent if there is none. */
        default: ValueDescription;
    }

    interface EnumType {
        type: "enum";
        /** The enum's name. */
        name: string;
        /** An array of values (strings). */
        values: string[];
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
    }

    interface TypedefType {
        type: "typedef";
        /** The typedef's name. */
        name: string;
        /** An IDL Type describing what typedef's type. */
        idlType: IDLTypeDescription;
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
        /** A list of extended attributes that apply to the type rather than to the typedef as a whole. */
        typeExtAttrs: ExtendedAttributes[];
    }

    interface NamespaceType {
        type: "namespace";
        /** A boolean indicating whether it's a partial namespace. */
        partial: boolean;
        /** The enum's name. */
        name: string;
        /** An array of namespace members (attributes, operations). Empty if there are none. */
        members: IDLNamespaceMemberType[];
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
    }

    interface ImplementsType {
        type: "implements";
        /** The interface that implements another. */
        target: string;
        /** The interface that is being implemented by the target. */
        implements: string;
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
    }

    interface OperationMemberType extends OperationOrIterator {
        type: "operation";
    }

    interface OperationOrIterator {
        getter: boolean;
        /** True if a setter operation. */
        setter: boolean;
        /** True if a creator operation. */
        creator: boolean;
        /** True if a deleter operation. */
        deleter: boolean;
        /** True if a legacycaller operation. */
        legacycaller: boolean;
        /** True if a static operation. */
        static: boolean;
        /** True if a stringifier operation. */
        stringifier: boolean;
        /** An IDL Type of what the operation returns. If a stringifier, may be absent. */
        idlType: IDLTypeDescription | null;
        /** The name of the operation. If a stringifier, may be null. */
        name: string | null;
        /** An array of arguments for the operation. */
        arguments: Argument[] | null;
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
    }

    interface AttributeMemberType {
        type: "attribute";
        /** The attribute's name. */
        name: string;
        /** True if it's a static attribute. */
        static: boolean;
        /** True if it's a stringifier attribute. */
        stringifier: boolean;
        /** True if it's an inherit attribute. */
        inherit: boolean;
        /** True if it's a read-only attribute. */
        readonly: boolean;
        /** An IDL Type for the attribute. */
        idlType: IDLTypeDescription;
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
    }

    interface ConstantMemberType {
        type: "const";
        /** Whether its type is nullable. */
        nullable: boolean;
        /** The type of the constant (a simple type, the type name). */
        idlType: string;
        /** The name of the constant. */
        name: string;
        /** The constant value */
        value: ValueDescription;
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
    }

    interface SerializerMemberType {
        type: "serializer";
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
        /** The serializer's name if the serializer is a named serializer. */
        name: string | null;
    }

    interface SimpleSerializerMemberType extends SerializerMemberType {
        /** An IDL Type describing what the serializer returns. */
        idlType: IDLTypeDescription;
        operation: SerializerOperation;
    }

    interface SerializerOperation {
        /** The name of the operation. */
        name: string;
        /** An array of arguments for the operation. */
        arguments: Argument;
    }

    interface PatternSerializerMemberType extends SerializerMemberType {
        patternMap: boolean;
        patternList: boolean;
        /** An array of names in the pattern map. */
        names: string[];
    }

    interface IteratorMemberType extends OperationOrIterator {
        type: "iterator";
        iteratorObject: string;
    }

    interface Argument {
        default: ValueDescription;
        /** True if the argument is optional. */
        optional: boolean;
        /** True if the argument is variadic. */
        variadic: boolean;
        /** An IDL Type describing the type of the argument. */
        idlType: IDLTypeDescription;
        /** The argument's name. */
        name: string;
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
    }

    interface ExtendedAttributes {
        /** The extended attribute's name. */
        name: string;
        /** If the extended attribute takes arguments or if its right-hand side does they are listed here. */
        arguments: Argument[];
        /** If there is a right-hand side, this will capture its type ("identifier" or "identifier-list") and its value. */
        rhs: ExtendedAttributeRightHandSideIdentifier | ExtendedAttributeRightHandSideIdentifierList;
    }

    interface Token {
        type: "float" | "integer" | "identifier" | "string" | "whitespace" | "other";
        value: string;
    }

    interface ExtendedAttributeRightHandSideIdentifier {
        type: "identifier";
        value: string;
    }

    interface ExtendedAttributeRightHandSideIdentifierList {
        type: "identifier-list"
        value: string[];
    }

    interface ValueDescription {
        type: "string" | "number" | "boolean" | "null" | "Infinity" | "NaN" | "sequence";
        value: string | any[] | null;
        negative: boolean | null;
    }

    interface SingularDeclarationMemberType extends DeclarationMemberTypeBase {
        type: "legacyiterable" | "setlike";
        /** An IDL Type representing the declared type arguments. */
        idlType: IDLTypeDescription;
    }

    interface IterableDeclarationMemberType extends DeclarationMemberTypeBase {
        type: "iterable";
        idlType: IDLTypeDescription | IDLTypeDescription[];
    }

    interface MaplikeDeclarationMemberType extends DeclarationMemberTypeBase {
        type: "maplike";
        /** An array of two IDL Types representing the declared type arguments. */
        idlType: IDLTypeDescription[];
    }

    interface DeclarationMemberTypeBase {
        /** Whether the maplike or setlike is declared as read only. */
        readonly: boolean;
        /** A list of extended attributes. */
        extAttrs: ExtendedAttributes[];
    }
}