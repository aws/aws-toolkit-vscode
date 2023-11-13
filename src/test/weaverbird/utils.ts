/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { MessagePublisher } from '../../amazonq/messages/messagePublisher'
import { Messenger } from '../../weaverbird/controllers/chat/messenger/messenger'
import { AppToWebViewMessageDispatcher } from '../../weaverbird/views/connector/connector'
import { ChatControllerEventEmitters, WeaverbirdController } from '../../weaverbird/controllers/chat/controller'
import { ChatSessionStorage } from '../../weaverbird/storages/chatSession'
import { Session } from '../../weaverbird/session/session'
import { createSessionConfig } from '../../weaverbird/session/sessionConfigFactory'
import { createTestWorkspaceFolder } from '../testUtil'

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
    }
}

export async function createController({
    tabID,
    conversationID,
    uploadID,
}: {
    tabID: string
    conversationID: string
    uploadID: string
}) {
    const messenger = createMessenger()

    // Create a new workspace root
    const testWorkspaceFolder = await createTestWorkspaceFolder()
    sinon.stub(vscode.workspace, 'workspaceFolders').value([testWorkspaceFolder])

    const sessionStorage = new ChatSessionStorage(messenger)
    const sessionConfig = await createSessionConfig()

    const session = new Session(sessionConfig, messenger, tabID)

    sinon.stub(sessionStorage, 'getSession').resolves(session)
    sinon.stub(session, 'conversationId').get(() => conversationID)
    sinon.stub(session, 'uploadId').get(() => uploadID)

    const mockChatControllerEventEmitters = createMockChatEmitters()

    new WeaverbirdController(
        mockChatControllerEventEmitters,
        messenger,
        sessionStorage,
        sinon.createStubInstance(vscode.EventEmitter).event
    )

    return {
        emitters: mockChatControllerEventEmitters,
        session,
        workspaceFolder: testWorkspaceFolder,
        messenger,
    }
}
