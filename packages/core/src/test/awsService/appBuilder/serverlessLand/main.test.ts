/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import * as sinon from 'sinon'
import * as path from 'path'
import { MetadataManager } from '../../../../awsService/appBuilder/serverlessLand/metadataManager'
import * as main from '../../../../awsService/appBuilder/serverlessLand/main'
import {
    createNewServerlessLandProject,
    openReadmeFile,
    getProjectUri,
    downloadPatternCode,
} from '../../../../awsService/appBuilder/serverlessLand/main'
import { getTestWindow } from '../../../shared/vscode/window'
import { fs } from '../../../../shared/fs/fs'
import * as downloadPatterns from '../../../../shared/utilities/downloadPatterns'
import { ExtContext } from '../../../../shared/extensions'
import { workspaceUtils } from '../../../../shared'
import * as downloadPattern from '../../../../shared/utilities/downloadPatterns'
import * as wizardModule from '../../../../awsService/appBuilder/serverlessLand/wizard'

describe('createNewServerlessLandProject', () => {
    let sandbox: sinon.SinonSandbox
    let mockExtContext: ExtContext
    let mockMetadataManager: sinon.SinonStubbedInstance<MetadataManager>
    let mockWizard: { run: sinon.SinonStub }

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        mockExtContext = {
            awsContext: {
                getCredentials: sandbox.stub().resolves({}),
                getCredentialDefaultRegion: () => 'us-west-2',
            },
        } as unknown as ExtContext

        mockMetadataManager = sandbox.createStubInstance(MetadataManager)
        mockMetadataManager.getAssetName.returns('test-asset-name')
        sandbox.stub(MetadataManager, 'getInstance').returns(mockMetadataManager as unknown as MetadataManager)

        mockWizard = { run: sandbox.stub() }
        sandbox.stub(wizardModule, 'CreateServerlessLandWizard').returns(mockWizard)

        sandbox.stub(vscode.Uri, 'joinPath').returns(vscode.Uri.file('/test'))
        sandbox.stub(vscode.commands, 'executeCommand').resolves()

        sandbox.stub(workspaceUtils, 'addFolderToWorkspace').resolves()
        sandbox.stub(downloadPattern, 'getPattern').resolves()
    })
    afterEach(() => {
        sandbox.restore()
    })
    it('should complete project creation successfully', async () => {
        const mockConfig = {
            pattern: 'testPattern',
            runtime: 'nodejs',
            iac: 'sam',
            location: vscode.Uri.file('/test'),
            name: 'testProject',
        }
        mockWizard.run.resolves(mockConfig)
        await createNewServerlessLandProject(mockExtContext)
        assert.strictEqual(mockWizard.run.calledOnce, true)
        assert.strictEqual(mockMetadataManager.getAssetName.calledOnce, true)
        assert.strictEqual((downloadPattern.getPattern as sinon.SinonStub).calledOnce, true)
    })
    it('should handle wizard cancellation', async () => {
        mockWizard.run.resolves(undefined)
        await createNewServerlessLandProject(mockExtContext)
        assert.strictEqual(mockWizard.run.calledOnce, true)
        assert.strictEqual(mockMetadataManager.getAssetName.called, false)
        assert.strictEqual((downloadPattern.getPattern as sinon.SinonStub).called, false)
    })
})

