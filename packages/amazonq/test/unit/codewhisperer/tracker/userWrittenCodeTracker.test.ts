/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { UserWrittenCodeTracker, TelemetryHelper, AuthUtil } from 'aws-core-vscode/codewhisperer'
import { createMockDocument, resetCodeWhispererGlobalVariables } from 'aws-core-vscode/test'

describe('userWrittenCodeTracker', function () {
    describe('isActive()', function () {
        afterEach(async function () {
            await resetCodeWhispererGlobalVariables()
            UserWrittenCodeTracker.instance.reset()
            sinon.restore()
        })

        it('inactive case: telemetryEnable = true, isConnected = false', function () {
            sinon.stub(TelemetryHelper.instance, 'isTelemetryEnabled').returns(true)
            sinon.stub(AuthUtil.instance, 'isConnected').returns(false)
            assert.strictEqual(UserWrittenCodeTracker.instance.isActive(), false)
        })

        it('inactive case: telemetryEnabled = false, isConnected = false', function () {
            sinon.stub(TelemetryHelper.instance, 'isTelemetryEnabled').returns(false)
            sinon.stub(AuthUtil.instance, 'isConnected').returns(false)
            assert.strictEqual(UserWrittenCodeTracker.instance.isActive(), false)
        })

        it('active case: telemetryEnabled = true, isConnected = true', function () {
            sinon.stub(TelemetryHelper.instance, 'isTelemetryEnabled').returns(true)
            sinon.stub(AuthUtil.instance, 'isConnected').returns(true)
            assert.strictEqual(UserWrittenCodeTracker.instance.isActive(), true)
        })
    })

    describe('onDocumentChange', function () {
        let tracker: UserWrittenCodeTracker | undefined

        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
            tracker = UserWrittenCodeTracker.instance
            if (tracker) {
                sinon.stub(tracker, 'isActive').returns(true)
            }
        })

        afterEach(function () {
            sinon.restore()
            UserWrittenCodeTracker.instance.reset()
        })

        it('Should skip when content change size is more than 50', function () {
            if (!tracker) {
                assert.fail()
            }
            tracker.onQFeatureInvoked()
            tracker.onTextDocumentChange({
                reason: undefined,
                document: createMockDocument(),
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 600),
                        rangeOffset: 0,
                        rangeLength: 600,
                        text: 'def twoSum(nums, target):\nfor '.repeat(20),
                    },
                ],
            })
            assert.strictEqual(tracker.getUserWrittenCharacters('python'), 0)
            assert.strictEqual(tracker.getUserWrittenLines('python'), 0)
        })

        it('Should not skip when content change size is less than 50', function () {
            if (!tracker) {
                assert.fail()
            }
            tracker.onQFeatureInvoked()
            tracker.onTextDocumentChange({
                reason: undefined,
                document: createMockDocument(),
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 49),
                        rangeOffset: 0,
                        rangeLength: 49,
                        text: 'a = 123'.repeat(7),
                    },
                ],
            })
            tracker.onTextDocumentChange({
                reason: undefined,
                document: createMockDocument('', 'test.java', 'java'),
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 1, 3),
                        rangeOffset: 0,
                        rangeLength: 11,
                        text: 'a = 123\nbcd',
                    },
                ],
            })
            assert.strictEqual(tracker.getUserWrittenCharacters('python'), 49)
            assert.strictEqual(tracker.getUserWrittenLines('python'), 0)
            assert.strictEqual(tracker.getUserWrittenCharacters('java'), 11)
            assert.strictEqual(tracker.getUserWrittenLines('java'), 1)
            assert.strictEqual(tracker.getUserWrittenLines('cpp'), 0)
        })

        it('Should skip when Q is editing', function () {
            if (!tracker) {
                assert.fail()
            }
            tracker.onQFeatureInvoked()
            tracker.onQStartsMakingEdits()
            tracker.onTextDocumentChange({
                reason: undefined,
                document: createMockDocument(),
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 30),
                        rangeOffset: 0,
                        rangeLength: 30,
                        text: 'def twoSum(nums, target):\nfor',
                    },
                ],
            })
            tracker.onQFinishesEdits()
            tracker.onTextDocumentChange({
                reason: undefined,
                document: createMockDocument(),
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 2),
                        rangeOffset: 0,
                        rangeLength: 2,
                        text: '\na',
                    },
                ],
            })
            assert.strictEqual(tracker.getUserWrittenCharacters('python'), 2)
            assert.strictEqual(tracker.getUserWrittenLines('python'), 1)
        })

        it('Should not reduce tokens when delete', function () {
            if (!tracker) {
                assert.fail()
            }
            const doc = createMockDocument('import math', 'test.py', 'python')

            tracker.onQFeatureInvoked()
            tracker.onTextDocumentChange({
                reason: undefined,
                document: doc,
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 1),
                        rangeOffset: 0,
                        rangeLength: 0,
                        text: 'a',
                    },
                ],
            })
            tracker.onTextDocumentChange({
                reason: undefined,
                document: doc,
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 1),
                        rangeOffset: 0,
                        rangeLength: 0,
                        text: 'b',
                    },
                ],
            })
            assert.strictEqual(tracker.getUserWrittenCharacters('python'), 2)
            tracker.onTextDocumentChange({
                reason: undefined,
                document: doc,
                contentChanges: [
                    {
                        range: new vscode.Range(0, 0, 0, 1),
                        rangeOffset: 1,
                        rangeLength: 1,
                        text: '',
                    },
                ],
            })
            assert.strictEqual(tracker.getUserWrittenCharacters('python'), 2)
        })
    })
})
