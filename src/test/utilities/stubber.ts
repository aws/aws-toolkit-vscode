/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'

export type Stub<T> = T & { [P in keyof T]: sinon.SinonStubbedMember<T[P]> }
type Fields<T> = { [P in FieldKeys<T>]-?: T[P] }
type FieldKeys<T> = { [P in keyof T]: T[P] extends (...args: any[]) => unknown ? never : P }[keyof T]
type PartialStub<T> = FieldKeys<T> extends never ? Stub<T> : Stub<Omit<T, FieldKeys<T>>>

/**
 * Stubs classes for testing. Does NOT work when an object is defined by an interface or type alone.
 * To stub an interface/type, use the following:
 * ```
 * const mockObject = <ObjectType>{ <keyFromObjectType>: <overridden value> }
 * ```
 * @param ctor Class constructor
 * @param fields _Optional_ fields to ensure class matches signature
 */
export function stub<T>(ctor: new (...args: any[]) => T): PartialStub<T>
export function stub<T>(ctor: new (...args: any[]) => T, fields: Fields<T>): Stub<T>
export function stub<T>(ctor: new (...args: any[]) => T, fields?: Fields<T>): Stub<T> {
    const stubs = new Map<PropertyKey, sinon.SinonStub>()

    return new Proxy(fields ?? {}, {
        get: (target, prop, receiver) => {
            if (Reflect.has(target, prop)) {
                return Reflect.get(target, prop, receiver)
            }

            // For `Promise` support
            if (prop === 'then') {
                return undefined
            }

            const previous = stubs.get(prop)
            if (previous !== undefined) {
                return previous
            }

            const name = `${ctor.name}${typeof prop === 'symbol' ? `[${String(prop)}]` : `.${String(prop)}`}`
            const newStub = sinon
                .stub()
                .named(name)
                .callsFake(() => {
                    throw new TypeError(`${name} was called uninitialized.`)
                })

            stubs.set(prop, newStub)
            return newStub
        },
    }) as Stub<T>
}