describe('downloadPatternCode', () => {
    let sandbox: sinon.SinonSandbox
    let getPatternStub: sinon.SinonStub
    let mockConfig: any

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        getPatternStub = sandbox.stub(downloadPatterns, 'getPattern')
        mockConfig = {
            name: 'test-project',
            location: vscode.Uri.file('/test'),
            pattern: 'test-project-sam-python',
            runtime: 'python',
            iac: 'sam',
            assetName: 'test-project-sam-python',
        }
    })
    afterEach(function () {
        sandbox.restore()
        getPatternStub.restore()
    })

    it('successfully downloads pattern code', async () => {
        const mockAssetName = 'test-project-sam-python.zip'
        const serverlessLandOwner = 'aws-samples'
        const serverlessLandRepo = 'serverless-patterns'
        const mockLocation = vscode.Uri.joinPath(mockConfig.location, mockConfig.name)

        await downloadPatternCode(mockConfig, mockConfig.assetName)
        assert(getPatternStub.calledOnce)
        assert(getPatternStub.firstCall.args[0] === serverlessLandOwner)
        assert(getPatternStub.firstCall.args[1] === serverlessLandRepo)
        assert(getPatternStub.firstCall.args[2] === mockAssetName)
        assert(getPatternStub.firstCall.args[3].toString() === mockLocation.toString())
        assert(getPatternStub.firstCall.args[4] === true)
    })
    it('handles download failure', async () => {
        const error = new Error('Download failed')
        getPatternStub.rejects(error)
        try {
            await downloadPatternCode(mockConfig, mockConfig.assetName)
            assert.fail('Expected an error to be thrown')
        } catch (err: any) {
            assert.strictEqual(err.message, 'Failed to download pattern: Error: Download failed')
        }
    })
    it('downloads pattern when directory exists and user confirms overwrite', async function () {
        const mockAssetName = 'test-project-sam-python.zip'
        const serverlessLandOwner = 'aws-samples'
        const serverlessLandRepo = 'serverless-patterns'
        const mockLocation = vscode.Uri.joinPath(mockConfig.location, mockConfig.name)

        getTestWindow().onDidShowMessage((message) => {
            message.selectItem('Yes')
        })

        await downloadPatternCode(mockConfig, mockConfig.assetName)
        assert(getPatternStub.calledOnce)
        assert(getPatternStub.firstCall.args[0] === serverlessLandOwner)
        assert(getPatternStub.firstCall.args[1] === serverlessLandRepo)
        assert(getPatternStub.firstCall.args[2] === mockAssetName)
        assert(getPatternStub.firstCall.args[3].toString() === mockLocation.toString())
        assert(getPatternStub.firstCall.args[4] === true)
    })
    it('aborts download when directory exists and user declines overwrite', async function () {
        const existsStub = sinon.stub(fs, 'exists').resolves(true)

        const messagePromise = new Promise<void>((resolve) => {
            getTestWindow().onDidShowMessage((message) => {
                resolve()
                message.selectItem('No')
            })
        })
        try {
            await Promise.all([messagePromise, downloadPatternCode(mockConfig, mockConfig.assetName)])
            assert.fail('A folder named test-project already exists in this path.')
        } catch (e) {
            assert.strictEqual((e as Error).message, `A folder named ${mockConfig.name} already exists in this path.`)
        }
        assert(getPatternStub.notCalled)
        existsStub.restore()
    })
})

describe('openReadmeFile', () => {
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')
    })

    afterEach(function () {
        sandbox.restore()
    })
    const mockConfig = {
        name: 'test-project',
        location: vscode.Uri.file('/test'),
        pattern: 'test-project-sam-python',
        runtime: 'python',
        iac: 'sam',
        assetName: 'test-project-sam-python',
    }
    it('successfully opens README file', async () => {
        const mockReadmeUri = vscode.Uri.file('/test/README.md')
        sandbox.stub(main, 'getProjectUri').resolves(mockReadmeUri)

        sandbox.stub(fs, 'exists').resolves(true)

        // When
        await openReadmeFile(mockConfig)
        // Then
        sandbox.assert.calledWith(spyExecuteCommand, 'workbench.action.focusFirstEditorGroup')
        sandbox.assert.calledWith(spyExecuteCommand, 'markdown.showPreview')
    })

    it('handles missing README file', async () => {
        const mockReadmeUri = vscode.Uri.file('/test/file.md')
        sandbox.stub(main, 'getProjectUri').resolves(mockReadmeUri)

        sandbox.stub(fs, 'exists').resolves(false)

        // When
        await openReadmeFile(mockConfig)
        // Then
        sandbox.assert.neverCalledWith(spyExecuteCommand, 'markdown.showPreview')
        assert.ok(true, 'Function should return without throwing error when README is not found')
    })

    it('handles error with opening README file', async () => {
        const mockReadmeUri = vscode.Uri.file('/test/README.md')
        sandbox.stub(main, 'getProjectUri').resolves(mockReadmeUri)

        sandbox.stub(fs, 'exists').rejects(new Error('File system error'))

        // When
        await assert.rejects(() => openReadmeFile(mockConfig), {
            name: 'Error',
            message: 'Error processing README file',
        })
        // Then
        sandbox.assert.neverCalledWith(spyExecuteCommand, 'markdown.showPreview')
    })
})

describe('getProjectUri', () => {
    const sandbox = sinon.createSandbox()
    beforeEach(() => {
        sandbox.restore()
    })
    afterEach(() => {
        sandbox.restore()
    })
    const mockConfig = {
        name: 'test-project',
        location: vscode.Uri.file('/test'),
        pattern: 'test-project-sam-python',
        runtime: 'python',
        iac: 'sam',
        assetName: 'test-project-sam-python',
    }
    it('returns Uri when file exists', async () => {
        const testFile = 'README.md'
        const expectedPath = path.resolve('/test', 'test-project', testFile)
        const uriFileStub = sandbox.stub(vscode.Uri, 'file').returns({
            fsPath: expectedPath,
        } as vscode.Uri)

        const result = await getProjectUri(mockConfig, testFile)
        sandbox.assert.calledWith(uriFileStub, expectedPath)
        assert.strictEqual(result?.fsPath, expectedPath)
    })
    it('handles missing project directory', async () => {
        await assert.rejects(
            async () => await getProjectUri(mockConfig, ''),
            /expected "file" parameter to have at least one item/
        )
    })
})
