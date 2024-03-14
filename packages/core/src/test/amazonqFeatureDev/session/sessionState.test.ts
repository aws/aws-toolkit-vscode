/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import {
    RefinementState,
    MockCodeGenState,
    CodeGenState,
    PrepareCodeGenState,
    PrepareRefinementState,
} from '../../../amazonqFeatureDev/session/sessionState'
import { VirtualFileSystem } from '../../../shared/virtualFilesystem'
import { SessionStateConfig, SessionStateAction } from '../../../amazonqFeatureDev/types'
import { Messenger } from '../../../amazonqFeatureDev/controllers/chat/messenger/messenger'
import { AppToWebViewMessageDispatcher } from '../../../amazonqFeatureDev/views/connector/connector'
import { MessagePublisher } from '../../../amazonq/messages/messagePublisher'
import { FeatureDevClient } from '../../../amazonqFeatureDev/client/featureDev'
import { ToolkitError } from '../../../shared/errors'
import { PrepareRepoFailedError } from '../../../amazonqFeatureDev/errors'
import crypto from 'crypto'
import { TelemetryHelper } from '../../../amazonqFeatureDev/util/telemetryHelper'
import { assertTelemetry, createTestWorkspaceFolder } from '../../testUtil'
import { getFetchStubWithResponse } from '../../common/request.test'

const mockSessionStateAction = (msg?: string): SessionStateAction => {
    return {
        task: 'test-task',
        msg: msg ?? 'test-msg',
        fs: new VirtualFileSystem(),
        messenger: new Messenger(
            new AppToWebViewMessageDispatcher(new MessagePublisher<any>(new vscode.EventEmitter<any>()))
        ),
        telemetry: new TelemetryHelper(),
    }
}

let mockGeneratePlan: sinon.SinonStub
let mockGetCodeGeneration: sinon.SinonStub
let mockExportResultArchive: sinon.SinonStub
let mockCreateUploadUrl: sinon.SinonStub
const mockSessionStateConfig = ({
    conversationId,
    uploadId,
    workspaceFolder,
}: {
    conversationId: string
    uploadId: string
    workspaceFolder: vscode.WorkspaceFolder
}): SessionStateConfig => ({
    sourceRoots: ['fake-source'],
    workspaceFolders: [workspaceFolder],
    conversationId,
    proxyClient: {
        createConversation: () => sinon.stub(),
        createUploadUrl: () => mockCreateUploadUrl(),
        generatePlan: () => mockGeneratePlan(),
        startCodeGeneration: () => sinon.stub(),
        getCodeGeneration: () => mockGetCodeGeneration(),
        exportResultArchive: () => mockExportResultArchive(),
    } as unknown as FeatureDevClient,
    uploadId,
})

describe('sessionState', () => {
    const testApproach = 'test-approach'
    const conversationId = 'conversation-id'
    const uploadId = 'upload-id'
    const tabId = 'tab-id'
    let testConfig: SessionStateConfig

    beforeEach(async () => {
        testConfig = mockSessionStateConfig({
            conversationId,
            uploadId,
            workspaceFolder: await createTestWorkspaceFolder('fake-root'),
        })
    })

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
            getFetchStubWithResponse({ status: 200 })

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

            mockGeneratePlan = sinon.stub().resolves({ responseType: 'TEST_RESPONSE_TYPE', approach: testApproach })
            const state = new RefinementState(testConfig, testApproach, tabId, 0)
            const result = await state.interact(testAction)

            assert.deepStrictEqual(result, {
                nextState: new RefinementState(testConfig, testApproach, tabId, 1),
                interaction: {
                    content: `${testApproach}\n`,
                    responseType: 'TEST_RESPONSE_TYPE',
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
            mockGeneratePlan = sinon.stub().resolves({ responseType: 'TEST_RESPONSE_TYPE', approach: undefined })
            const state = new RefinementState(testConfig, testApproach, tabId, 0)
            const result = await state.interact(testAction)
            const invokeFailureApproach =
                'There has been a problem generating an approach. Please open a conversation in a new tab'

            assert.deepStrictEqual(result, {
                nextState: new RefinementState(testConfig, invokeFailureApproach, tabId, 1),
                interaction: {
                    content: `${invokeFailureApproach}\n`,
                    responseType: 'TEST_RESPONSE_TYPE',
                },
            })
        })

        it('invalid html gets sanitized', async () => {
            const invalidHTMLApproach =
                '<head><script src="https://foo"></script></head><body><h1>hello world</h1></body>'
            mockGeneratePlan = sinon
                .stub()
                .resolves({ responseType: 'TEST_RESPONSE_TYPE', approach: invalidHTMLApproach })
            const state = new RefinementState(testConfig, invalidHTMLApproach, tabId, 0)
            const result = await state.interact(testAction)

            const expectedApproach =
                '&lt;head&gt;&lt;script src="https://foo"&gt;&lt;/script&gt;&lt;/head&gt;&lt;body&gt;&lt;h1&gt;hello world&lt;/h1&gt;&lt;/body&gt;'
            assert.deepStrictEqual(result, {
                nextState: new RefinementState(testConfig, expectedApproach, tabId, 1),
                interaction: {
                    content: `${expectedApproach}\n`,
                    responseType: 'TEST_RESPONSE_TYPE',
                },
            })
        })
    })

    describe('MockCodeGenState', () => {
        it('loops forever in the same state', async () => {
            sinon.stub(crypto, 'randomUUID').returns('upload-id' as ReturnType<(typeof crypto)['randomUUID']>)
            const testAction = mockSessionStateAction()
            const state = new MockCodeGenState(testConfig, testApproach, tabId)
            const result = await state.interact(testAction)

            assert.deepStrictEqual(result, {
                nextState: state,
                interaction: {},
            })
        })
    })

    describe('PrepareCodeGenState', () => {
        it('error when failing to prepare repo information', async () => {
            sinon.stub(vscode.workspace, 'findFiles').throws()
            mockCreateUploadUrl = sinon.stub().resolves({ uploadId: '', uploadUrl: '' })
            const testAction = mockSessionStateAction()

            await assert.rejects(() => {
                return new PrepareCodeGenState(testConfig, testApproach, { result: 'pending' }, tabId, 0).interact(
                    testAction
                )
            })
        })
    })

    describe('CodeGenState', () => {
        it('transitions to PrepareCodeGenState when codeGenerationStatus ready ', async () => {
            mockGetCodeGeneration = sinon.stub().resolves({ codeGenerationStatus: { status: 'Complete' } })
            mockExportResultArchive = sinon.stub().resolves({ newFileContents: [], deletedFiles: [], references: [] })

            const testAction = mockSessionStateAction()
            const state = new CodeGenState(testConfig, testApproach, { result: 'pending' }, tabId, 0)
            const result = await state.interact(testAction)

            const nextState = new PrepareCodeGenState(
                testConfig,
                testApproach,
                {
                    result: 'success',
                    artifacts: {
                        deletedFiles: [],
                        filePaths: [],
                        references: [],
                    },
                },
                tabId,
                1
            )

            assert.deepStrictEqual(result, {
                nextState,
                interaction: {},
            })
        })

        it('fails when codeGenerationStatus failed ', async () => {
            mockGetCodeGeneration = sinon.stub().rejects(new ToolkitError('Code generation failed'))
            const testAction = mockSessionStateAction()
            const state = new CodeGenState(testConfig, testApproach, { result: 'pending' }, tabId, 0)
            try {
                await state.interact(testAction)
                assert.fail('failed code generations should throw an error')
            } catch (e: any) {
                assert.deepStrictEqual(e.message, 'Code generation failed')
            }
        })
    })
})
