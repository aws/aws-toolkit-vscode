/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import * as got from 'got'
import { RefinementState, PrepareRefinementState } from '../../../amazonqFeatureDev/session/sessionState'
import { SessionStateConfig, SessionStateAction } from '../../../amazonqFeatureDev/types'
import { Messenger } from '../../../amazonqFeatureDev/controllers/chat/messenger/messenger'
import { AppToWebViewMessageDispatcher } from '../../../amazonqFeatureDev/views/connector/connector'
import { MessagePublisher } from '../../../amazonq/messages/messagePublisher'
import { FeatureDevClient } from '../../../amazonqFeatureDev/client/featureDev'
import { PrepareRepoFailedError } from '../../../amazonqFeatureDev/errors'
import { TelemetryHelper } from '../../../amazonqFeatureDev/util/telemetryHelper'
import { assertTelemetry } from '../../testUtil'

const mockSessionStateAction = (msg?: string): SessionStateAction => {
    return {
        task: 'test-task',
        msg: msg ?? 'test-msg',
        files: [],
        messenger: new Messenger(
            new AppToWebViewMessageDispatcher(new MessagePublisher<any>(new vscode.EventEmitter<any>()))
        ),
        telemetry: new TelemetryHelper(),
    }
}

let mockGeneratePlan: sinon.SinonStub
let mockCreateUploadUrl: sinon.SinonStub
const mockSessionStateConfig = ({
    conversationId,
    uploadId,
}: {
    conversationId: string
    uploadId: string
}): SessionStateConfig => ({
    sourceRoot: 'fake-source',
    workspaceRoot: 'fake-root',
    conversationId,
    proxyClient: {
        createConversation: () => sinon.stub(),
        createUploadUrl: () => mockCreateUploadUrl(),
        generatePlan: () => mockGeneratePlan(),
    } as unknown as FeatureDevClient,
    uploadId,
})

describe('sessionState', () => {
    const testApproach = 'test-approach'
    const conversationId = 'conversation-id'
    const uploadId = 'upload-id'
    const tabId = 'tab-id'
    const testConfig = mockSessionStateConfig({ conversationId, uploadId })

    afterEach(() => {
        sinon.restore()
    })

    describe('PrepareRefinementState', () => {
        it('error when failing to prepare repo information', async () => {
            sinon.stub(vscode.workspace, 'findFiles').throws()
            mockCreateUploadUrl = sinon.stub().resolves({ uploadId: '', uploadUrl: '' })
            const testAction = mockSessionStateAction()

            await assert.rejects(() => {
                return new PrepareRefinementState(testConfig, testApproach, tabId).interact(testAction)
            }, PrepareRepoFailedError)
        })

        it('emits telemetry when interaction succeeds', async () => {
            sinon.stub(vscode.workspace, 'findFiles').resolves([])
            mockCreateUploadUrl = sinon.stub().resolves({ uploadId: '', uploadUrl: '' })
            mockGeneratePlan = sinon.stub().resolves(testApproach)
            sinon.stub(got, 'default').resolves({ statusCode: 200 })

            const testAction = mockSessionStateAction()
            await new PrepareRefinementState(testConfig, testApproach, tabId).interact(testAction)

            assertTelemetry('amazonq_createUpload', {
                amazonqConversationId: conversationId,
                amazonqRepositorySize: 0,
                result: 'Succeeded',
            })
        })
    })

    describe('RefinementState', () => {
        const testAction = mockSessionStateAction()

        it('transitions to RefinementState and returns an approach', async () => {
            sinon.stub(performance, 'now').returns(0)

            mockGeneratePlan = sinon.stub().resolves(testApproach)
            const state = new RefinementState(testConfig, testApproach, tabId, 0)
            const result = await state.interact(testAction)

            assert.deepStrictEqual(result, {
                nextState: new RefinementState(testConfig, testApproach, tabId, 1),
                interaction: {
                    content: `${testApproach}\n`,
                },
            })

            assertTelemetry('amazonq_approachInvoke', {
                result: 'Succeeded',
                amazonqConversationId: conversationId,
                amazonqGenerateApproachIteration: 0,
                amazonqGenerateApproachLatency: 0,
            })
        })

        it('transitions to RefinementState but does not return an approach', async () => {
            mockGeneratePlan = sinon.stub().resolves(undefined)
            const state = new RefinementState(testConfig, testApproach, tabId, 0)
            const result = await state.interact(testAction)
            const invokeFailureApproach =
                'There has been a problem generating an approach. Please open a conversation in a new tab'

            assert.deepStrictEqual(result, {
                nextState: new RefinementState(testConfig, invokeFailureApproach, tabId, 1),
                interaction: {
                    content: `${invokeFailureApproach}\n`,
                },
            })
        })

        it('invalid html gets sanitized', async () => {
            const invalidHTMLApproach =
                '<head><script src="https://foo"></script></head><body><h1>hello world</h1></body>'
            mockGeneratePlan = sinon.stub().resolves(invalidHTMLApproach)
            const state = new RefinementState(testConfig, invalidHTMLApproach, tabId, 0)
            const result = await state.interact(testAction)

            const expectedApproach = `<h1>hello world</h1>`
            assert.deepStrictEqual(result, {
                nextState: new RefinementState(testConfig, expectedApproach, tabId, 1),
                interaction: {
                    content: `${expectedApproach}\n`,
                },
            })
        })
    })
})
