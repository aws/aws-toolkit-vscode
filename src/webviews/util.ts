/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Creates an anonymous class whose constructor automatically applies default values.
 *
 * Mostly just used for Vue as the types expect a class. Otherwise one would need to
 * manually describe constructor parameters and assignments for every field.
 *
 * Example (type inferred):
 * ```ts
 * export const MyClass = createClass({
 *     foo: 0,
 *     bar: 'a' as 'a' | 'b',
 * })
 * ```
 *
 * @param defaults Defaults to use during construction.
 *
 * @returns Anonymous class. Use `typeof MyClass` to extract its type.
 */
export function createClass<T>(defaults: T): { new (initial?: Partial<T>): T }
export function createClass<T>(defaults: Partial<T>, required: true): { new (initial: T): T }
export function createClass<T>(defaults: T): { new (initial?: Partial<T>): T } | { new (initial: T): T } {
    return class {
        constructor(initial: T | Partial<T> = {}) {
            Object.assign(this, defaults, initial)
        }
    } as any
}

// Creates a 'safe' Vue type using the anonymous class from `createClass`
// We don't really need to use this, but if you don't Vue will warn about type checking.
export function createType<T extends new (obj: Record<string, any>) => any>(Model: T) {
    return {
        type: [Model, Object],
        coerce: (obj: any) => new Model(obj),
    }
}
