/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isNameMangled } from '../vscode/env'
import { isNonNullable } from './tsUtils'

/**
 * A 'type constructor' is any function that resolves to the given type.
 *
 * This function should throw if the input cannot be converted into the desired type.
 * Implementations must not assume anything about the input other than that they may
 * receive at least a single parameter.
 */
export type TypeConstructor<T = any> = Assertion<T> | Transform<T>

type Transform<T> = { (value: unknown): T }
type Assertion<T> = { (value: unknown): asserts value is T }

/**
 * A function with a `typeName` field. Useful for logging/debugging purposes.
 */
type NamedTypeConstructor<T = any> = { readonly typeName: string } & TypeConstructor<T>

/**
 * Simple structure to represent objects where each field may map to its own type.
 *
 * #### Example:
 * ```
 * const descriptor = {
 *     foo: Number,
 *     bar: Boolean,
 * }
 *
 * type SomeObject = FromDescriptor<typeof descriptor>
 *
 * const someObject: SomeObject = {
 *     foo: 0,
 *     bar: true,
 * }
 * ```
 */
export interface TypeDescriptor {
    [prop: string]: TypeConstructor // | TypeDescriptor // nesting not supported
}

export type FromDescriptor<T extends TypeDescriptor> = {
    [P in keyof T]: T[P] extends TypeConstructor<infer U> ? U : never
}

// `Symbol` and `BigInt` are included here, though in-practice
const primitives = [Number, String, Boolean, Object, Symbol, BigInt]
function isPrimitiveConstructor(type: unknown): type is typeof primitives[number] {
    return !!primitives.find(p => p === type)
}

function isNamedTypeConstructor(obj: unknown): obj is NamedTypeConstructor {
    return typeof obj === 'function' && Object.prototype.hasOwnProperty.call(obj, 'typeName')
}

// For debug/logging purposes only. The 'name' is not intended to be a unique identifier.
export function getTypeName(type: TypeConstructor): string {
    const fallback = isPrimitiveConstructor(type) || !isNameMangled() ? type.name : '[Omitted]'
    const typeName = isNamedTypeConstructor(type) ? type.typeName : fallback

    return typeName || '[Anonymous Type]'
}

export function addTypeName<F extends (input: unknown) => unknown>(name: string, fn: F) {
    return Object.assign(fn, { typeName: name })
}

/**
 * A utility function to validate or transform an unknown input into a known shape.
 *
 * This **will throw** in the following scenarios:
 *   - `type` is a {@link primitives "primitive" constructor} and `input` is a different primitive type
 *   - `input` is rejected by the `type` function
 *
 * Callers must not assume that `input` can be used freely after a call; `cast` makes no guarantees about
 * the mutability of `input`, nor does it guarantee that the output is a reference to `input`.
 *
 */
export function cast<T>(input: any, type: TypeConstructor<T>): T {
    const actualType = typeof input
    const typeName = getTypeName(type)

    if (isPrimitiveConstructor(type) && typeof input !== type.name.toLowerCase()) {
        throw new TypeError(`Unexpected type cast: got ${actualType}, expected primitive ${typeName}`)
    }

    try {
        return type(input) ?? input
    } catch (error) {
        throw new TypeError(`Failed to cast type "${typeof input}" to ${typeName}: ${error}`)
    }
}

// Don't really want to overload the standard `Array` constructor here even though every other
// type function exported from this module omits the "Constructor" suffix
export function ArrayConstructor<T>(type: TypeConstructor<T>): TypeConstructor<Array<T>> {
    return addTypeName(`Array<${getTypeName(type)}>`, value => {
        if (!Array.isArray(value)) {
            throw new TypeError('Value is not an array')
        }

        return value.map(element => cast(element, type))
    })
}

function OptionalConstructor<T>(type: TypeConstructor<T>): TypeConstructor<T | undefined> {
    return addTypeName(`Optional<${getTypeName(type)}>`, value =>
        isNonNullable(value) ? cast(value, type) : undefined
    )
}

function InstanceConstructor<T>(type: new (...args: any[]) => T): TypeConstructor<T> {
    return value => {
        if (!(value instanceof type)) {
            throw new TypeError('Value is not an instance of the expected type')
        }

        return value
    }
}

export function Record<T extends PropertyKey, U>(
    key: TypeConstructor<T>,
    value: TypeConstructor<U>
): TypeConstructor<Record<T, U>> {
    return input => {
        if (!(typeof input === 'object') || !input) {
            throw new TypeError('Value is not a non-nullable object')
        }

        const result = {} as Record<T, U>
        for (const [k, v] of Object.entries(input)) {
            result[cast(k, key)] = cast(v, value)
        }

        return result
    }
}

export type Optional<T> = TypeConstructor<T | undefined>
export const Optional = OptionalConstructor

// Aliasing to distinguish from the concrete implementation the "primitive" object
export type Any = any
export const Any: TypeConstructor<any> = addTypeName('Any', value => value)

export type Instance<T extends new (...args: any[]) => unknown> = InstanceType<T>
export const Instance = InstanceConstructor
