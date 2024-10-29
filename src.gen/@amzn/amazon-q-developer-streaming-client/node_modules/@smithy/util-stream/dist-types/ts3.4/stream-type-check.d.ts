/**
 * @internal
 * Alias prevents compiler from turning
 * ReadableStream into ReadableStream<any>, which is incompatible
 * with the NodeJS.ReadableStream global type.
 */
type ReadableStreamType = ReadableStream;
/**
 * @internal
 */
export declare const isReadableStream: (stream: unknown) => stream is ReadableStreamType;
export {};
