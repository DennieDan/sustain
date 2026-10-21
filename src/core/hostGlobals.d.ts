// The three web-platform globals the core uses, which Node and every browser provide. The core
// typecheck sees these beside ES2023 and nothing else. The root typecheck leaves this file out,
// because its DOM and Node types declare them already.
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  decode(input?: Uint8Array): string;
}

declare function structuredClone<T>(value: T): T;
