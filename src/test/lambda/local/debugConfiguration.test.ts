/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as os from 'os'
import * as vscode from 'vscode'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { rmrf } from '../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { DefaultSamLocalInvokeCommand } from '../../../shared/sam/cli/samCliLocalInvoke'
import { makeCoreCLRDebugConfiguration } from '../../../shared/sam/debugger/csharpSamDebug'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import * as testutil from '../../testUtil'
import { SamLaunchRequestArgs } from '../../../shared/sam/debugger/awsSamDebugger'

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
        await rmrf(tempFolder)
    })

    async function makeFakeSamLaunchConfig() {
        const fakeExtCtx = await FakeExtensionContext.getFakeExtContext()
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

            baseBuildDir: '/fake/build/dir/',
            envFile: '/fake/build/dir/env-vars.json',
            eventPayloadFile: '/fake/build/dir/event.json',
            documentUri: vscode.Uri.parse('/fake/path/foo.txt'),
            templatePath: '/fake/sam/path',
            samLocalInvokeCommand: new DefaultSamLocalInvokeCommand(fakeExtCtx.chanLogger),

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

    it('uses the specified codeUri', async () => {
        const config = await makeConfig({})
        testutil.assertEqualPaths(config.sourceFileMap['/var/task'], tempFolder)
    })

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
