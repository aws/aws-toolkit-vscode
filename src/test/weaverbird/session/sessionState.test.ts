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
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import * as invokeModule from '../../../weaverbird/util/invoke'
import { VirtualFileSystem } from '../../../shared/virtualFilesystem'
import { SessionStateConfig, SessionStateAction } from '../../../weaverbird/types'
import { GenerateApproachOutput, GenerateCodeOutput } from '../../../weaverbird/client/weaverbirdclient'
import { Messenger } from '../../../weaverbird/controllers/chat/messenger/messenger'
import { AppToWebViewMessageDispatcher } from '../../../weaverbird/views/connector/connector'
import { MessagePublisher } from '../../../awsq/messages/messagePublisher'

interface MockSessionStateActionInput {
    msg?: 'MOCK CODE' | 'OTHER'
    messengerEvent?: vscode.EventEmitter<any>
}

const mockSessionStateAction = ({ msg, messengerEvent }: MockSessionStateActionInput): SessionStateAction => {
    return {
        task: 'test-task',
        msg: msg ?? 'test-msg',
        files: [],
        fs: new VirtualFileSystem(),
        messenger: new Messenger(
            new AppToWebViewMessageDispatcher(
                new MessagePublisher<any>(messengerEvent ?? new vscode.EventEmitter<any>())
            )
        ),
    }
}

const mockSessionStateConfig = ({ conversationId }: { conversationId: string }): SessionStateConfig => ({
    client: {} as unknown as LambdaClient,
    llmConfig: {
        model: 'test-model',
        maxTokensToSample: 1,
        temperature: 1,
        debateRounds: 1,
        generationFlow: 'lambda',
    },
    workspaceRoot: 'fake-root',
    backendConfig: {
        endpoint: 'fake-endpoint',
        region: 'fake-region',
        lambdaArns: {
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
})

describe('sessionState', () => {
    const testApproach = 'test-approach'
    const generationId = 'test-id'
    const conversationId = 'conversation-id'
    const tabId = 'tab-id'
    const testConfig = mockSessionStateConfig({ conversationId })

    beforeEach(() => {})

    afterEach(() => {
        sinon.restore()
    })

    describe('RefinementState', () => {
        const testAction = mockSessionStateAction({})

        it('transitions to RefinementIterationState and returns an approach', async () => {
            sinon
                .stub(invokeModule, 'invoke')
                .resolves({ approach: testApproach, conversationId } satisfies GenerateApproachOutput)
            const state = new RefinementState(testConfig, testApproach, tabId)
            const result = await state.interact(testAction)

            assert.deepStrictEqual(result, {
                nextState: new RefinementIterationState(testConfig, testApproach, tabId),
                interactions: {
                    content: [`${testApproach}\n`],
                },
            })
        })

        it('transitions to RefinementIterationState but does not return an approach', async () => {
            sinon.stub(invokeModule, 'invoke').resolves({ conversationId } satisfies GenerateApproachOutput)
            const state = new RefinementState(testConfig, testApproach, tabId)
            const result = await state.interact(testAction)
            const invokeFailureApproach =
                "There has been a problem generating an approach. Please type 'CLEAR' and start over."

            assert.deepStrictEqual(result, {
                nextState: new RefinementIterationState(testConfig, invokeFailureApproach, tabId),
                interactions: {
                    content: [`${invokeFailureApproach}\n`],
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
                interactions: {
                    content: ['Changes to files done. Please review:'],
                    filePaths: [],
                },
            })
        })
    })

    describe('CodeGenState', () => {
        it('transitions to  generate CodeGenIterationState when codeGenerationStatus ready ', async () => {
            sinon.stub(invokeModule, 'invoke').resolves({ generationId, codeGenerationStatus: 'ready' })
            const testEmitter = sinon.createStubInstance(vscode.EventEmitter)
            const testAction = mockSessionStateAction({ messengerEvent: testEmitter })
            const state = new CodeGenState(testConfig, testApproach, tabId)
            const result = await state.interact(testAction)

            const nextState = new CodeGenIterationState(testConfig, testApproach, [], [], tabId)

            assert.deepStrictEqual(result, {
                nextState,
                interactions: {
                    content: [],
                },
            })
            assert.strictEqual(testEmitter.fire.getCalls().length, 2)
            assert.strictEqual(
                testEmitter.fire.calledWithMatch({
                    message: 'Code generation started\n',
                }),
                true
            )
            assert.strictEqual(
                testEmitter.fire.calledWithMatch({
                    message: 'Changes to files done. Please review:',
                }),
                true
            )
        })

        it('transitions to  generate CodeGenIterationState when codeGenerationStatus failed ', async () => {
            sinon.stub(invokeModule, 'invoke').resolves({ generationId, codeGenerationStatus: 'failed' })
            const testEmitter = sinon.createStubInstance(vscode.EventEmitter)
            const testAction = mockSessionStateAction({ messengerEvent: testEmitter })
            const state = new CodeGenState(testConfig, testApproach, tabId)
            const result = await state.interact(testAction)

            const nextState = new CodeGenIterationState(testConfig, testApproach, [], [], tabId)

            assert.deepStrictEqual(result, {
                nextState,
                interactions: {
                    content: [],
                },
            })
            assert.strictEqual(testEmitter.fire.getCalls().length, 2)
            assert.strictEqual(
                testEmitter.fire.calledWithMatch({
                    message: 'Code generation started\n',
                }),
                true
            )
            assert.strictEqual(
                testEmitter.fire.calledWithMatch({
                    message: 'Code generation failed\n',
                }),
                true
            )
        })
    })

    describe('RefinementIterationState', () => {
        const refinementIterationState = new RefinementIterationState(testConfig, testApproach, tabId)

        it('transitions after interaction to MockCodeGenState if action is MOCK CODE', async () => {
            const testAction = mockSessionStateAction({ msg: 'MOCK CODE' })
            const interactionResult = await refinementIterationState.interact(testAction)

            assert.deepStrictEqual(interactionResult, {
                nextState: new RefinementState(testConfig, testApproach, tabId),
                interactions: {
                    content: ['Changes to files done. Please review:'],
                    filePaths: [],
                },
            })
        })

        it('keeps on RefinementIterationState after interaction in any other case', async () => {
            sinon
                .stub(invokeModule, 'invoke')
                .resolves({ approach: testApproach, conversationId } satisfies GenerateApproachOutput)
            const testAction = mockSessionStateAction({ msg: 'OTHER' })
            const interactionResult = await refinementIterationState.interact(testAction)

            assert.deepStrictEqual(interactionResult, {
                nextState: new RefinementIterationState(testConfig, testApproach, tabId),
                interactions: {
                    content: [`${testApproach}\n`],
                },
            })
        })
    })

    describe('CodeGenIterationState', () => {
        it('transitions to generate CodeGenIterationState', async () => {
            sinon.stub(invokeModule, 'invoke').resolves({ generationId } satisfies GenerateCodeOutput)
            const testAction = mockSessionStateAction({})

            const codeGenIterationState = new CodeGenIterationState(testConfig, testApproach, [], [], tabId)
            const codeGenIterationStateResult = await codeGenIterationState.interact(testAction)

            assert.deepStrictEqual(codeGenIterationStateResult, {
                nextState: codeGenIterationState,
                interactions: {
                    content: ['Changes to files done'],
                },
            })
        })
    })
})
