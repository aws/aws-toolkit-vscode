/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as os from 'os'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { DefaultSamLocalInvokeCommand } from '../../../shared/sam/cli/samCliLocalInvoke'
import { makeCoreCLRDebugConfiguration } from '../../../shared/sam/debugger/csharpSamDebug'
import * as testutil from '../../testUtil'
import { SamLaunchRequestArgs } from '../../../shared/sam/debugger/awsSamDebugger'
import * as pathutil from '../../../shared/utilities/pathUtils'
import * as path from 'path'
import { CloudFormationTemplateRegistry } from '../../../shared/cloudformation/templateRegistry'
import { isImageLambdaConfig } from '../../../lambda/local/debugConfiguration'
import { ext } from '../../../shared/extensionGlobals'

describe('makeCoreCLRDebugConfiguration', async () => {
    let tempFolder: string
    let fakeWorkspaceFolder: vscode.WorkspaceFolder

    beforeEach(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
        fakeWorkspaceFolder = {
            uri: vscode.Uri.file(tempFolder),
            name: 'It was me, fakeWorkspaceFolder!',
            index: 0,
        }
    })

    afterEach(async () => {
        await fs.remove(tempFolder)
    })

    async function makeFakeSamLaunchConfig() {
        const config: SamLaunchRequestArgs = {
            name: 'fake-launch-config',
            workspaceFolder: fakeWorkspaceFolder,
            codeRoot: fakeWorkspaceFolder.uri.fsPath,
            runtimeFamily: RuntimeFamily.DotNetCore,
            type: 'coreclr',
            request: 'attach',
            // cfnTemplate?: CloudFormation.Template
            runtime: 'fakedotnet',
            handlerName: 'fakehandlername',
            noDebug: false,
            apiPort: 4242,
            debugPort: 4243,

            baseBuildDir: '/fake/build/dir/',
            envFile: '/fake/build/dir/env-vars.json',
            eventPayloadFile: '/fake/build/dir/event.json',
            documentUri: vscode.Uri.parse('/fake/path/foo.txt'),
            templatePath: '/fake/sam/path',
            samLocalInvokeCommand: new DefaultSamLocalInvokeCommand(),

            //debuggerPath?:

            invokeTarget: {
                target: 'code',
                lambdaHandler: 'fakehandlername',
                projectRoot: fakeWorkspaceFolder.uri.fsPath,
            },
        }
        return config
    }

    async function makeConfig({ codeUri = tempFolder }: { codeUri?: string; port?: number }) {
        const fakeLaunchConfig = await makeFakeSamLaunchConfig()
        return makeCoreCLRDebugConfiguration(fakeLaunchConfig, codeUri)
    }

    describe('windows', async () => {
        if (os.platform() === 'win32') {
            it('massages drive letters to uppercase', async () => {
                const config = await makeConfig({})
                assert.strictEqual(
                    config.windows.pipeTransport.pipeCwd.substring(0, 1),
                    tempFolder.substring(0, 1).toUpperCase()
                )
            })
        }

        it('uses powershell', async () => {
            const config = await makeConfig({})
            assert.strictEqual(config.windows.pipeTransport.pipeProgram, 'powershell')
        })

        it('uses the specified port', async () => {
            const config = await makeConfig({})
            assert.strictEqual(
                config.windows.pipeTransport.pipeArgs.some(arg => arg.includes(config.debugPort!!.toString())),
                true
            )
        })
    })
    describe('*nix', async () => {
        it('uses the default shell', async () => {
            const config = await makeConfig({})

            assert.strictEqual(config.pipeTransport.pipeProgram, 'sh')
        })

        it('uses the specified port', async () => {
            const config = await makeConfig({})

            assert.strictEqual(
                config.pipeTransport.pipeArgs.some(arg => arg.includes(config.debugPort!!.toString())),
                true
            )
        })
    })
})

describe('isImageLambdaConfig', async () => {
    let tempFolder: string
    let fakeWorkspaceFolder: vscode.WorkspaceFolder

    let registry: CloudFormationTemplateRegistry
    let appDir: string

    beforeEach(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
        fakeWorkspaceFolder = {
            uri: vscode.Uri.file(tempFolder),
            name: 'It was me, fakeWorkspaceFolder!',
            index: 0,
        }
        registry = ext.templateRegistry
        appDir = pathutil.normalize(path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/'))
    })

    it('true for Image-backed template', async () => {
        const templatePath = vscode.Uri.file(path.join(appDir, 'python3.7-image-sam-app/template.yaml'))
        await registry.addItemToRegistry(templatePath)

        const input = {
            name: 'fake-launch-config',
            workspaceFolder: fakeWorkspaceFolder,
            codeRoot: fakeWorkspaceFolder.uri.fsPath,
            runtimeFamily: RuntimeFamily.DotNetCore,
            request: 'launch',
            type: 'launch',
            runtime: 'fakedotnet',
            handlerName: 'fakehandlername',
            envFile: '/fake/build/dir/env-vars.json',
            eventPayloadFile: '/fake/build/dir/event.json',
            documentUri: vscode.Uri.parse('/fake/path/foo.txt'),
            templatePath: '/fake/sam/path',
            invokeTarget: {
                target: 'template',
                templatePath: templatePath.fsPath,
                logicalId: 'HelloWorldFunction',
                lambdaHandler: 'fakehandlername',
                projectRoot: fakeWorkspaceFolder.uri.fsPath,
            },
        } as SamLaunchRequestArgs

        assert.strictEqual(isImageLambdaConfig(input), true)
    })

    it('false for ZIP-backed template', async () => {
        const templatePath = vscode.Uri.file(path.join(appDir, 'python3.7-plain-sam-app/template.yaml'))
        await registry.addItemToRegistry(templatePath)

        const input = {
            name: 'fake-launch-config',
            workspaceFolder: fakeWorkspaceFolder,
            codeRoot: fakeWorkspaceFolder.uri.fsPath,
            runtimeFamily: RuntimeFamily.DotNetCore,
            request: 'launch',
            type: 'launch',
            runtime: 'fakedotnet',
            handlerName: 'fakehandlername',
            envFile: '/fake/build/dir/env-vars.json',
            eventPayloadFile: '/fake/build/dir/event.json',
            documentUri: vscode.Uri.parse('/fake/path/foo.txt'),
            templatePath: '/fake/sam/path',
            invokeTarget: {
                target: 'template',
                templatePath: templatePath.fsPath,
                logicalId: 'HelloWorldFunction',
                lambdaHandler: 'fakehandlername',
                projectRoot: fakeWorkspaceFolder.uri.fsPath,
            },
        } as SamLaunchRequestArgs

        assert.strictEqual(isImageLambdaConfig(input), false)
    })

    it('false for code-type', async () => {
        const input = {
            name: 'fake-launch-config',
            workspaceFolder: fakeWorkspaceFolder,
            codeRoot: fakeWorkspaceFolder.uri.fsPath,
            runtimeFamily: RuntimeFamily.DotNetCore,
            request: 'launch',
            type: 'launch',
            runtime: 'fakedotnet',
            handlerName: 'fakehandlername',
            envFile: '/fake/build/dir/env-vars.json',
            eventPayloadFile: '/fake/build/dir/event.json',
            documentUri: vscode.Uri.parse('/fake/path/foo.txt'),
            invokeTarget: {
                target: 'code',
                lambdaHandler: 'fakehandlername',
                projectRoot: fakeWorkspaceFolder.uri.fsPath,
            },
        } as SamLaunchRequestArgs

        assert.strictEqual(isImageLambdaConfig(input), false)
    })
})
