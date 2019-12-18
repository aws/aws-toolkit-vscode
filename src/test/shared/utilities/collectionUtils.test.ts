/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import '../../../shared/utilities/asyncIteratorShim'

import * as assert from 'assert'
import {
    complement,
    difference,
    filter,
    filterAsync,
    first,
    intersection,
    take,
    toArrayAsync,
    toMap,
    toMapAsync,
    union,
    updateInPlace
} from '../../../shared/utilities/collectionUtils'

import { asyncGenerator } from '../../utilities/collectionUtils'

describe('CollectionUtils', async () => {
    describe('union', async () => {
        it('returns an empty set if both inputs are empty', async () => {
            const result = union([], [])

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('includes all elements from both inputs', async () => {
            const result = union(['a', 'b'], ['b', 'c'])

            assert.ok(result)
            assert.strictEqual(result.size, 3)
            assert.ok(result.has('a'))
            assert.ok(result.has('b'))
            assert.ok(result.has('c'))
        })
    })

    describe('intersection', async () => {
        it('returns an empty set if both insputs are empty', async () => {
            const result = intersection([], [])

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('returns an empty set if inputs have no elements in common', async () => {
            const result = intersection(['a'], ['b'])

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('returns only elements that are present in both inputs', async () => {
            const result = intersection(['a', 'b'], ['b', 'c'])

            assert.ok(result)
            assert.strictEqual(result.size, 1)
            assert.ok(result.has('b'))
        })
    })

    describe('difference', async () => {
        it('returns an empty set if the first input is empty', async () => {
            const result = difference([], ['a'])

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('returns the elements in the first input if the second input is empty', async () => {
            const result = difference(['a'], [])

            assert.ok(result)
            assert.strictEqual(result.size, 1)
            assert.ok(result.has('a'))
        })

        it('does not return elements that are present in the second input', async () => {
            const result = difference(['a', 'b'], ['b'])

            assert.ok(result)
            assert.strictEqual(result.size, 1)
            assert.ok(result.has('a'))
        })
    })

    describe('complement', async () => {
        it('returns an empty set if the second input is empty', async () => {
            const result = complement(['a'], [])

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('returns the elements in the second input if the first input is empty', async () => {
            const result = complement([], ['a'])

            assert.ok(result)
            assert.strictEqual(result.size, 1)
            assert.ok(result.has('a'))
        })

        it('does not return elements that are present in the first input', async () => {
            const result = complement(['b'], ['a', 'b'])

            assert.ok(result)
            assert.strictEqual(result.size, 1)
            assert.ok(result.has('a'))
        })
    })

    describe('toArrayAsync', async () => {
        it('returns an empty array if input is empty', async () => {
            const result = await toArrayAsync(asyncGenerator([]))

            assert.ok(result)
            assert.strictEqual(result.length, 0)
        })

        it('returns each item in input', async () => {
            const result = await toArrayAsync(asyncGenerator(['a', 'b']))

            assert.ok(result)
            assert.strictEqual(result.length, 2)
            assert.ok(result.find(item => item === 'a'))
            assert.ok(result.find(item => item === 'b'))
        })
    })

    describe('toMap', async () => {
        it('returns an empty map if the input is empty', async () => {
            const result = toMap<string, { key: string }>([], item => item.key)

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('uses selector to choose keys', async () => {
            const result = toMap<string, { key: string }>([{ key: 'a' }, { key: 'b' }, { key: 'c' }], item => item.key)

            assert.ok(result)
            assert.strictEqual(result.size, 3)
            assert.ok(result.has('a'))
            assert.ok(result.has('b'))
            assert.ok(result.has('c'))
        })

        it('throws an error on duplicate keys', async () => {
            assert.throws(() =>
                toMap<string, { key: string }>(
                    [{ key: 'a' }, { key: 'b' }, { key: 'b' }, { key: 'c' }],
                    item => item.key
                )
            )
        })
    })

    describe('toMapAsync', async () => {
        it('returns an empty map if the input is empty', async () => {
            const result = await toMapAsync<string, { key: string }>(asyncGenerator([]), item => item.key)

            assert.ok(result)
            assert.strictEqual(result.size, 0)
        })

        it('uses selector to choose keys', async () => {
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

        it('throws an error on duplicate keys', async () => {
            // TODO: Why is assert.rejects not found at runtime?
            async function assertRejects(action: () => Promise<any>) {
                let threw: boolean = false
                try {
                    await action()
                } catch (err) {
                    threw = true
                } finally {
                    // Use assert.throws here instead of assert.ok(threw) for a more appropriate error message.
                    assert.throws(() => {
                        if (threw) {
                            throw new Error()
                        }
                    })
                }
            }

            // tslint:disable-next-line:no-floating-promises
            await assertRejects(async () => {
                await toMapAsync<string, { key: string }>(
                    asyncGenerator([{ key: 'a' }, { key: 'b' }, { key: 'b' }, { key: 'c' }]),
                    item => item.key
                )
            })
        })
    })

    describe('updateInPlace', async () => {
        it('removes items that are present in the original map, but not the input', async () => {
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

        it('updates items that are present in both the original map and the input', async () => {
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

        it('adds items that are present in the input, but not the original map', async () => {
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

    describe('first', async () => {
        it('returns the first item the sequence is not empty', async () => {
            const result = await first(asyncGenerator(['first']))

            assert.strictEqual(result, 'first')
        })

        it('returns undefined if the sequence is empty', async () => {
            const result = await first(asyncGenerator([]))

            assert.strictEqual(result, undefined)
        })

        it('lazily iterates the sequence', async () => {
            async function* generator(): AsyncIterable<string> {
                yield 'first'
                assert.fail('generator iterated too far')
            }

            const result = await first(generator())

            assert.strictEqual(result, 'first')
        })
    })

    describe('take', async () => {
        it('returns the first <count> items if sequence contains at least that many items', async () => {
            const result = await take(asyncGenerator(['first', 'second', 'third']), 2)

            assert.ok(result)
            assert.strictEqual(result.length, 2)
        })

        it('returns the first <sequence.length> items if sequence contains fewer than <count> items', async () => {
            const result = await take(asyncGenerator(['first', 'second']), 3)

            assert.ok(result)
            assert.strictEqual(result.length, 2)
        })

        it('returns an empty array if sequence is empty', async () => {
            const result = await take(asyncGenerator([]), 1)

            assert.ok(result)
            assert.strictEqual(result.length, 0)
        })

        it('returns an empty array if count is 0', async () => {
            const result = await take(asyncGenerator(['first']), 0)

            assert.ok(result)
            assert.strictEqual(result.length, 0)
        })

        it('lazily iterates the sequence', async () => {
            async function* generator(): AsyncIterable<string> {
                yield 'first'
                yield 'second'
                assert.fail('generator iterated too far')
            }

            const result = await take(generator(), 2)

            assert.ok(result)
            assert.strictEqual(result.length, 2)
        })
    })

    describe('filter', async () => {
        it('returns the original sequence filtered by the predicate', async () => {
            const input: Iterable<number> = [1, 2]
            const result = filter(input, i => i % 2 === 0)

            assert.ok(result)
            assert.strictEqual(result.length, 1)
            assert.strictEqual(result[0], 2)
        })
    })

    describe('filterAsync', async () => {
        it('returns the original sequence filtered by the predicate', async () => {
            const result = await toArrayAsync(filterAsync([1, 2], async i => i % 2 === 0))

            assert.ok(result)
            assert.strictEqual(result.length, 1)
            assert.strictEqual(result[0], 2)
        })
    })
})
