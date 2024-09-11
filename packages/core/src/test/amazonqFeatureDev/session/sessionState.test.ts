/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import { MockCodeGenState, CodeGenState, PrepareCodeGenState } from '../../../amazonqFeatureDev/session/sessionState'
import { VirtualFileSystem } from '../../../shared/virtualFilesystem'
import { SessionStateConfig, SessionStateAction } from '../../../amazonqFeatureDev/types'
import { Messenger } from '../../../amazonqFeatureDev/controllers/chat/messenger/messenger'
import { AppToWebViewMessageDispatcher } from '../../../amazonqFeatureDev/views/connector/connector'
import { MessagePublisher } from '../../../amazonq/messages/messagePublisher'
import { FeatureDevClient } from '../../../amazonqFeatureDev/client/featureDev'
import { ToolkitError } from '../../../shared/errors'
import * as crypto from '../../../shared/crypto'
import { TelemetryHelper } from '../../../amazonqFeatureDev/util/telemetryHelper'
import { createTestWorkspaceFolder } from '../../testUtil'

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
    workspaceRoots: ['fake-source'],
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

    describe('MockCodeGenState', () => {
        it('loops forever in the same state', async () => {
            sinon.stub(crypto, 'randomUUID').returns('upload-id' as ReturnType<(typeof crypto)['randomUUID']>)
            const testAction = mockSessionStateAction()
            const state = new MockCodeGenState(testConfig, tabId)
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
                return new PrepareCodeGenState(testConfig, [], [], [], tabId, 0).interact(testAction)
            })
        })
    })

    describe('CodeGenState', () => {
        it('transitions to PrepareCodeGenState when codeGenerationStatus ready ', async () => {
            mockGetCodeGeneration = sinon.stub().resolves({
                codeGenerationStatus: { status: 'Complete' },
                codeGenerationRemainingIterationCount: 2,
                codeGenerationTotalIterationCount: 3,
            })
            mockExportResultArchive = sinon.stub().resolves({ newFileContents: [], deletedFiles: [], references: [] })

            const testAction = mockSessionStateAction()
            const state = new CodeGenState(testConfig, [], [], [], tabId, 0, 2, 3)
            const result = await state.interact(testAction)

            const nextState = new PrepareCodeGenState(testConfig, [], [], [], tabId, 1, 2, 3)

            assert.deepStrictEqual(result, {
                nextState,
                interaction: {},
            })
        })

        it('fails when codeGenerationStatus failed ', async () => {
            mockGetCodeGeneration = sinon.stub().rejects(new ToolkitError('Code generation failed'))
            const testAction = mockSessionStateAction()
            const state = new CodeGenState(testConfig, [], [], [], tabId, 0)
            try {
                await state.interact(testAction)
                assert.fail('failed code generations should throw an error')
            } catch (e: any) {
                assert.deepStrictEqual(e.message, 'Code generation failed')
            }
        })
    })
})
