/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { PromiseSharer } from '../../../shared/utilities/promiseUtilities'

// TODO : Sleeps are unstable and slow down test execution. We should manually resolve the promises, and phase sleep out
async function sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(resolve, ms)
    })
}

describe('PromiseSharer', async () => {
    it('joins promises', async () => {
        let timesCalled: number = 0
        let promisesCompleted: number = 0

        const doThing = async () => {
            await sleep(150)
            timesCalled++
        }

        const p1 = PromiseSharer.getExistingPromiseOrCreate('abc', doThing).then(() => {
            promisesCompleted++
        })
        const p2 = PromiseSharer.getExistingPromiseOrCreate('abc', doThing).then(() => {
            promisesCompleted++
        })
        const p3 = PromiseSharer.getExistingPromiseOrCreate('abc', doThing).then(() => {
            promisesCompleted++
        })

        await p1
        await p2
        await p3

        assert.strictEqual(timesCalled, 1)
        assert.strictEqual(promisesCompleted, 3)
    })

    it('does not join different promises', async () => {
        let timesCalled: number = 0
        let promisesCompleted: number = 0

        const doThing = async () => {
            await sleep(150)
            timesCalled++
        }

        const p1 = PromiseSharer.getExistingPromiseOrCreate('abc', doThing).then(() => {
            promisesCompleted++
        })
        const p2 = PromiseSharer.getExistingPromiseOrCreate('def', doThing).then(() => {
            promisesCompleted++
        })
        const p3 = PromiseSharer.getExistingPromiseOrCreate('abc', doThing).then(() => {
            promisesCompleted++
        })

        await p1
        await p2
        await p3

        assert.strictEqual(timesCalled, 2)
        assert.strictEqual(promisesCompleted, 3)
    })

    it('starts a new promise if previous one completed', async () => {
        let timesCalled: number = 0

        const doThing = async () => {
            await sleep(75)
            timesCalled++
        }

        await PromiseSharer.getExistingPromiseOrCreate('abc', doThing)
        await PromiseSharer.getExistingPromiseOrCreate('abc', doThing)

        assert.strictEqual(timesCalled, 2)
    })
})
