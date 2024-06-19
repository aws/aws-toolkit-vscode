/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
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

    async function* returnGen() {
        yield 0
        yield 1
        return 2
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

    it('can flatten generators that return things', async function () {
        const collection = toCollection(async function* () {
            yield await toCollection(returnGen).promise()
            yield await toCollection(returnGen)
                .map(i => i + 1)
                .promise()
            return await toCollection(returnGen)
                .map(i => i + 2)
                .promise()
        })

        const flat = collection.flatten().map(i => i * 2)
        const expected = 0 + 2 + 4 + (2 + 4 + 6) + (4 + 6 + 8) // Writing it all out for readability
        const actual = (await flat.promise()).reduce((a, b) => a + b, 0)
        assert.deepStrictEqual(actual, expected)
    })

    it('can flatten generators that yield async iterables', async function () {
        const collection = toCollection(async function* () {
            yield toCollection(gen).filter(i => i > 1)
            yield toCollection(gen).map(i => i + 1)
        })

        const flat = collection.flatten().map(i => i * 2)
        const actual = (await flat.promise()).reduce((a, b) => a + b, 0)
        assert.deepStrictEqual(actual, 4 + (2 + 4 + 6))
    })

    it('can filter', async function () {
        const filtered = toCollection(genPage)
            .filter(o => o.includes(5))
            .flatten()
        const expected = [3, 4, 5]
        assert.deepStrictEqual(await filtered.promise(), expected)
    })

    it('can limit', async function () {
        const limited = toCollection(gen).limit(2)
        assert.deepStrictEqual(await limited.promise(), [0, 1])
    })

    it('can find a matching element', async function () {
        assert.deepStrictEqual(await toCollection(gen).find(x => x > 0), 1)
        assert.deepStrictEqual(await toCollection(gen).find(x => x > 2), undefined)
    })

    it('returns nothing if using non-positive limit count', async function () {
        const limitZero = toCollection(gen).limit(0)
        const limitNeg1 = toCollection(gen).limit(-1)
        assert.deepStrictEqual(await limitZero.promise(), [])
        assert.deepStrictEqual(await limitNeg1.promise(), [])
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

    it('can map with async functions', async function () {
        const double = async (n: number) => 2 * n

        const mapped = toCollection(gen)
            .map(o => o + 1)
            .map(double)
            .map(o => o - 1)
            .map(double)
            .map(o => `${o}!`)

        assert.deepStrictEqual(await mapped.promise(), ['2!', '6!', '10!'])
    })

    function defineProperty<T, U, K extends PropertyKey>(
        obj: T,
        key: K,
        desc: TypedPropertyDescriptor<U>
    ): T & { [P in K]: U } {
        return Object.defineProperty(obj, key, desc) as T & { [P in K]: U }
    }

    function createCounter(maxCalls = 1000) {
        let callCount = 0

        return defineProperty(
            async function* () {
                while (callCount < maxCalls) {
                    yield callCount++
                }
            },
            'callCount',
            { get: () => callCount }
        )
    }

    it('does not iterate over the generator when applying transformations', async function () {
        const counter = createCounter()
        const x = toCollection(counter)
            .filter(o => o > 1)
            .map(o => [o, o * o])
            .flatten()

        await new Promise(r => setImmediate(r))
        assert.strictEqual(counter.callCount, 0)
        assert.deepStrictEqual(await x.limit(6).promise(), [2, 4, 3, 9, 4, 16])
        assert.strictEqual(counter.callCount, 6)
    })

    it('does not iterate over the generator after finding a match', async function () {
        const counter = createCounter()
        const x = await toCollection(counter)
            .filter(o => o > 1)
            .map(o => [o, o * o])
            .find(o => o[1] > 25)

        assert.deepStrictEqual(x, [6, 36])
        assert.strictEqual(counter.callCount, 7)
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
