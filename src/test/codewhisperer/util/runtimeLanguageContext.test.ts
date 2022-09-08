/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { resetCodeWhispererGlobalVariables } from '../testUtil'
import { RuntimeLanguageContext } from '../../../codewhisperer/util/runtimeLanguageContext'

describe('runtimeLanguageContext', function () {
    const languageContext = new RuntimeLanguageContext()

    describe('convertLanguage', function () {
        const cases: [languageId: string | undefined, expected: string][] = [
            [undefined, 'plaintext'],
            ['typescript', 'javascript'],
            ['jsx', 'jsx'],
            ['go', 'go'],
            ['java', 'java'],
            ['javascript', 'javascript'],
            ['python', 'python'],
            ['c', 'c'],
            ['COBOL', 'COBOL'],
        ]

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
        })

        for (const [languageId, expected] of cases) {
            it(`should return ${expected} if languageId is ${languageId}`, function () {
                const actual = languageContext.convertLanguage(languageId)
                assert.strictEqual(actual, expected)
            })
        }
    })
})
