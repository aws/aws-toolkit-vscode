/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { assertTelemetryCurried } from '../../testUtil'
import { resetCodeWhispererGlobalVariables } from '../testUtil'
import { TelemetryHelper } from '../../../codewhisperer/util/telemetryHelper'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import { CodeWhispererUserGroupSettings } from '../../../codewhisperer/util/userGroupUtil'
import {
    CodewhispererCompletionType,
    CodewhispererServiceInvocation,
    CodewhispererSuggestionState,
    CodewhispererUserDecision,
} from '../../../shared/telemetry/telemetry.gen'

import { CompletionRecommendation } from '../../../codewhisperer/models/model'
import { session } from '../../../codewhisperer/util/codeWhispererSession'

// TODO: improve and move the following test utils to codewhisperer/testUtils.ts
function aUserDecision(
    completionType: CodewhispererCompletionType,
    codewhispererSuggestionIndex: number,
    codewhispererSuggestionState: CodewhispererSuggestionState
): CodewhispererUserDecision {
    return {
        codewhispererCompletionType: completionType,
        codewhispererLanguage: 'python',
        codewhispererRequestId: 'aFakeRequestId',
        codewhispererSessionId: 'aFakeSessionId',
        codewhispererSuggestionIndex: codewhispererSuggestionIndex,
        codewhispererSuggestionReferenceCount: 0,
        codewhispererSuggestionState: codewhispererSuggestionState,
        codewhispererTriggerType: 'OnDemand',
        credentialStartUrl: 'https://www.amazon.com',
        codewhispererUserGroup: 'Control',
    }
}

function aServiceInvocation(): CodewhispererServiceInvocation {
    return {
        codewhispererCursorOffset: 0,
        codewhispererLanguage: 'python',
        codewhispererLineNumber: 0,
        codewhispererRequestId: 'aFakeRequestId',
        codewhispererTriggerType: 'OnDemand',
        codewhispererUserGroup: 'Control',
    }
}

function aCompletion(
    content: string = 'aFakeContent',
    suggestionState: CodewhispererSuggestionState | 'Showed' | undefined = undefined
): CompletionRecommendation {
    return new CompletionRecommendation(
        {
            content: content,
        },
        suggestionState
    )
}

