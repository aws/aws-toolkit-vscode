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
    createExpectedMetricData,
    createSession,
    EventMetrics,
    FollowUpSequences,
    generateVirtualMemoryUri,
    updateFilePaths,
} from './utils'
import { CurrentWsFolders, MetricDataOperationName, MetricDataResult, NewFileInfo } from '../../amazonqDoc/types'
import { DocCodeGenState, docScheme, Session } from '../../amazonqDoc'
import {
    ApiClientError,
    ApiServiceError,
    CodeIterationLimitError,
    FeatureDevClient,
    getMetricResult,
    MonthlyConversationLimitError,
    PrepareRepoFailedError,
    TabIdNotFoundError,
    UploadCodeError,
    UploadURLExpired,
    UserMessageNotFoundError,
    ZipFileError,
} from '../../amazonqFeatureDev'
import { i18n, ToolkitError, waitUntil } from '../../shared'
import { FollowUpTypes } from '../../amazonq/commons/types'
import { FileSystem } from '../../shared/fs/fs'
import { ReadmeBuilder } from './mockContent'
import * as path from 'path'
import {
    ContentLengthError,
    NoChangeRequiredException,
    PromptRefusalException,
    PromptTooVagueError,
    PromptUnrelatedError,
    ReadmeTooLargeError,
    ReadmeUpdateTooLargeError,
    WorkspaceEmptyError,
} from '../../amazonqDoc/errors'
import { LlmError } from '../../amazonq/errors'

