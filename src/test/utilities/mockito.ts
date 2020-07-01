/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as mockito from 'ts-mockito'
import { Mocker } from 'ts-mockito/lib/Mock'

// Workaround https://github.com/NagRock/ts-mockito/issues/163
export function mock<T>(): T {
    const mocker = new Mocker(undefined)
    mocker['excludedPropertyNames'] += 'then'

    return mocker.getMock()
}

export const spy = mockito.spy
export const verify = mockito.verify
export const when = mockito.when
export const instance = mockito.instance
export const capture = mockito.capture
export const reset = mockito.reset
export const resetCalls = mockito.resetCalls
export const anyOfClass = mockito.anyOfClass
export const anyFunction = mockito.anyFunction
export const anyNumber = mockito.anyNumber
export const anyString = mockito.anyString
export const anything = mockito.anything
export const between = mockito.between
export const deepEqual = mockito.deepEqual
export const notNull = mockito.notNull
export const strictEqual = mockito.strictEqual
export const match = mockito.match
export const objectContaining = mockito.objectContaining
