/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'

import sinon from 'sinon'
import { ControllerSetup, createController, createMessenger, createSession } from '../utils'
import { Session } from '../../../amazonqFeatureDev/session/session'
import { assertTelemetry } from '../../testUtil'
import { CurrentWsFolders } from '../../../amazonqFeatureDev/types'
import { CodeGenState } from '../../../amazonqFeatureDev/session/sessionState'
import { FeatureDevClient } from '../../../amazonqFeatureDev/client/featureDev'
import { FileSystemCommon } from '../../../srcShared/fs'
import { waitUntil } from '../../../shared/utilities/timeoutUtils'
import { VirtualFileSystem } from '../../../shared/virtualFilesystem'
import path from 'path'

describe('session', () => {
    const conversationID = '12345'
    const messenger = createMessenger()
    let session: Session

    describe('preloader', () => {
        beforeEach(async () => {
            session = await createSession({ messenger, conversationID })
        })

        afterEach(() => {
            sinon.restore()
        })

        it('emits start chat telemetry', async () => {
            await session.preloader('implement twosum in typescript')

            assertTelemetry('amazonq_startConversationInvoke', {
                amazonqConversationId: conversationID,
            })
        })
    })
    describe('insertChanges', async () => {
        const controllerSetup: ControllerSetup = await createController()

        const workspaceFolder = controllerSetup.workspaceFolder

        beforeEach(async () => {
            const uploadID = '789'
            const tabID = '123'
            const workspaceFolders = [controllerSetup.workspaceFolder] as CurrentWsFolders

            sinon.stub(VirtualFileSystem.prototype)

            const testConfig = {
                conversationId: conversationID,
                proxyClient: {
                    createConversation: () => sinon.stub(),
                    createUploadUrl: () => sinon.stub(),
                    generatePlan: () => sinon.stub(),
                    startCodeGeneration: () => sinon.stub(),
                    getCodeGeneration: () => sinon.stub(),
                    exportResultArchive: () => sinon.stub(),
                } as unknown as FeatureDevClient,
                sourceRoots: [''],
                uploadId: uploadID,
                workspaceFolders,
            }
            const testApproach = 'test-approach'

            const codeGenState = new CodeGenState(
                testConfig,
                testApproach,
                [
                    {
                        zipFilePath: 'myfile.js',
                        relativePath: 'myfile.js',
                        fileContent: '',
                        rejected: false,
                        virtualMemoryUri: '' as unknown as vscode.Uri,
                        workspaceFolder,
                    },
                    {
                        zipFilePath: 'myfile_1.js',
                        relativePath: 'myfile_1.js',
                        fileContent: '',
                        rejected: true,
                        virtualMemoryUri: '' as unknown as vscode.Uri,
                        workspaceFolder: controllerSetup.workspaceFolder,
                    },
                ],
                [],
                [],
                tabID,
                0
            )
            session = await createSession({ messenger, sessionState: codeGenState, conversationID })
        })
        afterEach(() => {
            sinon.restore()
        })
        it('only insert non rejected files', async () => {
            const fsStub = sinon.stub(FileSystemCommon.instance, 'writeFile').resolves()

            await session.insertChanges()

            await waitUntil(() => {
                return Promise.resolve(fsStub.callCount > 0)
            }, {})

            const absolutePath = path.join(workspaceFolder.uri.fsPath, 'myfile.js')
            assert.ok(fsStub.calledOnce)
            assert.ok(fsStub.calledWith(absolutePath, ''))
        })
    })
})
