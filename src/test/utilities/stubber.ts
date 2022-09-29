/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'

type Stub<T> = T & { [P in keyof T]: sinon.SinonStubbedMember<T[P]> }
type Fields<T> = { [P in FieldKeys<T>]-?: T[P] }
type FieldKeys<T> = { [P in keyof T]: T[P] extends (...args: any[]) => unknown ? never : P }[keyof T]
type PartialStub<T> = FieldKeys<T> extends never ? Stub<T> : Stub<Omit<T, FieldKeys<T>>>

export function stub<T>(ctor: new (...args: any[]) => T): PartialStub<T>
export function stub<T>(ctor: new (...args: any[]) => T, fields: Fields<T>): Stub<T>
export function stub<T>(ctor: new (...args: any[]) => T, fields?: Fields<T>): Stub<T> {
    const stubs = new Map<PropertyKey, sinon.SinonStub>()

    return new Proxy(fields ?? {}, {
        get: (target, prop, receiver) => {
            if (Reflect.has(target, prop)) {
                return Reflect.get(target, prop, receiver)
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
