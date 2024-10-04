/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import assert from 'assert'
import {
    openApplicationComposerAfterReload,
    templateToOpenAppComposer,
} from '../../../awsService/appBuilder/activation'
import globals from '../../../shared/extensionGlobals'
import {
    RuntimeLocationWizard,
    genWalkthroughProject,
    openProjectInWorkspace,
} from '../../../awsService/appBuilder/walkthrough'
import { createWizardTester } from '../../shared/wizards/wizardTestUtils'
import { fs } from '../../../shared'
import { getTestWindow } from '../../shared/vscode/window'

describe('Reopen template after reload', function () {
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')
    })

    afterEach(function () {
        sandbox.restore()
    })

    // test openApplicationComposerAfterReload
    it('open template in appComposer', async function () {
        // Given
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        assert.ok(workspaceUri)
        const templateUri = vscode.Uri.joinPath(workspaceUri, '/path/to/template.yaml')
        await globals.globalState.update(templateToOpenAppComposer, [templateUri.fsPath])
        // When
        await openApplicationComposerAfterReload()
        // Then
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.openInApplicationComposer')
    })

    it('not open non-template in appComposer', async function () {
        // Given
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        assert.ok(workspaceUri)
        const templateUri = vscode.Uri.joinPath(workspaceUri, '/path/to/non-template.json')

        await globals.globalState.update(templateToOpenAppComposer, [templateUri.fsPath])
        // When
        await openApplicationComposerAfterReload()
        // Then
        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('should not open non-workspace template', async function () {
        const templateUri = vscode.Uri.file('/path/to/non-worksace/template.yaml')

        await globals.globalState.update(templateToOpenAppComposer, [templateUri.fsPath])

        await openApplicationComposerAfterReload()

        sandbox.assert.notCalled(spyExecuteCommand)
    })
})

describe('Wizard', function () {
    it('should not show runtime, should show file-selecotr', async function () {
        // When
        const tester = await createWizardTester(new RuntimeLocationWizard(true, 'open project'))
        // Then
        tester.runtime.assertDoesNotShow()
        tester.dir.applyInput('file-selector')
        tester.realDir.assertShowFirst()
    })

    it('should show runtime, should not show file-selector', async function () {
        // When
        const tester = await createWizardTester(new RuntimeLocationWizard(false, 'open project'))
        // Then
        tester.runtime.assertShowFirst()
        tester.dir.assertShowSecond()
        tester.dir.applyInput('workspace')
        tester.realDir.assertDoesNotShow()
    })
})

describe('Create project', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('open existing template', async function () {
        // Given
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        assert.ok(workspaceUri)
        // When
        await genWalkthroughProject('CustomTemplate', workspaceUri, undefined)
        // Then
        assert.equal(await fs.exists(vscode.Uri.joinPath(workspaceUri, 'template.yaml')), false)
    })

    it('build an app with appcomposer', async function () {
        // Given
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        assert.ok(workspaceUri)
        // When
        await genWalkthroughProject('Visual', workspaceUri, undefined)
        // Then
        assert.equal(await fs.exists(vscode.Uri.joinPath(workspaceUri, 'template.yaml')), true)
    })

    it('download serverlessland proj', async function () {
        // Given
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        assert.ok(workspaceUri)
        getTestWindow().onDidShowMessage((message) => {
            message.selectItem('Yes')
        })
        // When
        await genWalkthroughProject('API', workspaceUri, 'python')
        // Then
        assert.equal(await fs.exists(vscode.Uri.joinPath(workspaceUri, 'template.yaml')), true)
    })

    it('download serverlessland proj no overwrite', async function () {
        // Given existing template.yaml
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        assert.ok(workspaceUri)
        const prevInfo = await fs.readFileAsString(vscode.Uri.joinPath(workspaceUri, 'template.yaml'))
        // select do not overwrite
        getTestWindow().onDidShowMessage((message) => {
            message.selectItem('No')
        })
        try {
            // When
            await genWalkthroughProject('S3', workspaceUri, 'python')
        } catch (e) {
            assert.equal((e as Error).message, 'template.yaml already exist')
        }
        // Then no overwrite happens
        assert.equal(await fs.readFileAsString(vscode.Uri.joinPath(workspaceUri, 'template.yaml')), prevInfo)
    })
})

describe('Open project', function () {
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('open template.yaml', async function () {
        // Given
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        assert.ok(workspaceUri)
        // make sure yaml exist
        await fs.delete(vscode.Uri.joinPath(workspaceUri, 'template.yml'), { force: true })
        await fs.writeFile(vscode.Uri.joinPath(workspaceUri, 'template.yaml'), '')
        // When
        await openProjectInWorkspace(workspaceUri)
        // Then
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.openInApplicationComposer')
    })

    it('open template.yml', async function () {
        // Given
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        assert.ok(workspaceUri)
        // make sure yml exist
        await fs.delete(vscode.Uri.joinPath(workspaceUri, 'template.yaml'), { force: true })
        await fs.writeFile(vscode.Uri.joinPath(workspaceUri, 'template.yml'), '')
        // When
        await openProjectInWorkspace(workspaceUri)
        // Then
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.openInApplicationComposer')
    })

    it('both template.yml and template.yaml exist', async function () {
        // Given
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        assert.ok(workspaceUri)
        // make sure yml/yaml exist
        await fs.writeFile(vscode.Uri.joinPath(workspaceUri, 'template.yaml'), '')
        await fs.writeFile(vscode.Uri.joinPath(workspaceUri, 'template.yml'), '')
        // When
        await openProjectInWorkspace(workspaceUri)
        // Then only template.yaml is opened
        sandbox.assert.neverCalledWith(
            spyExecuteCommand,
            'aws.openInApplicationComposer',
            vscode.Uri.joinPath(workspaceUri, 'template.yml')
        )
    })

    it('no template.yml or template.yaml exist', async function () {
        // Given
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        assert.ok(workspaceUri)
        // make sure yml/yaml doesn't exist
        await fs.delete(vscode.Uri.joinPath(workspaceUri, 'template.yaml'), { force: true })
        await fs.delete(vscode.Uri.joinPath(workspaceUri, 'template.yml'), { force: true })
        // When
        await openProjectInWorkspace(workspaceUri)
        // Then only template.yaml is opened
        sandbox.assert.neverCalledWith(spyExecuteCommand, 'aws.openInApplicationComposer')
    })
})
