/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { createMockTextEditor, resetCodeWhispererGlobalVariables } from '../testUtil'
import { ReferenceLogViewProvider } from '../../../codewhisperer/service/referenceLogViewProvider'

describe('referenceLogViewProvider', function () {
    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })
    describe('getReferenceLog', async function () {
        it('Should return expected reference log string', function () {
            const currentTime = new Date()
            const currentTimeString = currentTime.toLocaleString()
            currentTime.setSeconds(currentTime.getSeconds() + 1)
            const nextTimeString = currentTime.toLocaleString()
            const mockEditor = createMockTextEditor()
            const recommendation = `def two_sum(nums, target):`
            const fakeReferences = [
                {
                    message: '',
                    licenseName: 'MIT',
                    repository: 'TEST_REPO',
                    recommendationContentSpan: {
                        start: 0,
                        end: 10,
                    },
                },
            ]
            const actual = ReferenceLogViewProvider.getReferenceLog(recommendation, fakeReferences, mockEditor)
            const actualTime = actual.substring(1, actual.indexOf(']'))
            assert.ok(actualTime === currentTimeString || actualTime === nextTimeString)
            assert.ok(actual.includes('MIT'))
            assert.ok(actual.includes('def two_su'))
        })
    })
})
