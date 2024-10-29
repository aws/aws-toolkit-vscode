/// <reference path="./src/test.d.ts" />
/// <reference types="node" />

export class C {
  protected get p(): number;
  protected set p(value: number);
  public get q(): string;
  private set r(value: boolean);
}
// hi, this should still be there
export namespace N {
  abstract class D {
    /**
     * @readonly
     * @memberof BlobLeaseClient
     * @type {number}
     */
    get p(): number;
    /** preserve this too */
    set p(value: number);
    get q();
    abstract set r(value: boolean);
  }
}
/** is this a single-line comment? */
import type { C as CD } from "./src/test";
/** preserve it */
import { type C as CD2, type C as CD3 } from "./src/test";
/** this too */
import { C as CD4, type C as CD5 } from "./src/test";
/** preserve it */
export { type CD2, type CD3 };
/** this too */
export { CD4, type CD5 };
/** preserve it */
export { type C as CD6, type C as CD7 } from "./src/test";
/** this too */
export { C as CD8, type C as CD9 } from "./src/test";

// another comment
export * as rex from "./src/test";

export interface E {
  a: number;
  b: number;
}

/// is this a single-line comment?
export type F = Omit<E, 'a'>

export class G {
    #private
}
export class H extends G {
    #private
}
export interface I extends Omit<E, 'a'> {
    version: number;
}
declare function guardIsString(val: any): val is string;
/** side-effects! */
declare function assertIsString(val: any, msg?: string): asserts val is string;
declare function assert(val: any, msg?: string): asserts val;

type J = [foo: string, bar: number, ...arr:boolean[]]

export * as default from "./src/test";

export declare type Asserts<T> = (val: unknown) => asserts val is T;

export declare const foo: {
    bar: {
        baz: <T>(val: unknown) => asserts val is T;
    };
};

export type IR = IteratorResult<number, string>;