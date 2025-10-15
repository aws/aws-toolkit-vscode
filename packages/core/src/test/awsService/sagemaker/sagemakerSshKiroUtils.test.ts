/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as path from 'path'
// Import methods only for typing, actual functions will be dynamically imported
import type {
    findEmbeddedSageMakerSshKiroExtension as findEmbeddedSageMakerSshKiroExtensionStatic,
    ensureSageMakerSshKiroExtension as ensureSageMakerSshKiroExtensionStatic,
    getKiroVersion as getKiroVersionStatic,
} from '../../../awsService/sagemaker/sagemakerSshKiroUtils'
import { VSCODE_EXTENSION_ID } from '../../../shared/extensions'
import { assertLogsContain } from '../../globalSetup.test'
import assert from 'assert'
import { getTestWindow } from '../../shared/vscode/window'
import fs from '../../../shared/fs/fs'

describe('SageMaker SSH Kiro Utils', () => {
    const resourcesDir = '/mock/extension/path/resources'

    let sandbox: sinon.SinonSandbox
    let mockContext: vscode.ExtensionContext
    let readFileTextStub: sinon.SinonStub

    // Dynamically imported functions with fresh module state
    let findEmbeddedSageMakerSshKiroExtension: typeof findEmbeddedSageMakerSshKiroExtensionStatic
    let ensureSageMakerSshKiroExtension: typeof ensureSageMakerSshKiroExtensionStatic
    let getKiroVersion: typeof getKiroVersionStatic

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        mockContext = {
            asAbsolutePath: (relativePath: string) => path.join('/mock/extension/path', relativePath),
        } as vscode.ExtensionContext

        // Mock product.json reading
        readFileTextStub = sandbox.stub(fs, 'readFileText')
        readFileTextStub.resolves(JSON.stringify({ version: '0.3.0' }))

        // Mock vscode.env.appRoot
        sandbox.stub(vscode.env, 'appRoot').value('/mock/vscode/app')

        // Get fresh module instance for each test to reset cached state
        const freshModule = require('../../../awsService/sagemaker/sagemakerSshKiroUtils')
        findEmbeddedSageMakerSshKiroExtension = freshModule.findEmbeddedSageMakerSshKiroExtension
        ensureSageMakerSshKiroExtension = freshModule.ensureSageMakerSshKiroExtension
        getKiroVersion = freshModule.getKiroVersion
    })

    afterEach(() => {
        sandbox.restore()

        // Clear module cache to reset cached state for dynamic imports
        for (const key of Object.keys(require.cache)) {
            if (key.includes('sagemakerSshKiroUtils')) {
                delete require.cache[key]
            }
        }
    })

    describe('findEmbeddedSageMakerSshKiroExtension', () => {
        it('finds extension with valid version pattern', async () => {
            const expectedPath = path.join(resourcesDir, 'sagemaker-ssh-kiro-0.1.0.vsix')
            sandbox.stub(require('glob'), 'glob').resolves([expectedPath])

            const result = await findEmbeddedSageMakerSshKiroExtension(mockContext)

            assert.strictEqual(result.version, '0.1.0')
            assert.strictEqual(result.path, expectedPath)
        })

        it('throws error when multiple VSIX files found', async () => {
            const firstPath = path.join(resourcesDir, 'sagemaker-ssh-kiro-0.1.0.vsix')
            const secondPath = path.join(resourcesDir, 'sagemaker-ssh-kiro-0.2.0.vsix')
            sandbox.stub(require('glob'), 'glob').resolves([firstPath, secondPath])

            await assert.rejects(() => findEmbeddedSageMakerSshKiroExtension(mockContext), /found multiple/i)
        })

        it('throws error when no VSIX files found', async () => {
            sandbox.stub(require('glob'), 'glob').resolves([])

            await assert.rejects(() => findEmbeddedSageMakerSshKiroExtension(mockContext), /not found/i)
        })

        it('throws error when filename does not match expected pattern', async () => {
            const invalidPath = path.join(resourcesDir, 'invalid-filename.vsix')
            sandbox.stub(require('glob'), 'glob').resolves([invalidPath])

            await assert.rejects(
                () => findEmbeddedSageMakerSshKiroExtension(mockContext),
                /Failed to extract version number/i
            )
        })

        it('throws error when glob operation fails', async () => {
            sandbox.stub(require('glob'), 'glob').rejects(new Error('Permission denied'))

            await assert.rejects(() => findEmbeddedSageMakerSshKiroExtension(mockContext), /Permission denied/i)
        })
    })

    describe('getKiroVersion', () => {
        it('reads version from product.json', async () => {
            readFileTextStub.resolves(JSON.stringify({ version: '0.4.0' }))

            const version = await getKiroVersion()

            assert.strictEqual(version, '0.4.0')
            sinon.assert.calledWith(readFileTextStub, path.join('/mock', 'vscode', 'app', 'product.json'))
        })

        it('caches product.json after first read', async () => {
            readFileTextStub.resolves(JSON.stringify({ version: '0.4.0' }))

            await getKiroVersion()
            await getKiroVersion()

            sinon.assert.calledOnce(readFileTextStub)
        })
    })

    describe('ensureSageMakerSshKiroExtension', () => {
        let getExtensionStub: sinon.SinonStub
        let executeCommandStub: sinon.SinonStub

        beforeEach(() => {
            const expectedPath = path.join(resourcesDir, 'sagemaker-ssh-kiro-0.1.0.vsix')
            sandbox.stub(require('glob'), 'glob').resolves([expectedPath])

            getExtensionStub = sandbox.stub(vscode.extensions, 'getExtension')
            executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand')
        })

        it('throws error when Kiro version is too old', async () => {
            readFileTextStub.resolves(JSON.stringify({ version: '0.2.9' }))

            await assert.rejects(
                () => ensureSageMakerSshKiroExtension(mockContext),
                /requires.+version 0\.3\.0 or higher \(current: 0\.2\.9\)/i
            )
        })

        it('succeeds when Kiro version meets minimum requirement', async () => {
            readFileTextStub.resolves(JSON.stringify({ version: '0.3.0' }))
            getExtensionStub
                .withArgs(VSCODE_EXTENSION_ID.sagemakerSshKiro)
                .returns({ packageJSON: { version: '0.1.0' } })

            await ensureSageMakerSshKiroExtension(mockContext)

            assertLogsContain('meets minimum requirement', false, 'info')
        })

        it('succeeds when Kiro version exceeds minimum requirement', async () => {
            readFileTextStub.resolves(JSON.stringify({ version: '0.4.0' }))
            getExtensionStub
                .withArgs(VSCODE_EXTENSION_ID.sagemakerSshKiro)
                .returns({ packageJSON: { version: '0.1.0' } })

            await ensureSageMakerSshKiroExtension(mockContext)

            assertLogsContain('meets minimum requirement', false, 'info')
        })

        it('returns early when correct version already installed', async () => {
            const mockExtension = { packageJSON: { version: '0.1.0' } }
            getExtensionStub.withArgs(VSCODE_EXTENSION_ID.sagemakerSshKiro).returns(mockExtension)

            await ensureSageMakerSshKiroExtension(mockContext)

            assertLogsContain('already installed', false, 'info')
            assert.equal(getTestWindow().shownMessages.length, 0)
            sinon.assert.notCalled(executeCommandStub)
        })

        it('prompts for install when extension not installed', async () => {
            getExtensionStub.withArgs(VSCODE_EXTENSION_ID.sagemakerSshKiro).returns(undefined)

            getTestWindow().onDidShowMessage((message) => {
                if (message.message.match(/needs to be installed.*install version 0\.1\.0/i)) {
                    message.selectItem('Install')
                    return
                }
            })

            await ensureSageMakerSshKiroExtension(mockContext)

            sinon.assert.calledWith(
                executeCommandStub,
                'workbench.extensions.installExtension',
                vscode.Uri.file('/mock/extension/path/resources/sagemaker-ssh-kiro-0.1.0.vsix')
            )
        })

        it('prompts for update when older version installed', async () => {
            getExtensionStub
                .withArgs(VSCODE_EXTENSION_ID.sagemakerSshKiro)
                .returns({ packageJSON: { version: '0.0.9' } })

            getTestWindow().onDidShowMessage((message) => {
                if (message.message.match(/needs to be updated.*from version 0.0.9 to 0.1.0/i)) {
                    message.selectItem('Update')
                    return
                }
            })

            await ensureSageMakerSshKiroExtension(mockContext)

            await getTestWindow().waitForMessage(/updated to version 0.1.0/i)
            sinon.assert.calledWith(
                executeCommandStub,
                'workbench.extensions.installExtension',
                vscode.Uri.file('/mock/extension/path/resources/sagemaker-ssh-kiro-0.1.0.vsix')
            )
        })

        it('prompts for update when newer version installed', async () => {
            getExtensionStub
                .withArgs(VSCODE_EXTENSION_ID.sagemakerSshKiro)
                .returns({ packageJSON: { version: '0.1.1' } })

            getTestWindow().onDidShowMessage((message) => {
                if (message.message.match(/needs to be updated.*from version 0.1.1 to 0.1.0/i)) {
                    message.selectItem('Update')
                    return
                }
            })

            await ensureSageMakerSshKiroExtension(mockContext)

            await getTestWindow().waitForMessage(/updated to version 0.1.0/i)
            sinon.assert.calledWith(
                executeCommandStub,
                'workbench.extensions.installExtension',
                vscode.Uri.file('/mock/extension/path/resources/sagemaker-ssh-kiro-0.1.0.vsix')
            )
        })

        it('throws error when user declines installation', async () => {
            getExtensionStub.withArgs(VSCODE_EXTENSION_ID.sagemakerSshKiro).returns(undefined)

            getTestWindow().onDidShowMessage((message) => {
                if (message.message.match(/needs to be installed/i)) {
                    message.selectItem('Cancel')
                    return
                }
            })

            await assert.rejects(() => ensureSageMakerSshKiroExtension(mockContext), /User declined to install/i)
            sinon.assert.notCalled(executeCommandStub)
        })

        it('throws error when user declines update', async () => {
            getExtensionStub
                .withArgs(VSCODE_EXTENSION_ID.sagemakerSshKiro)
                .returns({ packageJSON: { version: '0.0.9' } })

            getTestWindow().onDidShowMessage((message) => {
                if (message.message.match(/needs to be updated/i)) {
                    message.selectItem('Cancel')
                    return
                }
            })

            await assert.rejects(() => ensureSageMakerSshKiroExtension(mockContext), /User declined to update/i)
            sinon.assert.notCalled(executeCommandStub)
        })
    })
})
