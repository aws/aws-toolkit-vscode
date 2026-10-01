/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { WriteQueue } from '../../../../awsService/sagemaker/detached-server/writeQueue'

describe('WriteQueue', function () {
    it('processes a single operation', async function () {
        const queue = new WriteQueue()
        let executed = false

        queue.push(async () => {
            executed = true
        })
        await queue.process()

        assert.strictEqual(executed, true)
    })

    it('processes multiple operations in order', async function () {
        const queue = new WriteQueue()
        const order: number[] = []

        queue.push(async () => {
            order.push(1)
        })
        queue.push(async () => {
            order.push(2)
        })
        queue.push(async () => {
            order.push(3)
        })
        await queue.process()

        assert.deepStrictEqual(order, [1, 2, 3])
    })

    it('does nothing when queue is empty', async function () {
        const queue = new WriteQueue()
        // Should not throw
        await queue.process()
    })

    it('prevents concurrent processing', async function () {
        const queue = new WriteQueue()
        let concurrentCount = 0
        let maxConcurrent = 0

        const createSlowOp = () => async () => {
            concurrentCount++
            maxConcurrent = Math.max(maxConcurrent, concurrentCount)
            await new Promise((resolve) => setTimeout(resolve, 10))
            concurrentCount--
        }

        queue.push(createSlowOp())
        queue.push(createSlowOp())
        queue.push(createSlowOp())

        // Start processing and also try to process again concurrently
        await Promise.all([queue.process(), queue.process()])

        assert.strictEqual(maxConcurrent, 1, 'Only one operation should run at a time')
    })

    it('continues processing remaining items after an error', async function () {
        const queue = new WriteQueue()
        const results: string[] = []

        queue.push(async () => {
            results.push('first')
        })
        queue.push(async () => {
            throw new Error('fail')
        })
        queue.push(async () => {
            results.push('third')
        })

        // The queue processes sequentially; an error in one operation
        // will cause process() to throw, but the item is removed from queue
        await assert.rejects(() => queue.process(), /fail/)

        // The third item should still be in the queue since processing stopped at the error
        // Process again to pick up remaining items
        await queue.process()
        assert.deepStrictEqual(results, ['first', 'third'])
    })
})
