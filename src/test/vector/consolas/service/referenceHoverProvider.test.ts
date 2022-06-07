/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { createMockDocument, resetConsolasGlobalVariables } from '../testUtil'
import { ReferenceHoverProvider } from '../../../../vector/consolas/service/referenceHoverProvider'
import { cast } from '../../../../shared/utilities/typeConstructors'

describe('referenceHoverProvider', function () {
    beforeEach(function () {
        resetConsolasGlobalVariables()
    })
    describe('provideHover', async function () {
        it('Should return a hover object that contains license name and repo name when reference code exists in document ', function () {
            const referenceHoverProvider = new ReferenceHoverProvider()
            const mockDocoument = createMockDocument('def two_sum(nums, target):\nfor', 'test.py', 'python')
            referenceHoverProvider.addLicensedCode(`def two_sum(nums, target)`, [
                {
                    message: '',
                    licenseName: 'TEST_LICENSE',
                    repository: 'http://github.com/fake',
                    contentSpan: {
                        start: 0,
                        end: 10,
                    },
                },
            ])
            const token = new vscode.CancellationTokenSource()
            const actual = referenceHoverProvider.provideHover(mockDocoument, new vscode.Position(0, 0), token.token)
            assert.notStrictEqual(actual, undefined)
            const content = cast(actual?.contents[0], String)
            assert.ok(content.includes('TEST_LICENSE'))
            assert.ok(content.includes('http://github.com/fake'))
        })

        it('Should return undefined if reference code does not exist in document', function () {
            const referenceHoverProvider = new ReferenceHoverProvider()
            const mockDocoument = createMockDocument("print('Hello World')\nfor", 'test.py', 'python')
            referenceHoverProvider.addLicensedCode(`def two_sum(nums, target)`, [
                {
                    message: '',
                    licenseName: 'TEST_LICENSE',
                    repository: 'http://github.com/fake',
                    contentSpan: {
                        start: 0,
                        end: 10,
                    },
                },
            ])
            const token = new vscode.CancellationTokenSource()
            const actual = referenceHoverProvider.provideHover(mockDocoument, new vscode.Position(0, 0), token.token)
            assert.strictEqual(actual, undefined)
        })
    })
})
