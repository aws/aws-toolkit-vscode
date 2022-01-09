/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { toCollection } from '../../../shared/utilities/asyncCollection'

describe('AsyncCollection', function () {
    const items = [
        { name: 'item1', data: 0 },
        { name: 'item2', data: 1 },
        { name: 'item3', data: 2 },
    ]

    async function* gen() {
        yield 0
        yield 1
        yield 2
    }

    async function* genPage() {
        yield [0, 1, 2]
        yield [3, 4, 5]
        yield [6, 7, 8]
    }

    async function* genItem() {
        yield items[0]
        yield items[1]
        yield items[2]
    }

    it('can be iterated over', async function () {
        const collection = toCollection(gen)
        const expected = [0, 1, 2]
        for await (const o of collection) {
            assert.strictEqual(o, expected.shift())
        }
    })

    it('can turn into a Promise', async function () {
        const promise = toCollection(gen).promise()
        assert.deepStrictEqual(await promise, [0, 1, 2])
    })

    it('can turn into a map using property key', async function () {
        const map = await toCollection(genItem).toMap('name')
        items.forEach(v => assert.strictEqual(map.get(v.name), v))
    })

    it('can turn into a map using function', async function () {
        const map = await toCollection(genItem).toMap(i => i.data.toString())
        items.forEach(v => assert.strictEqual(map.get(v.data.toString()), v))
    })

    it('can map', async function () {
        const mapped = toCollection(gen)
            .map(o => o + 1)
            .map(o => o.toString())
            .map(s => `${s}!`)
        assert.deepStrictEqual(await mapped.promise(), ['1!', '2!', '3!'])
    })

    it('can flatten', async function () {
        const flat = toCollection(genPage).flatten()
        const expected = Array(9)
            .fill(0)
            .map((_, i) => i)
        assert.deepStrictEqual(await flat.promise(), expected)
    })

    it('can filter', async function () {
        const filtered = toCollection(genPage)
            .filter(o => o.includes(5))
            .flatten()
        const expected = [3, 4, 5]
        assert.deepStrictEqual(await filtered.promise(), expected)
    })

    it('can take', async function () {
        const take = toCollection(gen).take(2)
        assert.deepStrictEqual(await take.promise(), [0, 1])
    })

    it('returns nothing if using non-positive count', async function () {
        const takeZero = toCollection(gen).take(0)
        const takeNeg1 = toCollection(gen).take(-1)
        assert.deepStrictEqual(await takeZero.promise(), [])
        assert.deepStrictEqual(await takeNeg1.promise(), [])
    })

    it('is immutable', async function () {
        const x = toCollection(gen)
        const y = x.map(o => o + 1)
        const z = y
            .filter(o => o !== 1)
            .map(o => [o, o])
            .flatten()

        assert.deepStrictEqual(await x.promise(), [0, 1, 2])
        assert.deepStrictEqual(await y.promise(), [1, 2, 3])
        assert.deepStrictEqual(await z.promise(), [2, 2, 3, 3])
    })

    it('does not iterate over the generator when applying transformations', async function () {
        let callCount = 0
        async function* count() {
            while (callCount < 1000) {
                yield callCount++
            }
        }

        const x = toCollection(count)
            .filter(o => o > 1)
            .map(o => [o, o * o])
            .flatten()
        await new Promise(r => setImmediate(r))
        assert.strictEqual(callCount, 0)
        assert.deepStrictEqual(await x.take(6).promise(), [2, 4, 3, 9, 4, 16])
        assert.strictEqual(callCount, 6)
    })

    describe('errors', function () {
        async function* error() {
            throw new Error()
            yield 0
        }

        it('bubbles errors up when using a promise', async function () {
            const errorPromise = toCollection(error)
                .map(o => o)
                .filter(_ => true)
                .flatten()
                .promise()
            await assert.rejects(errorPromise)
        })

        it('bubbles errors up when iterating', async function () {
            const errorIter = toCollection(error)
                .map(o => o)
                .filter(_ => true)
                .flatten()
            const iterate = async () => {
                for await (const _ of errorIter) {
                }
            }
            await assert.rejects(iterate)
        })
    })
})
