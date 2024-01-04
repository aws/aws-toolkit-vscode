/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { MessagePublisher } from '../../amazonq/messages/messagePublisher'
import { Messenger } from '../../amazonqFeatureDev/controllers/chat/messenger/messenger'
import { AppToWebViewMessageDispatcher } from '../../amazonqFeatureDev/views/connector/connector'
import { ChatControllerEventEmitters, FeatureDevController } from '../../amazonqFeatureDev/controllers/chat/controller'
import { ChatSessionStorage } from '../../amazonqFeatureDev/storages/chatSession'
import { createTestWorkspaceFolder } from '../testUtil'
import { createSessionConfig } from '../../amazonqFeatureDev/session/sessionConfigFactory'
import { Session } from '../../amazonqFeatureDev/session/session'
import { SessionState } from '../../amazonqFeatureDev/types'
import { FeatureDevClient } from '../../amazonqFeatureDev/client/featureDev'

export function createMessenger(): Messenger {
    return new Messenger(
        new AppToWebViewMessageDispatcher(new MessagePublisher(sinon.createStubInstance(vscode.EventEmitter)))
    )
}

export function createMockChatEmitters(): ChatControllerEventEmitters {
    return {
        processHumanChatMessage: new vscode.EventEmitter<any>(),
        followUpClicked: new vscode.EventEmitter<any>(),
        openDiff: new vscode.EventEmitter<any>(),
        processChatItemVotedMessage: new vscode.EventEmitter<any>(),
        stopResponse: new vscode.EventEmitter<any>(),
        tabOpened: new vscode.EventEmitter<any>(),
        tabClosed: new vscode.EventEmitter<any>(),
        authClicked: new vscode.EventEmitter<any>(),
        processResponseBodyLinkClick: new vscode.EventEmitter<any>(),
        insertCodeAtPositionClicked: new vscode.EventEmitter<any>(),
    }
}

export interface ControllerSetup {
    emitters: ChatControllerEventEmitters
    workspaceFolder: vscode.WorkspaceFolder
    messenger: Messenger
    sessionStorage: ChatSessionStorage
}

export async function createSession({
    messenger,
    sessionState,
    conversationID = '0',
    tabID = '0',
    uploadID = '0',
}: {
    messenger: Messenger
    sessionState?: Omit<SessionState, 'uploadId'>
    conversationID?: string
    tabID?: string
    uploadID?: string
}) {
    const sessionConfig = await createSessionConfig()

    const client = sinon.createStubInstance(FeatureDevClient)
    client.createConversation.resolves(conversationID)
    const session = new Session(sessionConfig, messenger, tabID, sessionState, client)

    sinon.stub(session, 'conversationId').get(() => conversationID)
    sinon.stub(session, 'uploadId').get(() => uploadID)

    return session
}

export async function createController(): Promise<ControllerSetup> {
    const messenger = createMessenger()

    // Create a new workspace root
    const testWorkspaceFolder = await createTestWorkspaceFolder()
    sinon.stub(vscode.workspace, 'workspaceFolders').value([testWorkspaceFolder])

    const sessionStorage = new ChatSessionStorage(messenger)

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
