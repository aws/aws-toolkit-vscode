/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { MessagePublisher } from '../../amazonq/messages/messagePublisher'
import { ChatControllerEventEmitters, DocController } from '../../amazonqDoc/controllers/chat/controller'
import { DocChatSessionStorage } from '../../amazonqDoc/storages/chatSession'
import { createTestWorkspaceFolder } from '../testUtil'
import { Session } from '../../amazonqDoc/session/session'
import { NewFileInfo, SessionState } from '../../amazonqDoc/types'
import { FeatureDevClient } from '../../amazonqFeatureDev/client/featureDev'
import { VirtualMemoryFile } from '../../shared/virtualMemoryFile'
import path from 'path'
import { docChat } from '../../amazonqDoc/constants'
import { DocMessenger } from '../../amazonqDoc/messenger'
import { AppToWebViewMessageDispatcher } from '../../amazonq/commons/connector/connectorMessages'
import { createSessionConfig } from '../../amazonq/commons/session/sessionConfigFactory'
import {
    DocV2GenerationEvent,
    DocV2AcceptanceEvent,
    MetricData,
} from '../../amazonqFeatureDev/client/featuredevproxyclient'
import { FollowUpTypes } from '../../amazonq/commons/types'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { LanguageClientAuth } from '../../auth/auth2'

export function createMessenger(sandbox: sinon.SinonSandbox): DocMessenger {
    return new DocMessenger(
        new AppToWebViewMessageDispatcher(new MessagePublisher(sandbox.createStubInstance(vscode.EventEmitter))),
        docChat
    )
}

export function createMockChatEmitters(): ChatControllerEventEmitters {
    return {
        processHumanChatMessage: new vscode.EventEmitter<any>(),
        followUpClicked: new vscode.EventEmitter<any>(),
        openDiff: new vscode.EventEmitter<any>(),
        processChatItemVotedMessage: new vscode.EventEmitter<any>(),
        processChatItemFeedbackMessage: new vscode.EventEmitter<any>(),
        stopResponse: new vscode.EventEmitter<any>(),
        tabOpened: new vscode.EventEmitter<any>(),
        tabClosed: new vscode.EventEmitter<any>(),
        authClicked: new vscode.EventEmitter<any>(),
        processResponseBodyLinkClick: new vscode.EventEmitter<any>(),
        insertCodeAtPositionClicked: new vscode.EventEmitter<any>(),
        fileClicked: new vscode.EventEmitter<any>(),
        formActionClicked: new vscode.EventEmitter<any>(),
    }
}

export interface ControllerSetup {
    emitters: ChatControllerEventEmitters
    workspaceFolder: vscode.WorkspaceFolder
    messenger: DocMessenger
    sessionStorage: DocChatSessionStorage
}

export async function createSession({
    messenger,
    sessionState,
    scheme,
    conversationID = '0',
    tabID = '0',
    uploadID = '0',
    sandbox,
}: {
    messenger: DocMessenger
    scheme: string
    sessionState?: Omit<SessionState, 'uploadId'>
    conversationID?: string
    tabID?: string
    uploadID?: string
    sandbox: sinon.SinonSandbox
}) {
    const sessionConfig = await createSessionConfig(scheme)

    const client = sandbox.createStubInstance(FeatureDevClient)
    client.createConversation.resolves(conversationID)
    const session = new Session(sessionConfig, messenger, tabID, sessionState, client)

    sandbox.stub(session, 'conversationId').get(() => conversationID)
    sandbox.stub(session, 'uploadId').get(() => uploadID)

    return session
}
export async function sessionRegisterProvider(session: Session, uri: vscode.Uri, fileContents: Uint8Array) {
    session.config.fs.registerProvider(uri, new VirtualMemoryFile(fileContents))
}

export function generateVirtualMemoryUri(uploadID: string, filePath: string, scheme: string) {
    const generationFilePath = path.join(uploadID, filePath)
    const uri = vscode.Uri.from({ scheme, path: generationFilePath })
    return uri
}

export async function sessionWriteFile(session: Session, uri: vscode.Uri, encodedContent: Uint8Array) {
    await session.config.fs.writeFile(uri, encodedContent, {
        create: true,
        overwrite: true,
    })
}

export function createMockAuthUtil(sandbox: sinon.SinonSandbox) {
    const mockLspAuth: Partial<LanguageClientAuth> = {
        registerSsoTokenChangedHandler: sinon.stub().resolves(),
    }
    AuthUtil.create(mockLspAuth as LanguageClientAuth)
    sandbox.stub(AuthUtil.instance.regionProfileManager, 'onDidChangeRegionProfile').resolves()
    sandbox.stub(AuthUtil.instance, 'getAuthState').returns('connected')
}

