/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as os from 'os'
import * as vscode from 'vscode'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { DefaultSamLocalInvokeCommand } from '../../../shared/sam/cli/samCliLocalInvoke'
import { makeDotnetDebugConfiguration } from '../../../shared/sam/debugger/csharpSamDebug'
import * as testutil from '../../testUtil'
import { SamLaunchRequestArgs } from '../../../shared/sam/debugger/awsSamDebugger'
import * as pathutil from '../../../shared/utilities/pathUtils'
import * as path from 'path'
import { CloudFormationTemplateRegistry } from '../../../shared/fs/templateRegistry'
import { getArchitecture, isImageLambdaConfig } from '../../../lambda/local/debugConfiguration'
import * as CloudFormation from '../../../shared/cloudformation/cloudformation'
import globals from '../../../shared/extensionGlobals'
import { Runtime } from '../../../shared/telemetry/telemetry'
import { fs } from '../../../shared'

describe('makeCoreCLRDebugConfiguration', function () {
    let tempFolder: string
    let fakeWorkspaceFolder: vscode.WorkspaceFolder

    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        fakeWorkspaceFolder = {
            uri: vscode.Uri.file(tempFolder),
            name: 'It was me, fakeWorkspaceFolder!',
            index: 0,
        }
    })

    afterEach(async function () {
        await fs.delete(tempFolder, { recursive: true })
    })

    async function makeFakeSamLaunchConfig() {
        const config: SamLaunchRequestArgs = {
            name: 'fake-launch-config',
            workspaceFolder: fakeWorkspaceFolder,
            codeRoot: fakeWorkspaceFolder.uri.fsPath,
            runtimeFamily: RuntimeFamily.DotNet,
            type: 'coreclr',
            request: 'attach',
            // cfnTemplate?: CloudFormation.Template
            runtime: 'fakedotnet' as Runtime,
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

            // debuggerPath?:

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
        return makeDotnetDebugConfiguration(fakeLaunchConfig, codeUri)
    }

    describe('windows', function () {
        if (os.platform() === 'win32') {
            it('massages drive letters to uppercase', async function () {
                const config = await makeConfig({})
                assert.strictEqual(
                    config.windows.pipeTransport.pipeCwd.substring(0, 1),
                    tempFolder.substring(0, 1).toUpperCase()
                )
            })
        }

        it('uses powershell', async function () {
            const config = await makeConfig({})
            assert.strictEqual(config.windows.pipeTransport.pipeProgram, 'powershell')
        })

        it('uses the specified port', async function () {
            const config = await makeConfig({})
            assert.strictEqual(
                config.windows.pipeTransport.pipeArgs.some((arg) => arg.includes(config.debugPort!.toString())),
                true
            )
        })
    })
    describe('*nix', function () {
        it('uses the default shell', async function () {
            const config = await makeConfig({})

            assert.strictEqual(config.pipeTransport.pipeProgram, 'sh')
        })

        it('uses the specified port', async function () {
            const config = await makeConfig({})

            assert.strictEqual(
                config.pipeTransport.pipeArgs.some((arg) => arg.includes(config.debugPort!.toString())),
                true
            )
        })
    })
})

