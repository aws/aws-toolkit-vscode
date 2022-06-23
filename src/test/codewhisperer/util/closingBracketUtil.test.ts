/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { hasExtraClosingBracket, handleAutoClosingBrackets } from '../../../codewhisperer/util/closingBracketUtil'
import { resetCodeWhispererGlobalVariables, createMockTextEditor } from '../testUtil'
import { getLogger } from '../../../shared/logger/logger'

describe('onAcceptance', function () {
    describe('handleAutoClosingBrackets', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Should not edit current document if manual trigger', async function () {
            const mockEditor = createMockTextEditor()
            const previousText = mockEditor.document.getText()
            await handleAutoClosingBrackets('OnDemand', mockEditor, '', 1, '(')
            assert.strictEqual(previousText, mockEditor.document.getText())
        })

        it('Should not edit current document if special character in invocation context is not a open bracket', async function () {
            const mockEditor = createMockTextEditor()
            const previousText = mockEditor.document.getText()
            await handleAutoClosingBrackets('AutoTrigger', mockEditor, '', 1, '*')
            assert.strictEqual(previousText, mockEditor.document.getText())
        })

        it('Should not remove a closing bracket if recommendation has same number of closing bracket and open bracket', async function () {
            const mockEditor = createMockTextEditor()
            const previousText = mockEditor.document.getText()
            await handleAutoClosingBrackets('AutoTrigger', mockEditor, "print('Hello')", 1, '(')
            assert.strictEqual(previousText, mockEditor.document.getText())
        })

        it('Should remove one closing bracket at current document if recommendation has 1 closing bracket and 0 open bracket', async function () {
            const mockEditor = createMockTextEditor('import math\ndef four_sum(nums, target):\n')
            const loggerSpy = sinon.spy(getLogger(), 'info')
            await handleAutoClosingBrackets('AutoTrigger', mockEditor, 'var)', 1, '(')
            assert.ok(loggerSpy.called)
            const actual = loggerSpy.getCall(0).args[0]
            assert.strictEqual(actual, `delete [{"line":1,"character":25},{"line":1,"character":26}]`)
        })

        it('Should remove one closing bracket at current document if recommendation has 2 closing bracket and 1 open bracket', async function () {
            const mockEditor = createMockTextEditor('def two_sum(nums, target):\n')
            const loggerSpy = sinon.spy(getLogger(), 'info')
            await handleAutoClosingBrackets('AutoTrigger', mockEditor, "print('Hello'))", 1, '(')
            assert.ok(loggerSpy.called)
            const actual = loggerSpy.getCall(0).args[0]
            assert.strictEqual(actual, `delete [{"line":0,"character":24},{"line":0,"character":25}]`)
        })
    })

    describe('hasExtraClosingBracket', function () {
        it('Should return true when a string has one more closing bracket than open bracket', function () {
            assert.ok(!hasExtraClosingBracket('split(str){}', '{', '}'))
            assert.ok(hasExtraClosingBracket('split(str){}}', '{', '}'))
            assert.ok(hasExtraClosingBracket('split(str){{}}}', '{', '}'))
            assert.ok(hasExtraClosingBracket('split(str)}', '{', '}'))
        })

        it('Should return result relevent to the open bracket in function argument when multiple brackets are present', function () {
            assert.ok(!hasExtraClosingBracket('split(str){}', '(', ')'))
            assert.ok(hasExtraClosingBracket('split(str)){}}', '(', ')'))
        })
    })
})
