/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import {
    RefinementIterationState,
    RefinementState,
    MockCodeGenState,
    CodeGenIterationState,
    CodeGenState,
} from '../../../weaverbird/session/sessionState'
import { VirtualFileSystem } from '../../../shared/virtualFilesystem'
import { SessionStateConfig, SessionStateAction } from '../../../weaverbird/types'
import { Messenger } from '../../../weaverbird/controllers/chat/messenger/messenger'
import { AppToWebViewMessageDispatcher } from '../../../weaverbird/views/connector/connector'
import { MessagePublisher } from '../../../awsq/messages/messagePublisher'
import { WeaverbirdClient } from '../../../weaverbird/client/weaverbird'
import { ToolkitError } from '../../../shared/errors'

interface MockSessionStateActionInput {
    msg?: 'MOCK CODE' | 'OTHER'
}

const mockSessionStateAction = ({ msg }: MockSessionStateActionInput): SessionStateAction => {
    return {
        task: 'test-task',
        msg: msg ?? 'test-msg',
        files: [],
        fs: new VirtualFileSystem(),
        messenger: new Messenger(
            new AppToWebViewMessageDispatcher(new MessagePublisher<any>(new vscode.EventEmitter<any>()))
        ),
    }
}

let mockGeneratePlan: sinon.SinonStub
let mockGetCodeGeneration: sinon.SinonStub
let mockExportResultArchive: sinon.SinonStub
const mockSessionStateConfig = ({
    conversationId,
    uploadId,
}: {
    conversationId: string
    uploadId: string
}): SessionStateConfig => ({
    llmConfig: {
        model: 'test-model',
        maxTokensToSample: 1,
        temperature: 1,
        debateRounds: 1,
        debateParticipantsCount: 3,
        generationFlow: 'lambda',
    },
    workspaceRoot: 'fake-root',
    backendConfig: {
        endpoint: 'fake-endpoint',
        region: 'fake-region',
        lambdaArns: {
            setup: {
                startConversation: 'fake-start-conversation',
                createUploadUrl: 'fake-create-upload-url',
            },
            approach: {
                generate: 'fake-generate-arn',
                iterate: 'fake-iterate-arn',
            },
            codegen: {
                generate: 'fake-generate-arn',
                getResults: 'fake-getResults-arn',
                iterate: 'fake-iterate',
                getIterationResults: 'fake-getIterationResults-arn',
            },
        },
    },
    conversationId,
    proxyClient: {
        createConversation: () => sinon.stub(),
        createUploadUrl: () => sinon.stub(),
        generatePlan: () => mockGeneratePlan(),
        startCodeGeneration: () => sinon.stub(),
        getCodeGeneration: () => mockGetCodeGeneration(),
        exportResultArchive: () => mockExportResultArchive(),
    } as unknown as WeaverbirdClient,
    uploadId,
})

