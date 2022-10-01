/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const getPropAs = <T>(obj: any, key: string) => {
    return (
        obj as any as {
            [key: string]: T
        }
    )[key]
}

export function isNonNullable<T>(obj: T): obj is NonNullable<T> {
    // eslint-disable-next-line no-null/no-null
    return obj !== undefined && obj !== null
}

/**
 * Stricter form of {@link Object.keys} that gives slightly better types for object literals.
 */
export function keys<T extends Record<string, any>>(obj: T): [keyof T & string] {
    return Object.keys(obj) as [keyof T & string]
}

export function isThenable<T>(obj: unknown): obj is Thenable<T> {
    return isNonNullable(obj) && typeof (obj as Thenable<T>).then === 'function'
}

export type ConstantMap<K, V> = Omit<ReadonlyMap<K, V>, 'get' | 'has'> & {
    get(key: K): V
    get(key: any): V | undefined
    has(key: any): key is K
}

export function createConstantMap<T extends PropertyKey, U extends PropertyKey>(obj: {
    readonly [P in T]: U
}): ConstantMap<T, U> {
    return new Map<T, U>(Object.entries(obj) as [T, U][]) as unknown as ConstantMap<T, U>
}

type NoSymbols<T> = { [Property in keyof T]: Property extends symbol ? never : Property }[keyof T]
export type InterfaceNoSymbol<T> = Pick<T, NoSymbols<T>>
/**
 * Narrows a type from the public keys of class T, which is _semantically_ an interface (and behaviorly, in almost all cases).
 *
 * Note: TypeScript types are purely structural so externally the result looks the same as
 * one declared with the `interface` keyword. The only difference from a literal `interface`
 * is that it cannot be re-declared for extension.
 */
export type ClassToInterfaceType<T> = Pick<T, keyof T>

type Expand<T> = T extends infer O ? { [K in keyof O]+?: O[K] } : never
/**
 * Forces a type to be resolved into its literal types.
 *
 * Normally imported types are left 'as-is' and are unable to be mapped. This alias uses
 * type inference to effectively generate a type literal of the target type.
 *
 */
export type ExpandWithObject<T> = Expand<T> extends Record<string, unknown> ? Expand<T> : never

/**
 * Given two types, this yields a type that includes only the fields where both types were the exact same
 * This is _almost_ equivalent to (T1 | T2) & T2 & T2, except that this type is distributive
 */
export type SharedTypes<T1, T2> = {
    [P in keyof T1 & keyof T2]: (T1[P] | T2[P]) & T1[P] & T2[P]
}

/* All of the string keys of the shared type */
export type SharedKeys<T1, T2> = string & keyof SharedTypes<T1, T2>

/* Any key that can be accumulated (i.e. an array) */
export type AccumulableKeys<T> = NonNullable<
    {
        [P in keyof T]: NonNullable<T[P]> extends any[] ? P : never
    }[keyof T]
>

/** Similar to the nullish coalescing operator, but for types that can never occur */
export type Coalesce<T, U> = [T] extends [never] ? U : T

/** Analagous to shifting an array but for tuples */
export type Shift<T extends any[]> = T extends [infer _, ...infer U] ? U : []
