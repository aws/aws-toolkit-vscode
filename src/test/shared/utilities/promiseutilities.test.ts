/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { PromiseSharer } from '../../../shared/utilities/promiseUtilities'

describe('PromiseSharer', async () => {
    let eventEmitter: vscode.EventEmitter<void>
    let event: vscode.Event<void>
    let waitForEventCount = 0

    beforeEach(() => {
        eventEmitter = new vscode.EventEmitter<void>()
        event = eventEmitter.event
        waitForEventCount = 0
    })

    afterEach(() => {
        eventEmitter.dispose()
    })

    async function waitForEvent(): Promise<void> {
        waitForEventCount++

        return new Promise<void>(resolve => {
            event(() => {
                resolve()
            })
        })
    }

    it('joins promises', async () => {
        let promisesCompleted: number = 0

        const p1 = PromiseSharer.getExistingPromiseOrCreate('abc', waitForEvent).then(() => {
            promisesCompleted++
        })
        const p2 = PromiseSharer.getExistingPromiseOrCreate('abc', waitForEvent).then(() => {
            promisesCompleted++
        })
        const p3 = PromiseSharer.getExistingPromiseOrCreate('abc', waitForEvent).then(() => {
            promisesCompleted++
        })

        eventEmitter.fire()
        await Promise.all([p1, p2, p3])

        assert.strictEqual(waitForEventCount, 1)
        assert.strictEqual(promisesCompleted, 3)
    })

    it('does not join different promises', async () => {
        let promisesCompleted: number = 0

        const p1 = PromiseSharer.getExistingPromiseOrCreate('abc', waitForEvent).then(() => {
            promisesCompleted++
        })
        const p2 = PromiseSharer.getExistingPromiseOrCreate('def', waitForEvent).then(() => {
            promisesCompleted++
        })
        const p3 = PromiseSharer.getExistingPromiseOrCreate('abc', waitForEvent).then(() => {
            promisesCompleted++
        })

        for (const p of [p1, p2, p3]) {
            eventEmitter.fire()
            await p
        }

        assert.strictEqual(waitForEventCount, 2)
        assert.strictEqual(promisesCompleted, 3)
    })

    it('starts a new promise if previous one completed', async () => {
        const p1 = PromiseSharer.getExistingPromiseOrCreate('abc', waitForEvent)
        eventEmitter.fire()
        await p1

        const p2 = PromiseSharer.getExistingPromiseOrCreate('abc', waitForEvent)
        eventEmitter.fire()
        await p2

        assert.strictEqual(waitForEventCount, 2)
    })
})
