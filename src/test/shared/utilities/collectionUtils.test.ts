/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { CloudWatchLogs } from 'aws-sdk'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { AsyncCollection } from '../../../shared/utilities/asyncCollection'
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
    pageableToCollection,
    join,
    toStream,
    joinAll,
    isPresent,
} from '../../../shared/utilities/collectionUtils'

import { asyncGenerator } from '../../../shared/utilities/collectionUtils'

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

        async function last<T>(iterable: AsyncCollection<T>): Promise<T | undefined> {
            const iterator = iterable.iterator()
            while (true) {
                const { value, done } = await iterator.next()
                if (done) {
                    if (value === undefined) {
                        break
                    }
                    return value
                }
            }
        }

        describe('last', function () {
            it('it persists last element when mapped', async function () {
                const collection = pageableToCollection(requester, {}, 'next', 'data')
                const mapped = collection.map(i => i[0] ?? -1)
                assert.strictEqual(await last(mapped), -1)
            })
        })
    })

    const promise = <T>(val: T) => new Promise<T>(resolve => setImmediate(() => resolve(val)))
    const cons = <T, U>(arr: Promise<T>[], next: U) => {
        if (arr.length === 0) {
            return [promise(next)]
        } else {
            return [...arr, arr[arr.length - 1].then(() => promise(next))]
        }
    }
    const toPromiseChain = <T>(arr: T[]) => arr.reduce(cons, [] as Promise<T>[])

    async function iterateAll<T>(iterable: AsyncIterable<T>) {
        const result = [] as (T | Error)[]
        try {
            for await (const val of iterable) {
                result.push(val)
            }
        } catch (err) {
            assert.ok(err instanceof Error)
            result.push(err)
        }

        return result
    }

    describe('toStream', function () {
        it('yields values that resolve first regardless of order', async function () {
            const values = toPromiseChain([0, 1, 2, 3])
            const stream = toStream(values.reverse())

            assert.deepStrictEqual(await iterateAll(stream), [0, 1, 2, 3])
        })

        it('immediately yields values that are not promises', async function () {
            const stream = toStream([0, promise(1), 2, promise(3)])

            assert.deepStrictEqual(await iterateAll(stream), [0, 2, 1, 3])
        })

        it('throws on any error', async function () {
            const values = toPromiseChain([0, 1, 2, 3])
            const err = new Error()
            const rejected = values[0].then(() => Promise.reject(err))
            const stream = toStream([...values, rejected])

            assert.deepStrictEqual(await iterateAll(stream), [0, err])
        })
    })

    describe('join', function () {
        async function* toAsyncIterable<T>(iterable: Iterable<T | Promise<T>>, returnValue?: T) {
            for await (const val of iterable) {
                yield val
            }

            return returnValue
        }

        interface TestCase<T> {
            readonly data: T[]
            readonly left: number[]
            readonly right: number[]
            readonly expected?: T[]
        }

        async function run<T>(testCase: TestCase<T>) {
            const expected = testCase.expected ?? testCase.data
            const arr = toPromiseChain(testCase.data)
            const left = toAsyncIterable(testCase.left.map(i => arr[i]))
            const right = toAsyncIterable(testCase.right.map(i => arr[i]))

            assert.deepStrictEqual(await iterateAll(join(left, right)), expected)
        }

        const cases: Record<string, TestCase<number>> = {
            'empty left': { data: [0], left: [0], right: [] },
            'empty right': { data: [0], left: [], right: [0] },
            'even split': { data: [0, 1], left: [0], right: [1] },
            'even split reversed': { data: [0, 1], left: [1], right: [0] },
            'empty left 2': { data: [0, 1], left: [0, 1], right: [] },
            'empty right 2': { data: [0, 1], left: [], right: [0, 1] },
            'uneven split': { data: [0, 1, 2], left: [0], right: [1, 2] },
            'uneven split 2': { data: [0, 1, 2], left: [1], right: [0, 2] },
            'uneven split 3': { data: [0, 1, 2], left: [2], right: [0, 1] },
            'out-of-order': { data: [0, 1, 2], left: [1], right: [2, 0], expected: [1, 2, 0] },
            'out-of-order 2': { data: [0, 1, 2], left: [2], right: [1, 0], expected: [1, 0, 2] },
        }

        describe('resolves two async iterables simultaneously', function () {
            for (const [name, testCase] of Object.entries(cases)) {
                it(name, () => run(testCase))
            }
        })

        it('throws if an iterable fails', async function () {
            const err = new Error()
            const arr = toPromiseChain([0, 1, 2, 3])
            const rejected = arr[2].then(() => Promise.reject(err))
            const left = toAsyncIterable([arr[0], arr[2]])
            const right = toAsyncIterable([arr[1], rejected, arr[3]])

            assert.deepStrictEqual(await iterateAll(join(left, right)), [0, 1, 2, err])
        })

        it('returns values returned by the iterables', async function () {
            const expected = [0, 1, 2, 3]
            const arr = toPromiseChain(expected)
            const left = toAsyncIterable([arr[1]], 4)
            const right = toAsyncIterable([arr[0], arr[2], arr[3]], 5)

            assert.deepStrictEqual(await iterateAll(join(left, right)), expected)
        })

        describe('joinAll', function () {
            it('resolves an async iterable of async iterables', async function () {
                const data = [[0, 1], [2], [3, 4, 5]]
                const expected = [0, 2, 3, 1, 4, 5]
                const iterables = data.map(toPromiseChain).map(arr => toAsyncIterable(arr))
                const iterable = joinAll(toAsyncIterable(iterables))
                assert.deepStrictEqual(await iterateAll(iterable), expected)
            })
        })
    })

    describe('isPresent', function () {
        it('returns true for non undefined values', function () {
            assert.strictEqual(isPresent<string>(`value`), true)
        })
        it('returns false for undefined', function () {
            assert.strictEqual(isPresent<string>(undefined), false)
        })
    })
})
