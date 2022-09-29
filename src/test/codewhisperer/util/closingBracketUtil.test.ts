/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import {
    calculateBracketsLevel,
    getBracketsToRemove,
    removeBracketsFromRightContext,
} from '../../../codewhisperer/util/closingBracketUtil'
import { createMockTextEditor } from '../testUtil'
import { getLogger } from '../../../shared/logger/logger'
import { Position } from 'vscode'

describe('closingBracketUtil', function () {
    describe('calculateBracketsLevel', function () {
        it('Should return expected bracket level with index', function () {
            const actual = calculateBracketsLevel('{{()')
            const expected = [
                {
                    char: '{',
                    count: 1,
                    idx: 0,
                },
                {
                    char: '{',
                    count: 2,
                    idx: 1,
                },
                {
                    char: '(',
                    count: 1,
                    idx: 2,
                },
                {
                    char: '(',
                    count: 0,
                    idx: 3,
                },
            ]
            assert.deepStrictEqual(expected, actual)
        })
    })

    describe('removeBracketsFromRightContext', function () {
        afterEach(function () {
            sinon.restore()
        })
        it('Should remove the brackets from corresponding index', async function () {
            const mockEditor = createMockTextEditor()
            const mockPosition = new Position(0, 0)
            const mockIdx = [0, 1]

            const loggerSpy = sinon.spy(getLogger(), 'info')
            await removeBracketsFromRightContext(mockEditor, mockIdx, mockPosition)
            assert.ok(loggerSpy.called)
            const actual = loggerSpy.getCall(0).args[0]
            assert.strictEqual(actual, `delete [{"line":0,"character":0},{"line":0,"character":1}]`)
        })
    })

    describe('getBracketsToRemove', function () {
        it('Should return an empty array if there is no extra bracket matched', function () {
            const actual = getBracketsToRemove('return a+b}', '')
            assert.ok(actual.length === 0)
        })
        it('Should return expected bracket to remove', function () {
            const actual = getBracketsToRemove('{return a+b}', '}')
            const expected = [0]
            assert.deepStrictEqual(actual, expected)
        })
        it('Should return expected bracket to remove if there are multiple matches', function () {
            const actual = getBracketsToRemove(') {return a+b}', '){}')
            const expected = [0, 1, 2]
            assert.deepStrictEqual(actual, expected)
        })
    })
})
