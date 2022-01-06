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
export type SharedProp<T1, T2> = string & keyof SharedTypes<T1, T2>

/* Any key that can be accumulated (i.e. an array) */
export type AccumulableKeys<T> = NonNullable<
    {
        [P in keyof T]: NonNullable<T[P]> extends any[] ? P : never
    }[keyof T]
>

/** Similar to the nullish coalescing operator, but for types that can never occur */
export type NeverCoalesce<T, U> = [T] extends [never] ? U : T
