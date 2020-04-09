/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'

import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { DefaultSamLocalInvokeCommand } from '../../../shared/sam/cli/samCliLocalInvoke'
import { SamLaunchRequestArgs } from '../../../shared/sam/debugger/samDebugSession'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { rmrf } from '../../../shared/filesystem'
import { makeCoreCLRDebugConfiguration } from '../../../shared/codelens/csharpCodeLensProvider'
import * as testutil from '../../testUtil'

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

    function makeFakeSamLaunchConfig() {
        const fakeExtCtx = new FakeExtensionContext()
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
            documentUri: vscode.Uri.parse('/fake/path/foo.txt'),
            originalHandlerName: 'fake-original-handler',
            originalSamTemplatePath: '/fake/original/sam/path',
            samTemplatePath: '/fake/sam/path',
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

    async function makeConfig({ codeUri = path.join('foo', 'bar') }: { codeUri?: string; port?: number }) {
        const fakeLaunchConfig = makeFakeSamLaunchConfig()
        return makeCoreCLRDebugConfiguration(fakeLaunchConfig, codeUri)
    }

    it('uses the specified codeUri', async () => {
        const config = await makeConfig({})

        testutil.assertEqualPaths(config.sourceFileMap['/var/task'], path.join('foo', 'bar'))
    })

    describe('windows', async () => {
        if (os.platform() === 'win32') {
            it('massages drive letters to uppercase', async () => {
                const config = await makeConfig({ codeUri: 'c:\\foo\\bar' })

                testutil.assertEqualPaths(config.windows.pipeTransport.pipeCwd, 'C:/foo/bar')
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
