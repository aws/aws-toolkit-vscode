/// <reference types="node" />
import type { Readable } from "stream";
/**
 * @param stream
 * @returns stream split into two identical streams.
 */
export declare function splitStream(stream: Readable): Promise<[Readable, Readable]>;
export declare function splitStream(stream: ReadableStream): Promise<[ReadableStream, ReadableStream]>;
