/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Repository } from '../../../types/git'
import { getEmailHash, getTagsAndLabels, makeLabelsString } from '../../mde/mdeModel'

describe('mdeModel', async function () {
    describe('getEmailHash', async function () {
        it('returns undefined if no email is found', async function () {
            assert.strictEqual(
                await getEmailHash({
                    getConfig: async (repo?: Repository) => {
                        return {}
                    },
                }),
                undefined
            )
        })

        it('returns a hashed email', async function () {
            assert.strictEqual(
                await getEmailHash({
                    getConfig: async (repo?: Repository) => {
                        return { 'user.email': 'hashSlingingSlasher@asdf.com' }
                    },
                }),
                'ed2edc6bcfa2d82a9b6555203a6e98b456e8be433ebfed0e8e787b23cd4e1369'
            )
        })
    })
})

describe('getTagsAndLabels', function () {
    it('returns tags and labels', function () {
        const out = getTagsAndLabels({
            tags: {
                tagA: 'val1',
                tagB: 'val2',
                labelA: '',
                labelB: '',
                tagC: 'val3',
                labelC: '',
            },
        })

        assert.deepStrictEqual(out.tags, { tagA: 'val1', tagB: 'val2', tagC: 'val3' })
        assert.deepStrictEqual(out.labels.sort(), ['labelA', 'labelB', 'labelC'])
    })

    it('returns no tags and an empty array for labels', function () {
        const out = getTagsAndLabels({ tags: {} })

        assert.deepStrictEqual(out.tags, {})
        assert.deepStrictEqual(out.labels, [])
    })
})

describe('makeLabelsString', function () {
    it('makes and alphabetizes a label string', function () {
        const str = makeLabelsString({
            tags: {
                tagA: 'val1',
                tagB: 'val2',
                labelC: '',
                labelA: '',
                tagC: 'val3',
                labelB: '',
            },
        })

        assert.strictEqual(str, 'labelA | labelB | labelC')
    })

    it('returns a blank str if no labels are present', function () {
        const str = makeLabelsString({ tags: {} })

        assert.strictEqual(str, '')
    })
})
