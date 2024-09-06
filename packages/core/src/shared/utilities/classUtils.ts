/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Utility functions for manipulating classes (constructor functions + their prototypes)

type Method<T> = { (this: T, ...args: any[]): unknown }
export type Functions<T> = { [P in keyof T]: T[P] extends Method<T> ? T[P] : never }
export type FunctionKeys<T> = { [P in keyof T]: T[P] extends Method<T> ? P : never }[keyof T]

/**
 * Returns all functions found on the target's prototype chain.
 *
 * Conflicts from functions sharing the same key are resolved by order of appearance, earlier
 * functions given precedence. This is equivalent to how the prototype chain is traversed when
 * evaluating `target[key]`, so long as the property descriptor is not a 'getter' function.
 *
 * ## Important
 * The return type currently shows _all_ functions on the instance interface regardless of
 * whether or not it exists on the prototype. This is a consequence of lenient structural
 * typing when indexing class instance types; the `this` type is not directly conferred to
 * the associated signature.
 */
export function getFunctions<T>(target: new (...args: any[]) => T): Functions<T> {
    const result = {} as Functions<T>

    for (const k of Object.getOwnPropertyNames(target.prototype)) {
        const value = Object.getOwnPropertyDescriptor(target.prototype, k)?.value
        if (typeof value === 'function') {
            result[k as keyof T] = value
        }
    }

    const next = Object.getPrototypeOf(target)
    return next && next.prototype ? { ...getFunctions(next), ...result } : result
}
