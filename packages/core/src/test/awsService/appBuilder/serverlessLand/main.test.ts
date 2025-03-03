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
import * as main from '../../../../awsService/appBuilder/serverlessLand/main'
import {
    createNewServerlessLandProject,
    launchProjectCreationWizard,
    openReadmeFile,
    getProjectUri,
    downloadPatternCode,
} from '../../../../awsService/appBuilder/serverlessLand/main'
import * as workspaceUtils from '../../../../shared/utilities/workspaceUtils'
import { fs } from '../../../../shared/fs/fs'
import * as downloadPatterns from '../../../../shared/utilities/downloadPatterns'
import { assertTelemetryCurried } from '../../../testUtil'
import { CreateServerlessLandWizard } from '../../../../awsService/appBuilder/serverlessLand/wizard'
import { MetadataManager } from '../../../../awsService/appBuilder/serverlessLand/metadataManager'
import { ExtContext } from '../../../../shared/extensions'

describe('createNewServerlessLandProject', () => {
    let sandbox: sinon.SinonSandbox
    const mockExtContext = {
        awsContext: {
            getCredentials: () => Promise.resolve({}),
            getCredentialDefaultRegion: () => 'us-west-2',
        },
    } as unknown as ExtContext
    const assertTelemetry = assertTelemetryCurried('serverlessland_createProject')
    const mockWizardResponse = {
        name: 'test-project',
        location: vscode.Uri.file('/test'),
        pattern: 'test-pattern',
        runtime: 'nodejs',
        iac: 'sam',
        assetName: 'test-asset',
    }

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('successfully creates a new serverless land project', async () => {
        const wizardStub = sandbox.stub(main, 'launchProjectCreationWizard').resolves(mockWizardResponse)
        const metadataStub = sandbox
            .stub(MetadataManager.prototype, 'getAssetName')
            .withArgs('test-pattern', 'node.js', 'sam')
            .returns('test-asset')
        const downloadStub = sandbox.stub(main, 'downloadPatternCode').resolves()
        const readmeStub = sandbox.stub(main, 'openReadmeFile').resolves()
        const addFolderStub = sandbox.stub(workspaceUtils, 'addFolderToWorkspace').resolves()

        await main.createNewServerlessLandProject(mockExtContext)

        sandbox.assert.calledOnce(wizardStub)
        sandbox.assert.calledOnce(metadataStub)
        sandbox.assert.calledWith(downloadStub, mockWizardResponse, 'test-asset')
        sandbox.assert.calledOnce(readmeStub)
        sandbox.assert.calledWith(readmeStub, mockWizardResponse)
        sandbox.assert.calledOnce(addFolderStub)
        assertTelemetry({
            result: 'Succeeded',
        })
    })

    it('handles wizard cancellation', async () => {
        sandbox.stub(main, 'launchProjectCreationWizard').resolves(undefined)
        await createNewServerlessLandProject(mockExtContext)
        assertTelemetry({
            result: 'Failed',
            reason: 'Error',
        })
    })

    it('handles errors during project creation', async () => {
        sandbox.stub(main, 'launchProjectCreationWizard').resolves(mockWizardResponse)
        sandbox.stub(main, 'downloadPatternCode').rejects(new Error('Download failed'))
        await createNewServerlessLandProject(mockExtContext)
        assertTelemetry({
            result: 'Failed',
            reason: 'Error',
        })
    })
})

describe('launchProjectCreationWizard', () => {
    let sandbox: sinon.SinonSandbox
    const mockWizardResponse = {
        name: 'test-project',
        location: 'test-location',
        pattern: 'test-pattern',
        runtime: 'nodejs',
        iac: 'sam',
    }
    const mockExtContext = {
        awsContext: {
            getCredentials: () => Promise.resolve({}),
            getCredentialDefaultRegion: () => 'us-west-2',
        },
    } as unknown as ExtContext

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })
    afterEach(() => {
        sandbox.restore()
    })
    it('should launch wizard and return form data', async () => {
        const wizardRunStub = sandbox.stub().resolves(mockWizardResponse)
        sandbox.stub(CreateServerlessLandWizard.prototype, 'run').get(() => wizardRunStub)

        const result = await launchProjectCreationWizard(mockExtContext)

        sinon.assert.calledOnce(wizardRunStub)
        assert.deepStrictEqual(result, mockWizardResponse)
    })
    it('should return undefined when wizard is cancelled', async () => {
        const wizardRunStub = sandbox.stub().resolves(undefined)
        sandbox.stub(CreateServerlessLandWizard.prototype, 'run').get(() => wizardRunStub)

        const result = await launchProjectCreationWizard(mockExtContext)

        sinon.assert.calledOnce(wizardRunStub)
        assert.strictEqual(result, undefined)
    })
})

describe('downloadPatternCode', () => {
    let getPatternStub: sinon.SinonStub
    const assertTelemetry = assertTelemetryCurried('serverlessland_downloadPattern')

    beforeEach(function () {
        getPatternStub = sinon.stub(downloadPatterns, 'getPattern')
    })
    afterEach(function () {
        sinon.restore()
    })
    const mockConfig = {
        name: 'test-project',
        location: vscode.Uri.file('./test'),
        pattern: 'test-project-sam-python',
        runtime: 'python',
        iac: 'sam',
        assetName: 'test-project-sam-python',
    }
    it('successfully downloads pattern code', async () => {
        const mockAssetName = 'test-project-sam-python.zip'
        const serverlessLandOwner = 'aws-samples'
        const serverlessLandRepo = 'serverless-patterns'
        const mockLocation = vscode.Uri.joinPath(mockConfig.location, mockConfig.name)

        await downloadPatternCode(mockConfig, 'test-project-sam-python')
        assert(getPatternStub.calledOnce)
        assert(getPatternStub.firstCall.args[0] === serverlessLandOwner)
        assert(getPatternStub.firstCall.args[1] === serverlessLandRepo)
        assert(getPatternStub.firstCall.args[2] === mockAssetName)
        assert(getPatternStub.firstCall.args[3].toString() === mockLocation.toString())
        assert(getPatternStub.firstCall.args[4] === true)
    })
    it('handles download failure', async () => {
        const mockAssetName = 'test-project-sam-python.zip'
        const error = new Error('Download failed')
        getPatternStub.rejects(error)
        try {
            await downloadPatternCode(mockConfig, mockAssetName)
            assert.fail('Expected an error to be thrown')
        } catch (err: any) {
            assertTelemetry({
                result: 'Failed',
                reason: 'Error',
            })
            assert.strictEqual(err.message, 'Failed to download pattern: Error: Download failed')
        }
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
        sinon.assert.calledWith(uriFileStub, expectedPath)
        assert.strictEqual(result?.fsPath, expectedPath)
    })
    it('handles missing project directory', async () => {
        await assert.rejects(
            async () => await getProjectUri(mockConfig, ''),
            /expected "file" parameter to have at least one item/
        )
    })
})