describe('telemetryHelper', function () {
    describe('aggregateUserDecisionByRequest', function () {
        let sut: TelemetryHelper

        beforeEach(function () {
            sut = new TelemetryHelper()
        })

        it('should return Line and Accept', function () {
            const decisions: CodewhispererUserDecision[] = [
                aUserDecision('Line', 0, 'Accept'),
                aUserDecision('Line', 1, 'Discard'),
                aUserDecision('Block', 2, 'Ignore'),
                aUserDecision('Block', 3, 'Ignore'),
            ]

            const actual = sut.aggregateUserDecisionByRequest(decisions, 'aFakeRequestId', 'aFakeSessionId')
            assert.ok(actual)
            assert.strictEqual(actual?.codewhispererCompletionType, 'Line')
            assert.strictEqual(actual?.codewhispererSuggestionState, 'Accept')
        })

        it('should return Line and Reject', function () {
            const decisions: CodewhispererUserDecision[] = [
                aUserDecision('Line', 0, 'Discard'),
                aUserDecision('Line', 1, 'Reject'),
                aUserDecision('Line', 2, 'Unseen'),
                aUserDecision('Line', 3, 'Unseen'),
            ]

            const actual = sut.aggregateUserDecisionByRequest(decisions, 'aFakeRequestId', 'aFakeSessionId')
            assert.ok(actual)
            assert.strictEqual(actual?.codewhispererCompletionType, 'Line')
            assert.strictEqual(actual?.codewhispererSuggestionState, 'Reject')
        })

        it('should return Block and Accept', function () {
            const decisions: CodewhispererUserDecision[] = [
                aUserDecision('Block', 0, 'Discard'),
                aUserDecision('Block', 1, 'Accept'),
                aUserDecision('Block', 2, 'Discard'),
                aUserDecision('Block', 3, 'Ignore'),
            ]

            const actual = sut.aggregateUserDecisionByRequest(decisions, 'aFakeRequestId', 'aFakeSessionId')
            assert.ok(actual)
            assert.strictEqual(actual?.codewhispererCompletionType, 'Block')
            assert.strictEqual(actual?.codewhispererSuggestionState, 'Accept')
        })
    })

    describe('sendUserTriggerDecisionTelemetry', function () {
        let sut: TelemetryHelper

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            sut = new TelemetryHelper()
            CodeWhispererUserGroupSettings.instance.userGroup = CodeWhispererConstants.UserGroup.Control
        })

        it('should return Line and Accept', function () {
            sut.recordUserDecisionTelemetry(
                ['aFakeRequestId', 'aFakeRequestId', 'aFakeRequestId2'],
                'aFakeSessionId',
                [
                    aCompletion('oneline1', 'Showed'),
                    aCompletion('oneline2', 'Showed'),
                    aCompletion('two\nline1', 'Showed'),
                    aCompletion('two\nline2', 'Showed'),
                ],
                0,
                0
            )

            sut.sendUserTriggerDecisionTelemetry('aFakeSessionId', 'oneline1', 0)
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userTriggerDecision')
            assertTelemetry({
                codewhispererSessionId: 'aFakeSessionId',
                codewhispererFirstRequestId: 'aFakeRequestId',
                codewhispererLanguage: 'python',
                codewhispererTriggerType: 'OnDemand',
                codewhispererLineNumber: 0,
                codewhispererCursorOffset: 0,
                codewhispererSuggestionCount: 4,
                codewhispererSuggestionImportCount: 0,
                codewhispererSuggestionState: 'Accept',
                codewhispererUserGroup: 'Control',
                codewhispererCompletionType: 'Line',
                codewhispererTypeaheadLength: 0,
                codewhispererCharactersAccepted: 'oneline1'.length,
            })
        })

        it('should return Line and Accept 2', function () {
            sut.recordUserDecisionTelemetry(
                ['aFakeRequestId', 'aFakeRequestId', 'aFakeRequestId2'],
                'aFakeSessionId',
                [
                    aCompletion('oneline1', 'Showed'),
                    aCompletion('', 'Empty'),
                    aCompletion('two\nline', 'Showed'),
                    aCompletion('oneline2', 'Showed'),
                ],
                3,
                0
            )

            sut.sendUserTriggerDecisionTelemetry('aFakeSessionId', 'oneline2', 0)
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userTriggerDecision')
            assertTelemetry({
                codewhispererSessionId: 'aFakeSessionId',
                codewhispererFirstRequestId: 'aFakeRequestId',
                codewhispererLanguage: 'python',
                codewhispererTriggerType: 'OnDemand',
                codewhispererLineNumber: 0,
                codewhispererCursorOffset: 0,
                codewhispererSuggestionCount: 4,
                codewhispererSuggestionImportCount: 0,
                codewhispererSuggestionState: 'Accept',
                codewhispererUserGroup: 'Control',
                codewhispererCompletionType: 'Line',
                codewhispererTypeaheadLength: 0,
                codewhispererCharactersAccepted: 'oneline2'.length,
            })
        })

        it('should return Line and Reject', function () {
            sut.recordUserDecisionTelemetry(
                ['aFakeRequestId', 'aFakeRequestId', 'aFakeRequestId2'],
                'aFakeSessionId',
                [aCompletion('foo', 'Showed'), aCompletion('', 'Empty'), aCompletion('bar', 'Discard'), aCompletion()],
                -1,
                0
            )

            sut.sendUserTriggerDecisionTelemetry('aFakeSessionId', '', 0)
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userTriggerDecision')
            assertTelemetry({
                codewhispererSessionId: 'aFakeSessionId',
                codewhispererFirstRequestId: 'aFakeRequestId',
                codewhispererLanguage: 'python',
                codewhispererTriggerType: 'OnDemand',
                codewhispererLineNumber: 0,
                codewhispererCursorOffset: 0,
                codewhispererSuggestionCount: 4,
                codewhispererSuggestionImportCount: 0,
                codewhispererSuggestionState: 'Reject',
                codewhispererUserGroup: 'Control',
                codewhispererCompletionType: 'Line',
                codewhispererTypeaheadLength: 0,
                codewhispererCharactersAccepted: 0,
            })
        })
    })

    describe('getSuggestionState', function () {
        let telemetryHelper = new TelemetryHelper()
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            telemetryHelper = new TelemetryHelper()
        })

        it('user event is discard when recommendation state is Discarded with accept index = -1', function () {
            const recommendation = aCompletion('foo', 'Discard')
            const actual = telemetryHelper.getSuggestionState(0, -1, recommendation)
            assert.strictEqual(actual, 'Discard')
        })

        it('user event is reject when recommendation state is Showed with accept index = -1', function () {
            const recommendation = aCompletion('foo', 'Showed')
            const actual = telemetryHelper.getSuggestionState(0, -1, recommendation)
            assert.strictEqual(actual, 'Reject')
        })

        it('user event is Accept when recommendation state is Showed with accept index matches', function () {
            const recommendation = aCompletion('foo', 'Showed')
            const actual = telemetryHelper.getSuggestionState(0, 0, recommendation)
            assert.strictEqual(actual, 'Accept')
        })

        it('user event is Ignore when recommendation state is Showed with accept index does not match', function () {
            const recommendation = aCompletion('foo', 'Showed')
            const actual = telemetryHelper.getSuggestionState(0, 1, recommendation)
            assert.strictEqual(actual, 'Ignore')
        })

        it('user event is Unseen when recommendation state is not Showed, is not Unseen when recommendation is showed', function () {
            const recommendation0 = aCompletion('foo')
            const actual0 = telemetryHelper.getSuggestionState(0, 1, recommendation0)
            assert.strictEqual(actual0, 'Unseen')

            const recommendation1 = aCompletion('foo', 'Showed')
            const actual1 = telemetryHelper.getSuggestionState(1, 1, recommendation1)
            assert.strictEqual(actual1, 'Accept')
        })

        it('user event is Filter when recommendation state is Filter', function () {
            const recommendation = aCompletion('foo', 'Filter')
            const actual = telemetryHelper.getSuggestionState(0, 1, recommendation)
            assert.strictEqual(actual, 'Filter')
        })

        it('user event is Empty when recommendation state is Empty', function () {
            const recommendation = aCompletion('', 'Empty')
            const actual = telemetryHelper.getSuggestionState(0, 1, recommendation)
            assert.strictEqual(actual, 'Empty')
        })
    })

    describe('recordUserDecisionTelemetry', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
        })

        afterEach(function () {
            CodeWhispererUserGroupSettings.instance.reset()
        })

        it('Should call telemetry record for each recommendations with proper arguments', async function () {
            CodeWhispererUserGroupSettings.instance.userGroup = CodeWhispererConstants.UserGroup.Classifier

            const telemetryHelper = new TelemetryHelper()
            const response = [new CompletionRecommendation({ content: "print('Hello')" }, 'Showed')]
            const requestIdList = ['test_x', 'test_x', 'test_y']
            const sessionId = 'test_x'
            session.triggerType = 'AutoTrigger'
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userDecision')
            telemetryHelper.recordUserDecisionTelemetry(requestIdList, sessionId, response, 0, 0)
            assertTelemetry({
                codewhispererRequestId: 'test_x',
                codewhispererSessionId: 'test_x',
                codewhispererPaginationProgress: 0,
                codewhispererTriggerType: 'AutoTrigger',
                codewhispererSuggestionIndex: 0,
                codewhispererSuggestionState: 'Accept',
                codewhispererSuggestionReferenceCount: 0,
                codewhispererCompletionType: 'Line',
                codewhispererLanguage: 'python',
                codewhispererUserGroup: 'Classifier',
            })
        })
    })
})
