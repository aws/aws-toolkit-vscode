/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export function stringOrProp(obj: any, prop: string): string {
    if (obj === undefined || typeof obj === 'string') {
        return obj ?? ''
    }
    return obj[prop] ?? ''
}

export function getMissingProps<T>(obj: T, ...props: (keyof T)[]): typeof props {
    return props.filter(prop => obj[prop] === undefined)
}

export function hasProps<T, K extends keyof T>(obj: T, ...props: K[]): obj is Readonly<RequiredProps<T, K>> {
    return getMissingProps(obj, ...props).length === 0
}

export function hasStringProps<T, K extends PropertyKey>(obj: T, ...props: K[]): obj is T & { [P in K]: string } {
    return props.filter(prop => typeof (obj as unknown as Record<K, unknown>)[prop] !== 'string').length === 0
}

export function assertHasProps<T, K extends keyof T>(
    obj: T | undefined,
    ...props: K[]
): asserts obj is Readonly<RequiredProps<T, K>> {
    if (!isNonNullable(obj)) {
        throw new TypeError(`Object was null or undefined, expected properties: ${props.join(', ')}`)
    }

    const missing = getMissingProps(obj, ...props)
    if (missing.length > 0) {
        throw new TypeError(`Object was missing properties: ${missing.join(', ')}`)
    }

    // May be easier/cleaner to just copy the object rather than freezing it
    // Should also check the properties and make sure they're all data descriptors
    Object.freeze(obj)
}

export function selectFrom<T, K extends keyof T>(obj: T, ...props: K[]): { [P in K]: T[P] } {
    return props.map(p => [p, obj[p]] as const).reduce((a, [k, v]) => ((a[k] = v), a), {} as { [P in K]: T[P] })
}

export function isNonNullable<T>(obj: T | void): obj is NonNullable<T> {
    return obj !== undefined && obj !== null
}

export function isKeyOf<T extends object>(key: PropertyKey, obj: T): key is keyof T {
    return key in obj
}

export function hasKey<T extends object, K extends PropertyKey>(obj: T, key: K): obj is T & { [P in K]: unknown } {
    return isKeyOf(key, obj)
}

/**
 * Stricter form of {@link Object.keys} that gives slightly better types for object literals.
 */
export function keys<T extends Record<string, any>>(obj: T): [keyof T & string] {
    return Object.keys(obj) as [keyof T & string]
}

export function keysAsInt<T extends Record<number, any>>(obj: T): number[] {
    return Object.keys(obj).map(k => parseInt(k))
}

/**
 * Stricter form of {@link Object.entries} that gives slightly better types for object literals.
 */
export function entries<T extends Record<string, U>, U>(obj: T): { [P in keyof T]: [P, T[P]] }[keyof T][] {
    return Object.entries(obj) as { [P in keyof T]: [P, T[P]] }[keyof T][]
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

export function createFactoryFunction<T extends new (...args: any[]) => any>(ctor: T): FactoryFunction<T> {
    return (...args) => new ctor(...args)
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
export type Coalesce<T, U> = [T] extends [never] ? U : T

/** Makes all keys `K` of `T` non-nullable */
export type RequiredProps<T, K extends keyof T> = T & { [P in K]-?: NonNullable<T[P]> }

/** Analagous to shifting an array but for tuples */
export type Shift<T extends any[]> = T extends [infer _, ...infer U] ? U : []

/** Transforms a type into a mutable version */
export type Mutable<T> = { -readonly [P in keyof T]: T[P] }

export type FactoryFunction<T extends abstract new (...args: any[]) => any> = (
    ...args: ConstructorParameters<T>
) => InstanceType<T>

/** Can be used to isolate all number fields of a record `T` */
export type NumericKeys<T> = { [P in keyof T]-?: T[P] extends number | undefined ? P : never }[keyof T]
