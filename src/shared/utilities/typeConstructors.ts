/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isNonNullable } from './tsUtils'

/**
 * A 'type constructor' is any function that resolves to the given type.
 *
 * This function should throw if the input cannot be converted into the desired type.
 * Implementations must not assume anything about the input other than that they may
 * receive at least a single parameter.
 */
export type TypeConstructor<T = any> = ((value: unknown) => T) | ConstructableType<T>

interface NamedTypeConstructor<T = any> {
    readonly type: string
    (value: unknown): T
}

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

/**
 * Special symbol to represent a type constructor. This prevents having to use traps to check for [[Construct]]
 */
export const typeConstructor = Symbol('A constructor function used to create or validate an object against the type.')

type ConstructableType<T = any> = {
    // TODO: remove the `new` overloads and just manually map primitive constructors to their types
    new (value: unknown): T
    new (value: unknown): { valueOf(): T }
    [typeConstructor](value: unknown): T
}

function isConstructableType(obj: any): obj is ConstructableType {
    return Object.prototype.hasOwnProperty.call(obj, typeConstructor)
}

const primitives = [Number, String, Boolean, Object, Symbol, BigInt]
function checkPrimitiveType<T>(v: any, ctor: TypeConstructor<T>): boolean {
    if (typeof v === 'object' || !ctor.name || !primitives.find(p => p === ctor)) {
        return true
    }
    return typeof v === ctor.name.toLowerCase()
}

// This type cast is stricter than Javascript's default type casting
// For example, primitive to primtive type casts would cause an error with this function
export function cast<T>(val: any, type: TypeConstructor<T>): T {
    const actualType = typeof val
    const typeName = type.name?.toLowerCase()

    if (!checkPrimitiveType(val, type)) {
        throw new TypeError(`Unexpected type cast: got ${actualType}, expected ${typeName}`)
    }

    const formattedName = type.name ? `"${type.name}"` : '[Anonymous Type]'

    try {
        return !isConstructableType(type) ? type(val) : new type(val)
    } catch (err) {
        throw new TypeError(`Failed to cast type "${typeof val}" to ${formattedName}`)
    }
}

// Don't really want to overload the standard `Array` constructor here even though everything
// else in this module omits the "Constructor" suffix
export function ArrayConstructor<T>(type: TypeConstructor<T>): TypeConstructor<Array<T>> {
    return value => {
        if (!Array.isArray(value)) {
            throw new TypeError('Value is not an array')
        }

        return value.map(element => cast(element, type))
    }
}

function OptionalConstructor<T>(ctor: TypeConstructor<T>): TypeConstructor<T | undefined> {
    return input => (isNonNullable(input) ? cast(input, ctor) : undefined)
}

export type Optional<T> = TypeConstructor<T | undefined>
export const Optional = OptionalConstructor

// Aliasing to distinguish from the concrete implementation the "primitive" object
export type Any = any
export const Any: TypeConstructor<any> = value => value
