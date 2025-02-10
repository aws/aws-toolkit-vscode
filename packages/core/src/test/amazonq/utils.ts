/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { MessagePublisher } from '../../amazonq/messages/messagePublisher'
import { ChatControllerEventEmitters, FeatureDevController } from '../../amazonqFeatureDev/controllers/chat/controller'
import { FeatureDevChatSessionStorage } from '../../amazonqFeatureDev/storages/chatSession'
import { createTestWorkspaceFolder } from '../testUtil'
import { Session } from '../../amazonqFeatureDev/session/session'
import { SessionState, SessionStateAction, SessionStateConfig } from '../../amazonq/commons/types'
import { FeatureDevClient } from '../../amazonqFeatureDev/client/featureDev'
import { VirtualMemoryFile } from '../../shared/virtualMemoryFile'
import path from 'path'
import { featureDevChat } from '../../amazonqFeatureDev/constants'
import { Messenger } from '../../amazonq/commons/connector/baseMessenger'
import { AppToWebViewMessageDispatcher } from '../../amazonq/commons/connector/connectorMessages'
import { createSessionConfig } from '../../amazonq/commons/session/sessionConfigFactory'
import { VirtualFileSystem } from '../../shared'
import { TelemetryHelper } from '../../amazonq/util/telemetryHelper'
import { FeatureClient } from '../../amazonq/client/client'

export function createMessenger(): Messenger {
    return new Messenger(
        new AppToWebViewMessageDispatcher(new MessagePublisher(sinon.createStubInstance(vscode.EventEmitter))),
        featureDevChat
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
        storeCodeResultMessageId: new vscode.EventEmitter<any>(),
    }
}

export interface ControllerSetup {
    emitters: ChatControllerEventEmitters
    workspaceFolder: vscode.WorkspaceFolder
    messenger: Messenger
    sessionStorage: FeatureDevChatSessionStorage
}

export async function createSession({
    messenger,
    sessionState,
    scheme,
    conversationID = '0',
    tabID = '0',
    uploadID = '0',
}: {
    messenger: Messenger
    scheme: string
    sessionState?: Omit<SessionState, 'uploadId'>
    conversationID?: string
    tabID?: string
    uploadID?: string
}) {
    const sessionConfig = await createSessionConfig(scheme)

    const client = sinon.createStubInstance(FeatureDevClient)
    client.createConversation.resolves(conversationID)
    const session = new Session(sessionConfig, messenger, tabID, sessionState, client)

    sinon.stub(session, 'conversationId').get(() => conversationID)
    sinon.stub(session, 'uploadId').get(() => uploadID)

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

export async function createController(): Promise<ControllerSetup> {
    const messenger = createMessenger()

    // Create a new workspace root
    const testWorkspaceFolder = await createTestWorkspaceFolder()
    sinon.stub(vscode.workspace, 'workspaceFolders').value([testWorkspaceFolder])

    const sessionStorage = new FeatureDevChatSessionStorage(messenger)

    const mockChatControllerEventEmitters = createMockChatEmitters()

    new FeatureDevController(
        mockChatControllerEventEmitters,
        messenger,
        sessionStorage,
        sinon.createStubInstance(vscode.EventEmitter).event
    )

    return {
        emitters: mockChatControllerEventEmitters,
        workspaceFolder: testWorkspaceFolder,
        messenger,
        sessionStorage,
    }
}

export function createMockSessionStateAction(msg?: string): SessionStateAction {
    return {
        task: 'test-task',
        msg: msg ?? 'test-msg',
        fs: new VirtualFileSystem(),
        messenger: new Messenger(
            new AppToWebViewMessageDispatcher(new MessagePublisher<any>(new vscode.EventEmitter<any>())),
            featureDevChat
        ),
        telemetry: new TelemetryHelper(),
        uploadHistory: {},
    }
}

export interface TestSessionMocks {
    getCodeGeneration?: sinon.SinonStub
    exportResultArchive?: sinon.SinonStub
    createUploadUrl?: sinon.SinonStub
}

export interface SessionTestConfig {
    conversationId: string
    uploadId: string
    workspaceFolder: vscode.WorkspaceFolder
    currentCodeGenerationId?: string
}

export function createMockSessionStateConfig(config: SessionTestConfig, mocks: TestSessionMocks): SessionStateConfig {
    return {
        workspaceRoots: ['fake-source'],
        workspaceFolders: [config.workspaceFolder],
        conversationId: config.conversationId,
        proxyClient: {
            createConversation: () => sinon.stub(),
            createUploadUrl: () => mocks.createUploadUrl!(),
            startCodeGeneration: () => sinon.stub(),
            getCodeGeneration: () => mocks.getCodeGeneration!(),
            exportResultArchive: () => mocks.exportResultArchive!(),
        } as unknown as FeatureClient,
        uploadId: config.uploadId,
        currentCodeGenerationId: config.currentCodeGenerationId,
    }
}

export async function createBasicTestConfig(
    conversationId: string = 'conversation-id',
    uploadId: string = 'upload-id',
    currentCodeGenerationId: string = ''
): Promise<SessionTestConfig> {
    return {
        conversationId,
        uploadId,
        workspaceFolder: await createTestWorkspaceFolder('fake-root'),
        currentCodeGenerationId,
    }
}