export async function createController(sandbox: sinon.SinonSandbox): Promise<ControllerSetup> {
    createMockAuthUtil(sandbox)
    const messenger = createMessenger(sandbox)

    // Create a new workspace root
    const testWorkspaceFolder = await createTestWorkspaceFolder()
    sandbox.stub(vscode.workspace, 'workspaceFolders').value([testWorkspaceFolder])

    const sessionStorage = new DocChatSessionStorage(messenger)

    const mockChatControllerEventEmitters = createMockChatEmitters()

    new DocController(
        mockChatControllerEventEmitters,
        messenger,
        sessionStorage,
        sandbox.createStubInstance(vscode.EventEmitter).event
    )

    return {
        emitters: mockChatControllerEventEmitters,
        workspaceFolder: testWorkspaceFolder,
        messenger,
        sessionStorage,
    }
}

export type EventParams = {
    type: 'generation' | 'acceptance'
    chars: number
    lines: number
    files: number
    interactionType: 'GENERATE_README' | 'UPDATE_README' | 'EDIT_README'
    callIndex?: number
    conversationId: string
}
/**
 * Metrics for measuring README content changes in documentation generation tests.
 */
export const EventMetrics = {
    /**
     * Initial README content measurements
     * Generated using ReadmeBuilder.createBaseReadme()
     */
    INITIAL_README: {
        chars: 265,
        lines: 16,
        files: 1,
    },
    /**
     * Repository Structure section measurements
     * Differential metrics when adding repository structure documentation compare to the initial readme
     */
    REPO_STRUCTURE: {
        chars: 60,
        lines: 8,
        files: 1,
    },
    /**
     * Data Flow section measurements
     * Differential metrics when adding data flow documentation compare to the initial readme
     */
    DATA_FLOW: {
        chars: 180,
        lines: 11,
        files: 1,
    },
} as const

export function createExpectedEvent(params: EventParams) {
    const baseEvent = {
        conversationId: params.conversationId,
        numberOfNavigations: 1,
        folderLevel: 'ENTIRE_WORKSPACE',
        interactionType: params.interactionType,
    }

    if (params.type === 'generation') {
        return {
            ...baseEvent,
            numberOfGeneratedChars: params.chars,
            numberOfGeneratedLines: params.lines,
            numberOfGeneratedFiles: params.files,
        } as DocV2GenerationEvent
    } else {
        return {
            ...baseEvent,
            numberOfAddedChars: params.chars,
            numberOfAddedLines: params.lines,
            numberOfAddedFiles: params.files,
            userDecision: 'ACCEPT',
        } as DocV2AcceptanceEvent
    }
}

export function createExpectedMetricData(operationName: string, result: string) {
    return {
        metricName: 'Operation',
        metricValue: 1,
        timestamp: new Date(),
        product: 'DocGeneration',
        dimensions: [
            {
                name: 'operationName',
                value: operationName,
            },
            {
                name: 'result',
                value: result,
            },
        ],
    }
}

export async function assertTelemetry(params: {
    spy: sinon.SinonStub
    expectedEvent: DocV2GenerationEvent | DocV2AcceptanceEvent | MetricData
    type: 'generation' | 'acceptance' | 'metric'
    sandbox: sinon.SinonSandbox
}) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    params.sandbox.assert.calledWith(params.spy, params.sandbox.match(params.expectedEvent), params.type)
}

export async function updateFilePaths(
    session: Session,
    content: string,
    uploadId: string,
    docScheme: string,
    workspaceFolder: any
) {
    const updatedFilePaths: NewFileInfo[] = [
        {
            zipFilePath: path.normalize('README.md'),
            relativePath: path.normalize('README.md'),
            fileContent: content,
            rejected: false,
            virtualMemoryUri: generateVirtualMemoryUri(uploadId, path.normalize('README.md'), docScheme),
            workspaceFolder: workspaceFolder,
            changeApplied: false,
        },
    ]

    Object.defineProperty(session.state, 'filePaths', {
        get: () => updatedFilePaths,
        configurable: true,
    })
}

export const FollowUpSequences = {
    generateReadme: [FollowUpTypes.NewTask, FollowUpTypes.CreateDocumentation, FollowUpTypes.ProceedFolderSelection],
    updateReadme: [
        FollowUpTypes.NewTask,
        FollowUpTypes.UpdateDocumentation,
        FollowUpTypes.SynchronizeDocumentation,
        FollowUpTypes.ProceedFolderSelection,
    ],
    editReadme: [
        FollowUpTypes.NewTask,
        FollowUpTypes.UpdateDocumentation,
        FollowUpTypes.EditDocumentation,
        FollowUpTypes.ProceedFolderSelection,
    ],
    makeChanges: [FollowUpTypes.MakeChanges],
    acceptContent: [FollowUpTypes.AcceptChanges],
}