describe('isImageLambdaConfig', function () {
    let tempFolder: string
    let fakeWorkspaceFolder: vscode.WorkspaceFolder

    let registry: CloudFormationTemplateRegistry
    let appDir: string

    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        fakeWorkspaceFolder = {
            uri: vscode.Uri.file(tempFolder),
            name: 'It was me, fakeWorkspaceFolder!',
            index: 0,
        }
        registry = await globals.templateRegistry
        appDir = pathutil.normalize(path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/'))
    })

    it('true for Image-backed template', async function () {
        const templatePath = vscode.Uri.file(path.join(appDir, 'python3.7-image-sam-app/template.yaml'))
        await registry.addItem(templatePath)

        const input = {
            name: 'fake-launch-config',
            workspaceFolder: fakeWorkspaceFolder,
            codeRoot: fakeWorkspaceFolder.uri.fsPath,
            runtimeFamily: RuntimeFamily.DotNet,
            request: 'launch',
            type: 'launch',
            runtime: 'fakedotnet' as Runtime,
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

        assert.strictEqual(await isImageLambdaConfig(input), true)
    })

    it('false for ZIP-backed template', async function () {
        const templatePath = vscode.Uri.file(path.join(appDir, 'python3.7-plain-sam-app/template.yaml'))
        await registry.addItem(templatePath)

        const input = {
            name: 'fake-launch-config',
            workspaceFolder: fakeWorkspaceFolder,
            codeRoot: fakeWorkspaceFolder.uri.fsPath,
            runtimeFamily: RuntimeFamily.DotNet,
            request: 'launch',
            type: 'launch',
            runtime: 'fakedotnet' as Runtime,
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

        assert.strictEqual(await isImageLambdaConfig(input), false)
    })

    it('false for code-type', async function () {
        const input = {
            name: 'fake-launch-config',
            workspaceFolder: fakeWorkspaceFolder,
            codeRoot: fakeWorkspaceFolder.uri.fsPath,
            runtimeFamily: RuntimeFamily.DotNet,
            request: 'launch',
            type: 'launch',
            runtime: 'fakedotnet' as Runtime,
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

        assert.strictEqual(await isImageLambdaConfig(input), false)
    })
})

describe('getArchitecture', function () {
    it('returns a valid architecture from a template', function () {
        const resource: CloudFormation.Resource = {
            Type: 'AWS::Serverless::Function',
            Properties: {
                CodeUri: 'foo',
                Handler: 'foo',
                Architectures: ['arm64'],
            },
        }
        const template: CloudFormation.Template = {
            Resources: {
                myResource: resource,
            },
        }
        assert.strictEqual(
            getArchitecture(template, resource, {
                target: 'template',
                logicalId: 'myResource',
                templatePath: 'foo',
            }),
            'arm64'
        )
    })

    it('returns x86_64 for an invalid architecture from a template', function () {
        const resource: CloudFormation.Resource = {
            Type: 'AWS::Serverless::Function',
            Properties: {
                CodeUri: 'foo',
                Handler: 'foo',
                Architectures: ['powerPc' as 'x86_64'],
            },
        }
        const template: CloudFormation.Template = {
            Resources: {
                myResource: resource,
            },
        }
        assert.strictEqual(
            getArchitecture(template, resource, {
                target: 'template',
                logicalId: 'myResource',
                templatePath: 'foo',
            }),
            'x86_64'
        )
    })

    it('returns a valid architecture from CodeTargetProperties', function () {
        assert.strictEqual(
            getArchitecture(undefined, undefined, {
                lambdaHandler: 'foo',
                projectRoot: 'foo',
                target: 'code',
                architecture: 'arm64',
            }),
            'arm64'
        )
    })

    it('returns x86_64 for an invalid architecture from CodeTargetProperties', function () {
        assert.strictEqual(
            getArchitecture(undefined, undefined, {
                lambdaHandler: 'foo',
                projectRoot: 'foo',
                target: 'code',
                architecture: 'powerPc' as 'x86_64',
            }),
            'x86_64'
        )
    })

    it('returns undefined if no value is present in the template', function () {
        const resource: CloudFormation.Resource = {
            Type: 'AWS::Serverless::Function',
            Properties: {
                CodeUri: 'foo',
                Handler: 'foo',
            },
        }
        const template: CloudFormation.Template = {
            Resources: {
                myResource: resource,
            },
        }
        assert.strictEqual(
            getArchitecture(template, resource, {
                target: 'template',
                logicalId: 'myResource',
                templatePath: 'foo',
            }),
            undefined
        )
    })

    it('returns undefined if no value is present in CodeTargetProperties', function () {
        assert.strictEqual(
            getArchitecture(undefined, undefined, {
                lambdaHandler: 'foo',
                projectRoot: 'foo',
                target: 'code',
            }),
            undefined
        )
    })
})
