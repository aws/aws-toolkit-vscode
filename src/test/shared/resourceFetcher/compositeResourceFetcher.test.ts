/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CompositeResourceFetcher } from '../../../shared/resourcefetcher/compositeResourceFetcher'

describe('CompositeResourceFetcher', async () => {
    const expectedContents = 'Hello World!\n12345'

    it('loads from a resource fetcher', async () => {
        const fetcher = {
            get: async () => expectedContents
        }

        const sut = new CompositeResourceFetcher(fetcher)

        const contents = await sut.get()
        assert.strictEqual(contents, expectedContents)
    })

    it('loads from the first resource fetcher to return contents', async () => {
        const fetcher1 = {
            get: async () => undefined
        }

        const fetcher2 = {
            get: async () => expectedContents
        }

        const fetcher3 = {
            get: async () => {
                assert.fail('This should never be called')
            }
        }

        const sut = new CompositeResourceFetcher(fetcher1, fetcher2, fetcher3)

        const contents = await sut.get()
        assert.strictEqual(contents, expectedContents)
    })

    it('tries to load from the next resource fetcher when one raises an error', async () => {
        const fetcher1 = {
            get: async () => {
                assert.fail('Error, load from the next fetcher')
            }
        }

        const fetcher2 = {
            get: async () => expectedContents
        }

        const sut = new CompositeResourceFetcher(fetcher1, fetcher2)

        const contents = await sut.get()
        assert.strictEqual(contents, expectedContents)
    })

    it('returns undefined if no resource fetcher returns contents', async () => {
        let timesCalled = 0
        const fetcher = {
            get: async () => {
                timesCalled++

                return undefined
            }
        }

        const sut = new CompositeResourceFetcher(fetcher, fetcher)

        const contents = await sut.get()
        assert.strictEqual(contents, undefined)
        assert.strictEqual(timesCalled, 2, 'fetcher was not called the expected amount of times')
    })
})
