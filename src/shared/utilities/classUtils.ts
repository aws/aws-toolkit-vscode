/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Utility functions for manipulating classes (constructor functions + their prototypes)

type Callback = (...args: any[]) => any
export type Functions<T> = { [P in keyof T]: T[P] extends Callback ? T[P] : never }
export type FunctionKeys<T> = { [P in keyof T]: T[P] extends Callback ? P : never }[keyof T]

/**
 * Returns all functions found on the target's prototype chain.
 *
 * Conflicts from functions sharing the same key are resolved by order of appearance, earlier
 * functions given precedence. This is equivalent to how the prototype chain is traversed when
 * evaluating `target[key]`, so long as the property descriptor is not a 'getter' function.
 */
export function getFunctions<T>(target: new (...args: any[]) => T): Functions<T> {
    const result = {} as Functions<T>

    for (const k of Object.getOwnPropertyNames(target.prototype)) {
        if (typeof target.prototype[k] === 'function') {
            result[k as keyof T] = target.prototype[k]
        }
    }

    const next = Object.getPrototypeOf(target)
    return next && next.prototype ? { ...getFunctions(next), ...result } : result
}
