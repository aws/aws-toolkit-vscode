/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import '../../../shared/utilities/asyncIteratorShim'

import * as assert from 'assert'
import { CloudWatchLogs } from 'aws-sdk'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
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
    updateInPlace,
    getPaginatedAwsCallIter,
    getPaginatedAwsCallIterParams,
    IteratorTransformer,
    stripUndefined,
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

    describe('first', async function () {
        it('returns the first item the sequence is not empty', async function () {
            const result = await first(asyncGenerator(['first']))

            assert.strictEqual(result, 'first')
        })

        it('returns undefined if the sequence is empty', async function () {
            const result = await first(asyncGenerator([]))

            assert.strictEqual(result, undefined)
        })

        it('lazily iterates the sequence', async function () {
            async function* generator(): AsyncIterable<string> {
                yield 'first'
                assert.fail('generator iterated too far')
            }

            const result = await first(generator())

            assert.strictEqual(result, 'first')
        })
    })

    describe('take', async function () {
        it('returns the first <count> items if sequence contains at least that many items', async function () {
            const result = await take(asyncGenerator(['first', 'second', 'third']), 2)

            assert.ok(result)
            assert.strictEqual(result.length, 2)
        })

        it('returns the first <sequence.length> items if sequence contains fewer than <count> items', async function () {
            const result = await take(asyncGenerator(['first', 'second']), 3)

            assert.ok(result)
            assert.strictEqual(result.length, 2)
        })

        it('returns an empty array if sequence is empty', async function () {
            const result = await take(asyncGenerator([]), 1)

            assert.ok(result)
            assert.strictEqual(result.length, 0)
        })

        it('returns an empty array if count is 0', async function () {
            const result = await take(asyncGenerator(['first']), 0)

            assert.ok(result)
            assert.strictEqual(result.length, 0)
        })

        it('lazily iterates the sequence', async function () {
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

    describe('getPaginatedAwsCallIter', async function () {
        it('iterates as long as results are present', async function () {
            const fakeCall = sandbox.stub<
                [CloudWatchLogs.DescribeLogStreamsRequest],
                CloudWatchLogs.DescribeLogStreamsResponse
            >()
            const responses: CloudWatchLogs.LogStreams[] = [
                [{ logStreamName: 'stream1' }, { logStreamName: 'stream2' }, { logStreamName: 'stream3' }],
                [{ logStreamName: 'stream4' }, { logStreamName: 'stream5' }, { logStreamName: 'stream6' }],
                [{ logStreamName: 'stream7' }, { logStreamName: 'stream8' }, { logStreamName: 'stream9' }],
            ]
            fakeCall
                .onCall(0)
                .returns({
                    logStreams: responses[0],
                    nextToken: 'gotAToken',
                })
                .onCall(1)
                .returns({
                    logStreams: responses[1],
                    nextToken: 'gotAnotherToken',
                })
                .onCall(2)
                .returns({
                    logStreams: responses[2],
                })
                .onCall(3)
                .returns({})
            const params: getPaginatedAwsCallIterParams<
                CloudWatchLogs.DescribeLogStreamsRequest,
                CloudWatchLogs.DescribeLogStreamsResponse
            > = {
                awsCall: async req => fakeCall(req),
                nextTokenNames: {
                    request: 'nextToken',
                    response: 'nextToken',
                },
                request: {
                    logGroupName: 'imJustHereSoIWontGetFined',
                },
            }
            const iter: AsyncIterator<CloudWatchLogs.DescribeLogStreamsResponse> = getPaginatedAwsCallIter(params)
            const firstResult = await iter.next()
            const secondResult = await iter.next()
            const thirdResult = await iter.next()
            const fourthResult = await iter.next()
            assert.deepStrictEqual(firstResult.value.logStreams, responses[0])
            assert.deepStrictEqual(secondResult.value.logStreams, responses[1])
            assert.deepStrictEqual(thirdResult.value.logStreams, responses[2])
            assert.deepStrictEqual(fourthResult, { done: true, value: undefined })
        })
    })

    describe('IteratorTransformer', async function () {
        it('transforms values from the iterator and does not carry state over when creating another iterator', async function () {
            const values = ['a', 'b', 'c']
            async function* iteratorFn(): AsyncIterator<string> {
                for (const val of values) {
                    yield val
                }
            }
            const populator = new IteratorTransformer<string, vscode.QuickPickItem>(
                () => iteratorFn(),
                val => {
                    if (val) {
                        return [{ label: val.toUpperCase() }]
                    }

                    return []
                }
            )

            const firstIter = populator.createPickIterator()
            let firstI = 0
            let firstItem = await firstIter.next()
            while (!firstItem.done) {
                assert.ok(Array.isArray(firstItem.value)),
                    assert.strictEqual(firstItem.value.length, 1),
                    assert.deepStrictEqual(firstItem.value[0], { label: values[firstI].toUpperCase() })
                firstI++
                firstItem = await firstIter.next()
            }

            const secondIter = populator.createPickIterator()
            let secondI = 0
            let secondItem = await secondIter.next()
            while (!secondItem.done) {
                assert.ok(Array.isArray(secondItem.value)),
                    assert.strictEqual(secondItem.value.length, 1),
                    assert.deepStrictEqual(secondItem.value[0], { label: values[secondI].toUpperCase() })
                secondI++
                secondItem = await secondIter.next()
            }
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
})