describe('sessionState', () => {
    const testApproach = 'test-approach'
    const conversationId = 'conversation-id'
    const uploadId = 'upload-id'
    const tabId = 'tab-id'
    const testConfig = mockSessionStateConfig({ conversationId, uploadId })

    beforeEach(() => {})

    afterEach(() => {
        sinon.restore()
    })

    describe('RefinementState', () => {
        const testAction = mockSessionStateAction({})

        it('transitions to RefinementIterationState and returns an approach', async () => {
            mockGeneratePlan = sinon.stub().resolves(testApproach)
            const state = new RefinementState(testConfig, testApproach, tabId)
            const result = await state.interact(testAction)

            assert.deepStrictEqual(result, {
                nextState: new RefinementIterationState(testConfig, testApproach, tabId),
                interaction: {
                    content: `${testApproach}\n`,
                },
            })
        })

        it('transitions to RefinementIterationState but does not return an approach', async () => {
            mockGeneratePlan = sinon.stub().resolves(undefined)
            const state = new RefinementState(testConfig, testApproach, tabId)
            const result = await state.interact(testAction)
            const invokeFailureApproach =
                'There has been a problem generating an approach. Please open a conversation in a new tab'

            assert.deepStrictEqual(result, {
                nextState: new RefinementIterationState(testConfig, invokeFailureApproach, tabId),
                interaction: {
                    content: `${invokeFailureApproach}\n`,
                },
            })
        })

        it('invalid html gets sanitized', async () => {
            const invalidHTMLApproach =
                '<head><script src="https://foo"></script></head><body><h1>hello world</h1></body>'
            mockGeneratePlan = sinon.stub().resolves(invalidHTMLApproach)
            const state = new RefinementState(testConfig, invalidHTMLApproach, tabId)
            const result = await state.interact(testAction)

            const expectedApproach = `<h1>hello world</h1>`
            assert.deepStrictEqual(result, {
                nextState: new RefinementIterationState(testConfig, expectedApproach, tabId),
                interaction: {
                    content: `${expectedApproach}\n`,
                },
            })
        })
    })

    describe('MockCodeGenState', () => {
        it('transitions to generate RefinementState', async () => {
            const testAction = mockSessionStateAction({})
            const state = new MockCodeGenState(testConfig, testApproach, tabId)
            const result = await state.interact(testAction)
            const nextState = new RefinementState(testConfig, testApproach, tabId)

            assert.deepStrictEqual(result, {
                nextState: nextState,
                interaction: {},
            })
        })
    })

    describe('CodeGenState', () => {
        it('transitions to  generate CodeGenIterationState when codeGenerationStatus ready ', async () => {
            mockGetCodeGeneration = sinon.stub().resolves({ codeGenerationStatus: { status: 'Complete' } })
            mockExportResultArchive = sinon.stub().resolves([])
            const testAction = mockSessionStateAction({})
            const state = new CodeGenState(testConfig, testApproach, tabId)
            const result = await state.interact(testAction)

            const nextState = new CodeGenIterationState(testConfig, testApproach, [], tabId)

            assert.deepStrictEqual(result, {
                nextState,
                interaction: {},
            })
        })

        it('fails when codeGenerationStatus failed ', async () => {
            mockGetCodeGeneration = sinon.stub().rejects(new ToolkitError('Code generation failed'))
            const testAction = mockSessionStateAction({})
            const state = new CodeGenState(testConfig, testApproach, tabId)
            try {
                await state.interact(testAction)
                assert.fail('failed code generations should throw an error')
            } catch (e: any) {
                assert.deepStrictEqual(e.message, 'Code generation failed')
            }
        })
    })

    describe('RefinementIterationState', () => {
        const refinementIterationState = new RefinementIterationState(testConfig, testApproach, tabId)

        it('transitions after interaction to MockCodeGenState if action is MOCK CODE', async () => {
            const testAction = mockSessionStateAction({ msg: 'MOCK CODE' })
            const interactionResult = await refinementIterationState.interact(testAction)

            assert.deepStrictEqual(interactionResult, {
                nextState: new RefinementState(testConfig, testApproach, tabId),
                interaction: {},
            })
        })

        it('keeps on RefinementIterationState after interaction in any other case', async () => {
            mockGeneratePlan = sinon.stub().resolves(testApproach)
            const testAction = mockSessionStateAction({ msg: 'OTHER' })
            const interactionResult = await refinementIterationState.interact(testAction)

            assert.deepStrictEqual(interactionResult, {
                nextState: new RefinementIterationState(testConfig, testApproach, tabId),
                interaction: {
                    content: `${testApproach}\n`,
                },
            })
        })

        it('invalid html gets sanitized', async () => {
            const invalidHTMLApproach =
                '<head><script src="https://foo"></script></head><body><h1>hello world</h1></body>'
            mockGeneratePlan = sinon.stub().resolves(invalidHTMLApproach)
            const state = new RefinementIterationState(testConfig, invalidHTMLApproach, tabId)
            const testAction = mockSessionStateAction({})
            const result = await state.interact(testAction)

            const expectedApproach = `<h1>hello world</h1>`
            assert.deepStrictEqual(result, {
                nextState: new RefinementIterationState(testConfig, expectedApproach, tabId),
                interaction: {
                    content: `${expectedApproach}\n`,
                },
            })
        })
    })

    describe('CodeGenIterationState', () => {
        it('transitions to generate CodeGenIterationState', async () => {
            mockGetCodeGeneration = sinon.stub().resolves({ codeGenerationStatus: { status: 'Complete' } })
            mockExportResultArchive = sinon.stub().resolves([])
            const testAction = mockSessionStateAction({})

            const codeGenIterationState = new CodeGenIterationState(testConfig, testApproach, [], tabId)
            const codeGenIterationStateResult = await codeGenIterationState.interact(testAction)

            assert.deepStrictEqual(codeGenIterationStateResult, {
                nextState: codeGenIterationState,
                interaction: {},
            })
        })
    })
})
