/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'

import {
    makeCoreCLRDebugConfiguration,
} from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { DefaultSamLocalInvokeCommand } from '../../../shared/sam/cli/samCliLocalInvoke'
import { SamLaunchRequestArgs } from '../../../shared/sam/debugger/samDebugSession'

describe.only('makeCoreCLRDebugConfiguration', async () => {
    function makeFakeSamLaunchConfig() {
        const fakeExtCtx = new FakeExtensionContext()
        const config: SamLaunchRequestArgs = {
            name: 'fake-launch-config',
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
            debugPort: 0,

            invokeTarget: {
                target: 'code',
            },
        }
        return config
    }
    
    function makeConfig({
        codeUri = path.join('foo', 'bar'),
        port = 42
    }: {codeUri?:string, port?:number}) {
        const fakeLaunchConfig = makeFakeSamLaunchConfig()
        return makeCoreCLRDebugConfiguration(fakeLaunchConfig, port, codeUri)
    }

    it('uses the specified codeUri', async () => {
        const config = makeConfig({})

        assert.strictEqual(config.sourceFileMap['/var/task'], path.join('foo', 'bar'))
    })

    describe('windows', async () => {
        if (os.platform() === 'win32') {
            it('massages drive letters to uppercase', async () => {
                const config = makeConfig({ codeUri: 'c:\\foo\\bar' })

                assert.strictEqual(config.windows.pipeTransport.pipeCwd, 'C:\\foo\\bar')
            })
        }

        it('uses powershell', async () => {
            const config = makeConfig({})

            assert.strictEqual(config.windows.pipeTransport.pipeProgram, 'powershell')
        })

        it('uses the specified port', async () => {
            const config = makeConfig({ port: 538 })

            assert.strictEqual(config.windows.pipeTransport.pipeArgs.some(arg => arg.includes('538')), true)
        })
    })
    describe('*nix', async () => {
        it('uses the default shell', async () => {
            const config = makeConfig({})

            assert.strictEqual(config.pipeTransport.pipeProgram, 'sh')
        })

        it('uses the specified port', async () => {
            const config = makeConfig({ port: 538 })

            assert.strictEqual(config.pipeTransport.pipeArgs.some(arg => arg.includes('538')), true)
        })
    })
})