describe('Controller - Doc Generation', () => {
    const firstTabID = '123'
    const firstConversationID = '123'
    const firstUploadID = '123'

    const secondTabID = '456'
    const secondConversationID = '456'
    const secondUploadID = '456'

    let controllerSetup: ControllerSetup
    let session: Session
    let sendDocTelemetrySpy: sinon.SinonStub
    let sendDocTelemetrySpyForSecondTab: sinon.SinonStub
    let mockGetCodeGeneration: sinon.SinonStub
    let getSessionStub: sinon.SinonStub
    let modifiedReadme: string
    const generatedReadme = ReadmeBuilder.createBaseReadme()
    let sandbox: sinon.SinonSandbox

    const getFilePaths = (controllerSetup: ControllerSetup, uploadID: string): NewFileInfo[] => [
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

    async function createCodeGenState(
        sandbox: sinon.SinonSandbox,
        tabID: string,
        conversationID: string,
        uploadID: string
    ) {
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

        const codeGenState = new DocCodeGenState(
            testConfig,
            getFilePaths(controllerSetup, uploadID),
            [],
            [],
            tabID,
            0,
            {}
        )
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
    async function fireFollowUps(followUpTypes: FollowUpTypes[], stub: sinon.SinonStub, tabID: string) {
        for (const type of followUpTypes) {
            controllerSetup.emitters.followUpClicked.fire({
                tabID,
                followUp: { type },
            })
            await waitForStub(stub)
        }
    }

    async function waitForStub(stub: sinon.SinonStub) {
        await waitUntil(() => Promise.resolve(stub.callCount > 0), {})
    }

    async function performAction(
        action: 'generate' | 'update' | 'makeChanges' | 'accept' | 'edit',
        getSessionStub: sinon.SinonStub,
        message?: string,
        tabID = firstTabID,
        conversationID = firstConversationID
    ) {
        const sequences = {
            generate: FollowUpSequences.generateReadme,
            update: FollowUpSequences.updateReadme,
            edit: FollowUpSequences.editReadme,
            makeChanges: FollowUpSequences.makeChanges,
            accept: FollowUpSequences.acceptContent,
        }

        await fireFollowUps(sequences[action], getSessionStub, tabID)

        if ((action === 'makeChanges' || action === 'edit') && message) {
            controllerSetup.emitters.processHumanChatMessage.fire({
                tabID,
                conversationID,
                message,
            })
            await waitForStub(getSessionStub)
        }
    }

    async function setupTest(sandbox: sinon.SinonSandbox, isMultiTabs?: boolean, error?: ToolkitError) {
        controllerSetup = await createController(sandbox)
        session = await createCodeGenState(sandbox, firstTabID, firstConversationID, firstUploadID)
        sendDocTelemetrySpy = sandbox.stub(session, 'sendDocTelemetryEvent').resolves()
        sandbox.stub(session, 'preloader').resolves()
        error ? sandbox.stub(session, 'send').throws(error) : sandbox.stub(session, 'send').resolves()
        Object.defineProperty(session, '_conversationId', {
            value: firstConversationID,
            writable: true,
            configurable: true,
        })

        sandbox.stub(FileSystem.prototype, 'exists').resolves(false)
        if (isMultiTabs) {
            const secondSession = await createCodeGenState(sandbox, secondTabID, secondConversationID, secondUploadID)
            sendDocTelemetrySpyForSecondTab = sandbox.stub(secondSession, 'sendDocTelemetryEvent').resolves()
            sandbox.stub(secondSession, 'preloader').resolves()
            sandbox.stub(secondSession, 'send').resolves()
            Object.defineProperty(secondSession, '_conversationId', {
                value: secondConversationID,
                writable: true,
                configurable: true,
            })
            getSessionStub = sandbox
                .stub(controllerSetup.sessionStorage, 'getSession')
                .callsFake(async (tabId: string): Promise<Session> => {
                    if (tabId === firstTabID) {
                        return session
                    }
                    if (tabId === secondTabID) {
                        return secondSession
                    }
                    throw new Error(`Unknown tab ID: ${tabId}`)
                })
        } else {
            getSessionStub = sandbox.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)
        }
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
        isMultiTabs?: boolean,
        error?: ToolkitError,
        maxRetries: number = 3,
        delayMs: number = 1000
    ): Promise<void> => {
        let lastError: Error | undefined

        for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
            sandbox = sinon.createSandbox()
            sandbox.useFakeTimers({
                now: new Date('2025-03-20T12:00:00.000Z'),
                toFake: ['Date'],
            })
            try {
                await setupTest(sandbox, isMultiTabs, error)
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
                conversationId: firstConversationID,
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
                conversationId: firstConversationID,
            })

            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent: firstExpectedEvent,
                type: 'generation',
                sandbox,
            })

            await updateFilePaths(session, modifiedReadme, firstUploadID, docScheme, controllerSetup.workspaceFolder)
            await performAction('makeChanges', getSessionStub, 'add repository structure section')

            const secondExpectedEvent = createExpectedEvent({
                type: 'generation',
                ...EventMetrics.REPO_STRUCTURE,
                interactionType: 'GENERATE_README',
                conversationId: firstConversationID,
            })

            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent: secondExpectedEvent,
                type: 'generation',
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
                conversationId: firstConversationID,
            })

            await performAction('accept', getSessionStub)
            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent,
                type: 'acceptance',
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
                conversationId: firstConversationID,
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
            await updateFilePaths(session, modifiedReadme, firstUploadID, docScheme, controllerSetup.workspaceFolder)

            await performAction('makeChanges', getSessionStub, 'add data flow section')

            const expectedEvent = createExpectedEvent({
                type: 'generation',
                ...EventMetrics.DATA_FLOW,
                interactionType: 'UPDATE_README',
                conversationId: firstConversationID,
            })

            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent,
                type: 'generation',
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
                conversationId: firstConversationID,
            })

            await performAction('accept', getSessionStub)
            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent,
                type: 'acceptance',
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
                conversationId: firstConversationID,
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
                conversationId: firstConversationID,
            })

            await performAction('accept', getSessionStub)
            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent,
                type: 'acceptance',
                sandbox,
            })
        })
    })
    it('should emit separate telemetry events when executing /doc in different tabs', async () => {
        await retryTest(async () => {
            const firstSession = await getSessionStub(firstTabID)
            const secondSession = await getSessionStub(secondTabID)
            await performAction('generate', firstSession)
            await performAction('update', secondSession, undefined, secondTabID, secondConversationID)

            const expectedEvent = createExpectedEvent({
                type: 'generation',
                ...EventMetrics.INITIAL_README,
                interactionType: 'GENERATE_README',
                conversationId: firstConversationID,
            })

            await assertTelemetry({
                spy: sendDocTelemetrySpy,
                expectedEvent,
                type: 'generation',
                sandbox,
            })

            const expectedEventForSecondTab = createExpectedEvent({
                type: 'generation',
                ...EventMetrics.REPO_STRUCTURE,
                interactionType: 'UPDATE_README',
                conversationId: secondConversationID,
            })

            await assertTelemetry({
                spy: sendDocTelemetrySpyForSecondTab,
                expectedEvent: expectedEventForSecondTab,
                type: 'generation',
                sandbox,
            })
        }, true)
    })

    describe('Doc Generation Error Handling', () => {
        const errors = [
            {
                name: 'MonthlyConversationLimitError',
                error: new MonthlyConversationLimitError('Service Quota Exceeded'),
            },
            {
                name: 'DocGenerationGuardrailsException',
                error: new ApiClientError(
                    i18n('AWS.amazonq.doc.error.docGen.default'),
                    'GetTaskAssistCodeGeneration',
                    'GuardrailsException',
                    400
                ),
            },
            {
                name: 'DocGenerationEmptyPatchException',
                error: new LlmError(i18n('AWS.amazonq.doc.error.docGen.default'), {
                    code: 'EmptyPatchException',
                }),
            },
            {
                name: 'DocGenerationThrottlingException',
                error: new ApiClientError(
                    i18n('AWS.amazonq.featureDev.error.throttling'),
                    'GetTaskAssistCodeGeneration',
                    'ThrottlingException',
                    429
                ),
            },
            { name: 'UploadCodeError', error: new UploadCodeError('403: Forbiden') },
            { name: 'UserMessageNotFoundError', error: new UserMessageNotFoundError() },
            { name: 'TabIdNotFoundError', error: new TabIdNotFoundError() },
            { name: 'PrepareRepoFailedError', error: new PrepareRepoFailedError() },
            { name: 'PromptRefusalException', error: new PromptRefusalException(0) },
            { name: 'ZipFileError', error: new ZipFileError() },
            { name: 'CodeIterationLimitError', error: new CodeIterationLimitError() },
            { name: 'UploadURLExpired', error: new UploadURLExpired() },
            { name: 'NoChangeRequiredException', error: new NoChangeRequiredException() },
            { name: 'ReadmeTooLargeError', error: new ReadmeTooLargeError() },
            { name: 'ReadmeUpdateTooLargeError', error: new ReadmeUpdateTooLargeError(0) },
            { name: 'ContentLengthError', error: new ContentLengthError() },
            { name: 'WorkspaceEmptyError', error: new WorkspaceEmptyError() },
            { name: 'PromptUnrelatedError', error: new PromptUnrelatedError(0) },
            { name: 'PromptTooVagueError', error: new PromptTooVagueError(0) },
            { name: 'PromptRefusalException', error: new PromptRefusalException(0) },
            {
                name: 'default',
                error: new ApiServiceError(
                    i18n('AWS.amazonq.doc.error.docGen.default'),
                    'GetTaskAssistCodeGeneration',
                    'UnknownException',
                    500
                ),
            },
        ]
        for (const { name, error } of errors) {
            it(`should emit failure operation telemetry when ${name} occurs`, async () => {
                await retryTest(
                    async () => {
                        await performAction('generate', getSessionStub)

                        const expectedSuccessMetric = createExpectedMetricData(
                            MetricDataOperationName.StartDocGeneration,
                            MetricDataResult.Success
                        )
                        await assertTelemetry({
                            spy: sendDocTelemetrySpy,
                            expectedEvent: expectedSuccessMetric,
                            type: 'metric',
                            sandbox,
                        })

                        const expectedFailureMetric = createExpectedMetricData(
                            MetricDataOperationName.EndDocGeneration,
                            getMetricResult(error)
                        )
                        await assertTelemetry({
                            spy: sendDocTelemetrySpy,
                            expectedEvent: expectedFailureMetric,
                            type: 'metric',
                            sandbox,
                        })
                    },
                    undefined,
                    error
                )
            })
        }
    })
})
