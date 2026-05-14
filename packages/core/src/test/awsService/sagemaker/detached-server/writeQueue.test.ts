/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { WriteQueue } from '../../../../awsService/sagemaker/detached-server/writeQueue'

describe('WriteQueue', function () {
    it('processes operations sequentially', async function () {
        const queue = new WriteQueue()
        const order: number[] = []

        queue.push(async () => {
            await new Promise((r) => setTimeout(r, 10))
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

    it('concurrent process() calls do not duplicate work', async function () {
        const queue = new WriteQueue()
        let count = 0

        queue.push(async () => {
            await new Promise((r) => setTimeout(r, 10))
            count++
        })

        // Call process twice simultaneously
        await Promise.all([queue.process(), queue.process()])

        assert.strictEqual(count, 1)
    })

    it('can enqueue after previous batch completes', async function () {
        const queue = new WriteQueue()
        const results: string[] = []

        queue.push(async () => {
            results.push('first')
        })
        await queue.process()

        queue.push(async () => {
            results.push('second')
        })
        await queue.process()

        assert.deepStrictEqual(results, ['first', 'second'])
    })
})
