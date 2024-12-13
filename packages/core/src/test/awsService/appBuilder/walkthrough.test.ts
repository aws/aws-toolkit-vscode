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

import { AwsClis, installCli } from '../../../shared/utilities/cliUtils'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { assertTelemetryCurried } from '../../testUtil'
import { HttpResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'
import { SamCliInfoInvocation } from '../../../shared/sam/cli/samCliInfo'
import { CodeScansState } from '../../../codewhisperer'

interface TestScenario {
    toolID: AwsClis
    platform: string
    shouldSucceed: boolean
}

const scenarios: TestScenario[] = [
    {
        toolID: 'aws-cli',
        platform: 'win32',
        shouldSucceed: true,
    },
    {
        toolID: 'sam-cli',
        platform: 'win32',
        shouldSucceed: true,
    },
    {
        toolID: 'docker',
        platform: 'win32',
        shouldSucceed: true,
    },
    {
        toolID: 'aws-cli',
        platform: 'darwin',
        shouldSucceed: true,
    },
    {
        toolID: 'sam-cli',
        platform: 'darwin',
        shouldSucceed: true,
    },
    {
        toolID: 'docker',
        platform: 'darwin',
        shouldSucceed: true,
    },
    {
        toolID: 'aws-cli',
        platform: 'linux',
        shouldSucceed: false,
    },
    {
        toolID: 'sam-cli',
        platform: 'linux',
        shouldSucceed: false,
    },
    {
        toolID: 'docker',
        platform: 'linux',
        shouldSucceed: false,
    },
]

describe('AppBuilder Walkthrough', function () {
    before(async function () {
        // ensure auto scan is disabled before testrun
        await CodeScansState.instance.setScansEnabled(false)
        assert.strictEqual(CodeScansState.instance.isScansEnabled(), false)
    })

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
            tester.runtime.applyInput('python')
            tester.dir.applyInput('workspace')
            tester.runtime.assertValue('python')
            tester.realDir.assertDoesNotShow()
        })
    })

    describe('Create project', function () {
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        const prevInfo = 'random text'
        assert.ok(workspaceUri)

        before(async function () {
            await fs.delete(vscode.Uri.joinPath(workspaceUri, 'template.yaml'), { force: true })
        })

        beforeEach(async function () {
            await fs.writeFile(vscode.Uri.joinPath(workspaceUri, 'template.yaml'), prevInfo)
        })

        afterEach(async function () {
            await fs.delete(vscode.Uri.joinPath(workspaceUri, 'template.yaml'), { force: true })
        })

        it('open existing template', async function () {
            // Given no template exist
            await fs.delete(vscode.Uri.joinPath(workspaceUri, 'template.yaml'), { force: true })
            // When
            await genWalkthroughProject('CustomTemplate', workspaceUri, undefined)
            // Then nothing should be created
            assert.equal(await fs.exists(vscode.Uri.joinPath(workspaceUri, 'template.yaml')), false)
        })

        it('build an app with appcomposer overwrite', async function () {
            getTestWindow().onDidShowMessage((message) => {
                message.selectItem('Yes')
            })
            // When
            await genWalkthroughProject('Visual', workspaceUri, undefined)
            // Then
            assert.notEqual(await fs.readFileText(vscode.Uri.joinPath(workspaceUri, 'template.yaml')), prevInfo)
        })

        it('build an app with appcomposer no overwrite', async function () {
            // Given
            getTestWindow().onDidShowMessage((message) => {
                message.selectItem('No')
            })
            // When
            try {
                // When
                await genWalkthroughProject('Visual', workspaceUri, undefined)
                assert.fail('template.yaml already exist')
            } catch (e) {
                assert.equal((e as Error).message, 'template.yaml already exist')
            }
            // Then
            assert.equal(await fs.readFileText(vscode.Uri.joinPath(workspaceUri, 'template.yaml')), prevInfo)
        })

        it('download serverlessland proj', async function () {
            // Given
            // select overwrite
            getTestWindow().onDidShowMessage((message) => {
                message.selectItem('Yes')
            })
            // When
            await genWalkthroughProject('API', workspaceUri, 'python')
            // Then template should be overwritten
            assert.equal(await fs.exists(vscode.Uri.joinPath(workspaceUri, 'template.yaml')), true)
            assert.notEqual(await fs.readFileText(vscode.Uri.joinPath(workspaceUri, 'template.yaml')), prevInfo)
        })

        it('download serverlessland proj no overwrite', async function () {
            // Given existing template.yaml
            // select do not overwrite
            getTestWindow().onDidShowMessage((message) => {
                message.selectItem('No')
            })
            try {
                // When
                await genWalkthroughProject('S3', workspaceUri, 'python')
                assert.fail('template.yaml already exist')
            } catch (e) {
                assert.equal((e as Error).message, 'template.yaml already exist')
            }
            // Then no overwrite happens
            assert.equal(await fs.readFileText(vscode.Uri.joinPath(workspaceUri, 'template.yaml')), prevInfo)
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
            sandbox.assert.calledWith(
                spyExecuteCommand,
                'aws.openInApplicationComposer',
                sinon.match.has('path', sinon.match(/template.yaml/g))
            )
            sandbox.assert.neverCalledWith(
                spyExecuteCommand,
                'aws.openInApplicationComposer',
                sinon.match.has('path', sinon.match(/template.yml/g))
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

    describe('Tool install', function () {
        let sandbox: sinon.SinonSandbox
        const originalPlatform = process.platform
        const originalArch = process.arch
        const assertTelemetry = assertTelemetryCurried('aws_toolInstallation')

        before(function () {
            Object.defineProperty(process, 'arch', {
                value: 'x64',
            })
        })

        beforeEach(function () {
            sandbox = sinon.createSandbox()
        })

        afterEach(function () {
            sandbox.restore()
        })

        after(function () {
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
            })
            Object.defineProperty(process, 'arch', {
                value: originalArch,
            })
        })

        for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex++) {
            const scenario = scenarios[scenarioIndex]

            it(`Install ${scenario.toolID} on ${scenario.platform}`, async function () {
                // Given
                Object.defineProperty(process, 'platform', {
                    value: scenario.platform,
                })
                const downloader = sandbox.stub(HttpResourceFetcher.prototype, 'get').resolves()
                const installer = sandbox
                    .stub(ChildProcess.prototype, 'run')
                    .resolves({ exitCode: 0, stderr: '', stdout: '' } as any)
                // When
                const result = installCli(scenario.toolID, false)
                if (scenario.shouldSucceed) {
                    // If should success then
                    await result
                    assert(downloader.called)
                    assert(installer.called)
                    assertTelemetry({
                        result: 'Succeeded',
                        toolId: scenario.toolID,
                    })
                } else {
                    // If should fail then
                    await getTestWindow()
                        .waitForMessage(/install/)
                        .then((message) => {
                            message.close()
                        })
                    await assert.rejects(result, /cancelled/)
                    assertTelemetry({
                        result: 'Cancelled',
                        toolId: scenario.toolID,
                    })
                }
            })
        }
    })

    describe('Tool install Buttons', function () {
        let sandbox: sinon.SinonSandbox
        const originalPlatform = process.platform
        const assertTelemetry = assertTelemetryCurried('appBuilder_installTool')
        beforeEach(function () {
            sandbox = sinon.createSandbox()
            // Install method doesn't work for Linux, setting to mac for functional unit tests
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            })
        })

        afterEach(function () {
            sandbox.restore()
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
            })
        })

        it('click install while exist should not download', async function () {
            // Given
            const downloader = sandbox.stub(HttpResourceFetcher.prototype, 'get').resolves()
            sandbox.stub(ChildProcess.prototype, 'run').resolves({ exitCode: 0, stderr: '', stdout: '' } as any)
            await vscode.commands.executeCommand('aws.toolkit.installAWSCLI')
            // Then
            assert(downloader.notCalled)
            assertTelemetry({
                result: 'Succeeded',
                toolId: 'aws-cli',
            })
        })

        it('install SAM with low version should popup', async function () {
            // Given
            sandbox.stub(SamCliInfoInvocation.prototype, 'execute').resolves({ version: '1.87.0' })
            sandbox.stub(ChildProcess.prototype, 'run').resolves({ exitCode: 0, stderr: '', stdout: '' } as any)
            const result = vscode.commands.executeCommand('aws.toolkit.installSAMCLI')

            const message = await getTestWindow().waitForMessage(/version/)
            message.close()
            await result
            assertTelemetry({
                result: 'Succeeded',
                toolId: 'sam-cli',
            })
        })

        it('install SAM with normal version should not download', async function () {
            // Given
            const downloader = sandbox.stub(HttpResourceFetcher.prototype, 'get').resolves()
            sandbox.stub(SamCliInfoInvocation.prototype, 'execute').resolves({ version: '1.100.0' })
            sandbox.stub(ChildProcess.prototype, 'run').resolves({ exitCode: 0, stderr: '', stdout: '' } as any)
            await vscode.commands.executeCommand('aws.toolkit.installSAMCLI')

            assert(downloader.notCalled)
            assertTelemetry({
                result: 'Succeeded',
                toolId: 'sam-cli',
            })
        })
    })
})
