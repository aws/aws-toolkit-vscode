/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { resetConsolasGlobalVariables } from '../testUtil'
import { ReferenceInlineProvider } from '../../../../vector/consolas/service/referenceInlineProvider'
import { InlineCompletionItem } from '../../../../vector/consolas/models/model'

describe('referenceInlineProvider', function () {
    beforeEach(function () {
        resetConsolasGlobalVariables()
    })
    describe('setInlineReference', async function () {
        it('Reference codelens message should contain license name and consolas reference log', function () {
            const referenceInlineProvider = new ReferenceInlineProvider()
            const item: InlineCompletionItem = {
                content: `def two_sum(nums, target):`,
                index: 0,
            }
            const fakeReferences = [
                {
                    message: '',
                    licenseName: 'TEST_LICENSE',
                    repository: 'http://github.com/fake',
                    contentSpan: {
                        start: 0,
                        end: 10,
                    },
                },
            ]
            referenceInlineProvider.setInlineReference(1, item, fakeReferences)
            assert.ok(referenceInlineProvider.refs[0].includes(`TEST_LICENSE`))
            assert.ok(referenceInlineProvider.refs[0].includes(`reference log`))
        })
    })
})
