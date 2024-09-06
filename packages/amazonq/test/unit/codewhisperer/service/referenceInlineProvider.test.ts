/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { ReferenceInlineProvider } from 'aws-core-vscode/codewhisperer'
import { resetCodeWhispererGlobalVariables } from 'aws-core-vscode/test'

describe('referenceInlineProvider', function () {
    beforeEach(async function () {
        await resetCodeWhispererGlobalVariables()
    })
    describe('setInlineReference', async function () {
        it('Reference codelens message should contain license name and Code Reference Log', function () {
            const referenceInlineProvider = new ReferenceInlineProvider()
            const fakeReferences = [
                {
                    message: '',
                    licenseName: 'TEST_LICENSE',
                    repository: 'TEST_REPO',
                    recommendationContentSpan: {
                        start: 0,
                        end: 10,
                    },
                },
            ]
            referenceInlineProvider.setInlineReference(1, `def two_sum(nums, target):`, fakeReferences)
            assert.ok(referenceInlineProvider.refs[0].includes(`TEST_LICENSE`))
            assert.ok(referenceInlineProvider.refs[0].includes(`Reference Log`))
        })
    })
})
