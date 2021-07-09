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
