/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { NotificationsState, NotificationsStateConstructor } from '../../notifications/types'

describe('NotificationsState type validation', function () {
    it('passes on valid input', async function () {
        const state: NotificationsState = {
            startUp: {},
            emergency: {},
            dismissed: [],
            newlyReceived: [],
        }
        let ret
        assert.doesNotThrow(() => {
            ret = NotificationsStateConstructor(state)
        })
        assert.deepStrictEqual(ret, state)
    })

    it('fails on invalid input', async function () {
        assert.throws(() => {
            NotificationsStateConstructor('' as unknown as NotificationsState)
        })
        assert.throws(() => {
            NotificationsStateConstructor({} as NotificationsState)
        })
        assert.throws(() => {
            NotificationsStateConstructor({
                startUp: {},
                emergency: {},
                dismissed: {}, // x
            } as NotificationsState)
        })
        assert.throws(() => {
            NotificationsStateConstructor({
                startUp: {},
                emergency: '', // x
                dismissed: [],
                newlyReceived: [],
            } as NotificationsState)
        })
        assert.throws(() => {
            NotificationsStateConstructor({
                startUp: '', // x
                emergency: {},
                dismissed: [],
                newlyReceived: [],
            } as NotificationsState)
        })
    })
})
