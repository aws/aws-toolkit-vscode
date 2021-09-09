/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import '../../../shared/utilities/asyncIteratorShim'

import * as assert from 'assert'
import * as sinon from 'sinon'
import {
    complement,
    difference,
    filter,
    filterAsync,
    intersection,
    toArrayAsync,
    toMap,
    toMapAsync,
    union,
    updateInPlace,
    stripUndefined,
    toCollection,
    pageableToCollection,
} from '../../../shared/utilities/collectionUtils'

import { asyncGenerator } from '../../utilities/collectionUtils'

describe('CollectionUtils', async function () {
    let sandbox: sinon.SinonSandbox
    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('union', async function () {
        it('returns an empty set if both inputs are empty', async function () {
            const result = union([], [])

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('includes all elements from both inputs', async function () {
            const result = union(['a', 'b'], ['b', 'c'])

            assert.ok(result)
            assert.strictEqual(result.size, 3)
            assert.ok(result.has('a'))
            assert.ok(result.has('b'))
            assert.ok(result.has('c'))
        })
    })

    describe('intersection', async function () {
        it('returns an empty set if both insputs are empty', async function () {
            const result = intersection([], [])

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('returns an empty set if inputs have no elements in common', async function () {
            const result = intersection(['a'], ['b'])

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('returns only elements that are present in both inputs', async function () {
            const result = intersection(['a', 'b'], ['b', 'c'])

            assert.ok(result)
            assert.strictEqual(result.size, 1)
            assert.ok(result.has('b'))
        })
    })

    describe('difference', async function () {
        it('returns an empty set if the first input is empty', async function () {
            const result = difference([], ['a'])

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('returns the elements in the first input if the second input is empty', async function () {
            const result = difference(['a'], [])

            assert.ok(result)
            assert.strictEqual(result.size, 1)
            assert.ok(result.has('a'))
        })

        it('does not return elements that are present in the second input', async function () {
            const result = difference(['a', 'b'], ['b'])

            assert.ok(result)
            assert.strictEqual(result.size, 1)
            assert.ok(result.has('a'))
        })
    })

    describe('complement', async function () {
        it('returns an empty set if the second input is empty', async function () {
            const result = complement(['a'], [])

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('returns the elements in the second input if the first input is empty', async function () {
            const result = complement([], ['a'])

            assert.ok(result)
            assert.strictEqual(result.size, 1)
            assert.ok(result.has('a'))
        })

        it('does not return elements that are present in the first input', async function () {
            const result = complement(['b'], ['a', 'b'])

            assert.ok(result)
            assert.strictEqual(result.size, 1)
            assert.ok(result.has('a'))
        })
    })

    describe('toArrayAsync', async function () {
        it('returns an empty array if input is empty', async function () {
            const result = await toArrayAsync(asyncGenerator([]))

            assert.ok(result)
            assert.strictEqual(result.length, 0)
        })

        it('returns each item in input', async function () {
            const result = await toArrayAsync(asyncGenerator(['a', 'b']))

            assert.ok(result)
            assert.strictEqual(result.length, 2)
            assert.ok(result.find(item => item === 'a'))
            assert.ok(result.find(item => item === 'b'))
        })
    })

    describe('toMap', async function () {
        it('returns an empty map if the input is empty', async function () {
            const result = toMap<string, { key: string }>([], item => item.key)

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('uses selector to choose keys', async function () {
            const result = toMap<string, { key: string }>([{ key: 'a' }, { key: 'b' }, { key: 'c' }], item => item.key)

            assert.ok(result)
            assert.strictEqual(result.size, 3)
            assert.ok(result.has('a'))
            assert.ok(result.has('b'))
            assert.ok(result.has('c'))
        })

        it('throws an error on duplicate keys', async function () {
            assert.throws(() =>
                toMap<string, { key: string }>(
                    [{ key: 'a' }, { key: 'b' }, { key: 'b' }, { key: 'c' }],
                    item => item.key
                )
            )
        })
    })

    describe('toMapAsync', async function () {
        it('returns an empty map if the input is empty', async function () {
            const result = await toMapAsync<string, { key: string }>(asyncGenerator([]), item => item.key)

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('uses selector to choose keys', async function () {
            const result = await toMapAsync(
                asyncGenerator([{ key: 'a' }, { key: 'b' }, { key: 'c' }]),
                item => item.key
            )

            assert.ok(result)
            assert.strictEqual(result.size, 3)
            assert.ok(result.has('a'))
            assert.ok(result.has('b'))
            assert.ok(result.has('c'))
        })

        it('throws an error on duplicate keys', async function () {
            await assert.rejects(
                toMapAsync<string, { key: string }>(
                    asyncGenerator([{ key: 'a' }, { key: 'b' }, { key: 'b' }, { key: 'c' }]),
                    item => item.key
                )
            )
        })
    })

    describe('updateInPlace', async function () {
        it('removes items that are present in the original map, but not the input', async function () {
            const map = new Map<string, number>()
            map.set('a', 1)

            updateInPlace(
                map,
                [],
                key => assert.fail(),
                key => assert.fail()
            )

            assert.ok(map)
            assert.strictEqual(map.size, 0)
        })

        it('updates items that are present in both the original map and the input', async function () {
            const map = new Map<string, number>()
            map.set('a', 1)
            map.set('b', 2)

            updateInPlace(
                map,
                ['b'],
                key => {
                    assert.strictEqual(key, 'b')
                    map.set(key, 42)
                },
                key => assert.fail()
            )

            assert.ok(map)
            assert.strictEqual(map.size, 1)
            assert.strictEqual(map.get('b'), 42)
        })

        it('adds items that are present in the input, but not the original map', async function () {
            const map = new Map<string, number>()

            updateInPlace(
                map,
                ['a'],
                key => assert.fail(),
                key => {
                    assert.strictEqual(key, 'a')

                    return 42
                }
            )

            assert.ok(map)
            assert.strictEqual(map.size, 1)
            assert.strictEqual(map.get('a'), 42)
        })
    })

    describe('filter', async function () {
        it('returns the original sequence filtered by the predicate', async function () {
            const input: Iterable<number> = [1, 2]
            const result = filter(input, i => i % 2 === 0)

            assert.ok(result)
            assert.strictEqual(result.length, 1)
            assert.strictEqual(result[0], 2)
        })
    })

    describe('filterAsync', async function () {
        it('returns the original sequence filtered by the predicate', async function () {
            const result = await toArrayAsync(filterAsync([1, 2], async i => i % 2 === 0))

            assert.ok(result)
            assert.strictEqual(result.length, 1)
            assert.strictEqual(result[0], 2)
        })
    })

    describe('stripUndefined', function () {
        it('removes undefined from objects', function () {
            const obj = {
                prop1: undefined,
                prop2: 0,
                prop3: {
                    prop4: false,
                    prop5: undefined,
                    prop6: { prop7: '' },
                },
            }

            stripUndefined(obj)
            assert.deepStrictEqual(obj, {
                prop2: 0,
                prop3: {
                    prop4: false,
                    prop6: { prop7: '' },
                },
            })
        })
    })

    describe('pageableToCollection', function () {
        const pages: { [page: string]: { data: number[]; next?: string } } = {
            page1: {
                data: [0, 1, 2],
                next: 'page2',
            },
            page2: {
                data: [3, 4],
                next: 'page3',
            },
            page3: {
                data: [5],
                next: 'page4',
            },
            page4: {
                data: [],
            },
            secretPage: {
                data: [-1],
            },
            falsePage: {
                data: [],
                next: '', // some APIs will return empty strings rather than undefined
            },
        }

        const requester = async (request: { next?: string }) => pages[request.next ?? 'page1']

        it('creates a new AsyncCollection', async function () {
            const collection = pageableToCollection(requester, {}, 'next', 'data')
            assert.deepStrictEqual(await collection.promise(), [[0, 1, 2], [3, 4], [5], []])
        })

        it('uses initial request', async function () {
            const collection = pageableToCollection(requester, { next: 'secretPage' }, 'next', 'data')
            assert.deepStrictEqual(await collection.promise(), [[-1]])
        })

        it('terminates when `next` is an empty string', async function () {
            const collection = pageableToCollection(requester, { next: 'falsePage' }, 'next', 'data')
            assert.deepStrictEqual(await collection.promise(), [[]])
        })
    })

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
                while (true) {
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
})
