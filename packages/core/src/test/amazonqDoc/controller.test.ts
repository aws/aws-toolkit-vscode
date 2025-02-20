/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import sinon from 'sinon'
import {
    assertTelemetry,
    ControllerSetup,
    createController,
    createExpectedEvent,
    createSession,
    EventMetrics,
    FollowUpSequences,
    generateVirtualMemoryUri,
    updateFilePaths,
} from './utils'
import { CurrentWsFolders, NewFileInfo } from '../../amazonqDoc/types'
import { DocCodeGenState, docScheme, Session } from '../../amazonqDoc'
import { AuthUtil } from '../../codewhisperer'
import { FeatureDevClient } from '../../amazonqFeatureDev'
import { waitUntil } from '../../shared'
import { FollowUpTypes } from '../../amazonq/commons/types'
import { FileSystem } from '../../shared/fs/fs'
import { ReadmeBuilder } from './mockContent'
import * as path from 'path'
describe(`Controller - Doc Generation`, () => {
    const tabID = '123'
    const conversationID = '456'
    const uploadID = '789'

    let controllerSetup: ControllerSetup
    let session: Session
    let sendDocTelemetrySpy: sinon.SinonStub
    let mockGetCodeGeneration: sinon.SinonStub
    let getSessionStub: sinon.SinonStub
    let modifiedReadme: string
    const generatedReadme = ReadmeBuilder.createBaseReadme()
    let sandbox: sinon.SinonSandbox

    const getFilePaths = (controllerSetup: ControllerSetup): NewFileInfo[] => [
        {
            zipFilePath: path.normalize('README.md'),
            relativePath: path.normalize('README.md'),
            fileContent: generatedReadme,
            rejected: false,
            virtualMemoryUri: generateVirtualMemoryUri(uploadID, path.normalize('README.md'), docScheme),
            workspaceFolder: controllerSetup.workspaceFolder,
            changeApplied: false,
        },
    ]

    async function createCodeGenState(sandbox: sinon.SinonSandbox) {
        mockGetCodeGeneration = sandbox.stub().resolves({ codeGenerationStatus: { status: 'Complete' } })

        const workspaceFolders = [controllerSetup.workspaceFolder] as CurrentWsFolders
        const testConfig = {
            conversationId: conversationID,
            proxyClient: {
                createConversation: () => sandbox.stub(),
                createUploadUrl: () => sandbox.stub(),
                generatePlan: () => sandbox.stub(),
                startCodeGeneration: () => sandbox.stub(),
                getCodeGeneration: () => mockGetCodeGeneration(),
                exportResultArchive: () => sandbox.stub(),
            } as unknown as FeatureDevClient,
            workspaceRoots: [''],
            uploadId: uploadID,
            workspaceFolders,
        }

        const codeGenState = new DocCodeGenState(testConfig, getFilePaths(controllerSetup), [], [], tabID, 0, {})
        return createSession({
            messenger: controllerSetup.messenger,
            sessionState: codeGenState,
            conversationID,
            tabID,
            uploadID,
            scheme: docScheme,
            sandbox,
        })
    }
    async function fireFollowUps(followUpTypes: FollowUpTypes[]) {
        for (const type of followUpTypes) {
            controllerSetup.emitters.followUpClicked.fire({
                tabID,
                followUp: { type },
            })
        }
    }

    async function waitForStub(stub: sinon.SinonStub) {
        await waitUntil(() => Promise.resolve(stub.callCount > 0), {})
    }

    async function performAction(
        action: 'generate' | 'update' | 'makeChanges' | 'accept' | 'edit',
        getSessionStub: sinon.SinonStub,
        message?: string
    ) {
        const sequences = {
            generate: FollowUpSequences.generateReadme,
            update: FollowUpSequences.updateReadme,
            edit: FollowUpSequences.editReadme,
            makeChanges: FollowUpSequences.makeChanges,
            accept: FollowUpSequences.acceptContent,
        }

        await fireFollowUps(sequences[action])

        if ((action === 'makeChanges' || action === 'edit') && message) {
            controllerSetup.emitters.processHumanChatMessage.fire({
                tabID,
                conversationID,
                message,
            })
        }

        await waitForStub(getSessionStub)
    }

    async function setupTest(sandbox: sinon.SinonSandbox) {
        controllerSetup = await createController(sandbox)
        session = await createCodeGenState(sandbox)
        sendDocTelemetrySpy = sandbox.stub(session, 'sendDocTelemetryEvent').resolves()
        sandbox.stub(session, 'preloader').resolves()
        sandbox.stub(session, 'send').resolves()
        Object.defineProperty(session, '_conversationId', {
            value: conversationID,
            writable: true,
            configurable: true,
        })

        sandbox.stub(AuthUtil.instance, 'getChatAuthState').resolves({
            codewhispererCore: 'connected',
            codewhispererChat: 'connected',
            amazonQ: 'connected',
        })
        sandbox.stub(FileSystem.prototype, 'exists').resolves(false)
        getSessionStub = sandbox.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)
        modifiedReadme = ReadmeBuilder.createReadmeWithRepoStructure()
        sandbox
            .stub(vscode.workspace, 'openTextDocument')
            .callsFake(async (options?: string | vscode.Uri | { language?: string; content?: string }) => {
                let documentPath = ''
                if (typeof options === 'string') {
                    documentPath = options
                } else if (options && 'path' in options) {
                    documentPath = options.path
                }

                const isTempFile = documentPath === 'empty'
                return {
                    getText: () => (isTempFile ? generatedReadme : modifiedReadme),
                } as any
            })
    }

    const retryTest = async (
        testMethod: () => Promise<void>,
        maxRetries: number = 3,
        delayMs: number = 1000
    ): Promise<void> => {
        let lastError: Error | undefined

        for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
            sandbox = sinon.createSandbox()
            try {
                await setupTest(sandbox)
                await testMethod()
                sandbox.restore()
                return
            } catch (error) {
                lastError = error as Error
                sandbox.restore()

                if (attempt > maxRetries) {
                    console.error(`Test failed after ${maxRetries} retries:`, lastError)
                    throw lastError
                }

                console.log(`Test attempt ${attempt} failed, retrying...`)
                await new Promise((resolve) => setTimeout(resolve, delayMs))
            }
        }
    }

    after(() => {
        if (sandbox) {
            sandbox.restore()
        }
    })

    it('should emit generation telemetry for initial README generation', async () => {
        await retryTest(async () => {
            await performAction('generate', getSessionStub)

            const expectedEvent = createExpectedEvent({
                type: 'generation',
                ...EventMetrics.INITIAL_README,
                interactionType: 'GENERATE_README',
                conversationId: conversationID,
            })

            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent,
                type: 'generation',
                sandbox,
            })
        })
    })
    it('should emit another generation telemetry for make changes operation after initial README generation', async () => {
        await retryTest(async () => {
            await performAction('generate', getSessionStub)
            const firstExpectedEvent = createExpectedEvent({
                type: 'generation',
                ...EventMetrics.INITIAL_README,
                interactionType: 'GENERATE_README',
                conversationId: conversationID,
            })

            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent: firstExpectedEvent,
                type: 'generation',
                sandbox,
            })

            await updateFilePaths(session, modifiedReadme, uploadID, docScheme, controllerSetup.workspaceFolder)
            await performAction('makeChanges', getSessionStub, 'add repository structure section')

            const secondExpectedEvent = createExpectedEvent({
                type: 'generation',
                ...EventMetrics.REPO_STRUCTURE,
                interactionType: 'GENERATE_README',
                conversationId: conversationID,
            })

            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent: secondExpectedEvent,
                type: 'generation',
                callIndex: 1,
                sandbox,
            })
        })
    })

    it('should emit acceptance telemetry for README generation', async () => {
        await retryTest(async () => {
            await performAction('generate', getSessionStub)
            await new Promise((resolve) => setTimeout(resolve, 100))
            const expectedEvent = createExpectedEvent({
                type: 'acceptance',
                ...EventMetrics.INITIAL_README,
                interactionType: 'GENERATE_README',
                conversationId: conversationID,
            })

            await performAction('accept', getSessionStub)
            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent,
                type: 'acceptance',
                callIndex: 1,
                sandbox,
            })
        })
    })
    it('should emit generation telemetry for README update', async () => {
        await retryTest(async () => {
            await performAction('update', getSessionStub)

            const expectedEvent = createExpectedEvent({
                type: 'generation',
                ...EventMetrics.REPO_STRUCTURE,
                interactionType: 'UPDATE_README',
                conversationId: conversationID,
            })

            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent,
                type: 'generation',
                sandbox,
            })
        })
    })
    it('should emit another generation telemetry for make changes operation after README update', async () => {
        await retryTest(async () => {
            await performAction('update', getSessionStub)
            await new Promise((resolve) => setTimeout(resolve, 100))

            modifiedReadme = ReadmeBuilder.createReadmeWithDataFlow()
            await updateFilePaths(session, modifiedReadme, uploadID, docScheme, controllerSetup.workspaceFolder)

            await performAction('makeChanges', getSessionStub, 'add data flow section')

            const expectedEvent = createExpectedEvent({
                type: 'generation',
                ...EventMetrics.DATA_FLOW,
                interactionType: 'UPDATE_README',
                conversationId: conversationID,
                callIndex: 1,
            })

            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent,
                type: 'generation',
                callIndex: 1,
                sandbox,
            })
        })
    })

    it('should emit acceptance telemetry for README update', async () => {
        await retryTest(async () => {
            await performAction('update', getSessionStub)
            await new Promise((resolve) => setTimeout(resolve, 100))

            const expectedEvent = createExpectedEvent({
                type: 'acceptance',
                ...EventMetrics.REPO_STRUCTURE,
                interactionType: 'UPDATE_README',
                conversationId: conversationID,
            })

            await performAction('accept', getSessionStub)
            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent,
                type: 'acceptance',
                callIndex: 1,
                sandbox,
            })
        })
    })

    it('should emit generation telemetry for README edit', async () => {
        await retryTest(async () => {
            await performAction('edit', getSessionStub, 'add repository structure section')

            const expectedEvent = createExpectedEvent({
                type: 'generation',
                ...EventMetrics.REPO_STRUCTURE,
                interactionType: 'EDIT_README',
                conversationId: conversationID,
            })

            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent,
                type: 'generation',
                sandbox,
            })
        })
    })
    it('should emit acceptance telemetry for README edit', async () => {
        await retryTest(async () => {
            await performAction('edit', getSessionStub, 'add repository structure section')
            await new Promise((resolve) => setTimeout(resolve, 100))

            const expectedEvent = createExpectedEvent({
                type: 'acceptance',
                ...EventMetrics.REPO_STRUCTURE,
                interactionType: 'EDIT_README',
                conversationId: conversationID,
            })

            await performAction('accept', getSessionStub)
            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent,
                type: 'acceptance',
                callIndex: 1,
                sandbox,
            })
        })
    })
})
