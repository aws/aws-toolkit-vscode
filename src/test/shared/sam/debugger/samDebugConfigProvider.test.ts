/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { DotNetCoreDebugConfiguration } from '../../../../lambda/local/debugConfiguration'
import * as lambdaModel from '../../../../lambda/models/samLambdaRuntime'
import { CloudFormationTemplateRegistry } from '../../../../shared/cloudformation/templateRegistry'
import { mkdir, rmrf } from '../../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import {
    TemplateTargetProperties,
    AwsSamDebuggerConfiguration,
    AWS_SAM_DEBUG_TYPE,
    CODE_TARGET_TYPE,
    DIRECT_INVOKE_TYPE,
    TEMPLATE_TARGET_TYPE,
    createTemplateAwsSamDebugConfig,
    ensureRelativePaths,
    createCodeAwsSamDebugConfig,
    CodeTargetProperties,
} from '../../../../shared/sam/debugger/awsSamDebugConfiguration'
import { SamDebugConfigProvider, SamLaunchRequestArgs } from '../../../../shared/sam/debugger/awsSamDebugger'
import * as debugConfiguration from '../../../../lambda/local/debugConfiguration'
import * as pathutil from '../../../../shared/utilities/pathUtils'
import { FakeExtensionContext } from '../../../fakeExtensionContext'
import * as testutil from '../../../testUtil'
import { assertFileText } from '../../../testUtil'
import { makeSampleSamTemplateYaml, makeSampleYamlResource } from '../../cloudformation/cloudformationTestUtils'
import { readFileSync } from 'fs-extra'

/**
 * Asserts the contents of a "launch config" (the result of `makeConfig()` or
 * `resolveDebugConfiguration()` invoked on a user-provided "debug config").
 */
function assertEqualLaunchConfigs(actual: SamLaunchRequestArgs, expected: SamLaunchRequestArgs, appDir: string) {
    // Do not modify the original variables.
    actual = { ...actual }
    expected = { ...expected }

    assert.strictEqual(actual.workspaceFolder.name, expected.workspaceFolder.name)

    // Compare filepaths (before removing them for deep-compare).
    testutil.assertEqualPaths(actual.workspaceFolder.uri.fsPath, expected.workspaceFolder.uri.fsPath)

    // Port number is unstable; check that it looks reasonable.
    assert.ok(!actual.debugPort || actual.debugPort > 5000)
    assert.strictEqual(actual.port, expected.port)

    // Build dir is randomly-generated; check that it looks reasonable.
    assert.ok(actual.baseBuildDir && actual.baseBuildDir.length > 9)
    if (expected.type === 'python') {
        // manifestPath is randomly-generated; check that it looks reasonable.
        assert.ok(actual.manifestPath && actual.manifestPath.length > 9)
    }

    // Normalize path fields before comparing.
    for (const o of [actual, expected]) {
        o.codeRoot = pathutil.normalize(o.codeRoot)
        o.envFile = pathutil.normalize(o.envFile)
        o.eventPayloadFile = pathutil.normalize(o.eventPayloadFile)
        o.debuggerPath = o.debuggerPath ? pathutil.normalize(o.debuggerPath) : o.debuggerPath
        o.localRoot = o.localRoot ? pathutil.normalize(o.localRoot) : o.localRoot
    }

    // Remove noisy properties before doing a deep-compare.
    for (const o of [actual, expected]) {
        delete o.manifestPath
        delete o.documentUri
        delete o.samTemplatePath
        delete o.workspaceFolder
        delete o.codeRoot
        delete (o as any).localRoot // Node-only
        delete (o as any).debuggerPath // Dotnet-only
    }
    assert.deepStrictEqual(actual, expected)
}

describe('SamDebugConfigurationProvider', async () => {
    let debugConfigProvider: SamDebugConfigProvider
    let registry: CloudFormationTemplateRegistry
    let tempFolder: string
    let tempFolderSimilarName: string | undefined
    let tempFile: vscode.Uri
    let fakeWorkspaceFolder: vscode.WorkspaceFolder
    const resourceName = 'myResource'

    beforeEach(async () => {
        const fakeContext = await FakeExtensionContext.getFakeExtContext()
        tempFolder = await makeTemporaryToolkitFolder()
        tempFile = vscode.Uri.file(path.join(tempFolder, 'test.yaml'))
        registry = CloudFormationTemplateRegistry.getRegistry()
        debugConfigProvider = new SamDebugConfigProvider(fakeContext)
        fakeWorkspaceFolder = {
            uri: vscode.Uri.file(tempFolder),
            name: 'It was me, fakeWorkspaceFolder!',
            index: 0,
        }
        tempFolderSimilarName = undefined
    })

    afterEach(async () => {
        await rmrf(tempFolder)
        if (tempFolderSimilarName) {
            await rmrf(tempFolderSimilarName)
        }
    })

    describe('provideDebugConfig', async () => {
        it('failure modes', async () => {
            // No workspace folder:
            assert.deepStrictEqual(await debugConfigProvider.provideDebugConfigurations(undefined), [])
            // Workspace with no templates:
            assert.deepStrictEqual(await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder), [])

            // Malformed template.yaml:
            testutil.toFile('bogus', tempFile.fsPath)
            await registry.addTemplateToRegistry(tempFile)
            assert.deepStrictEqual(await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder), [])
        })

        it('returns one item if a template with one resource is in the workspace', async () => {
            testutil.toFile(makeSampleSamTemplateYaml(true), tempFile.fsPath)
            await registry.addTemplateToRegistry(tempFile)
            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.notStrictEqual(provided, undefined)
            assert.strictEqual(provided!.length, 1)
            assert.strictEqual(
                provided![0].name,
                `${path.basename(fakeWorkspaceFolder.uri.fsPath)}:TestResource (nodejs12.x)`
            )
        })

        it('returns multiple items if a template with multiple resources is in the workspace', async () => {
            const resources = ['resource1', 'resource2']
            const bigYamlStr = `${makeSampleSamTemplateYaml(true, {
                resourceName: resources[0],
            })}\n${makeSampleYamlResource({ resourceName: resources[1] })}`
            testutil.toFile(bigYamlStr, tempFile.fsPath)
            await registry.addTemplateToRegistry(tempFile)
            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.notStrictEqual(provided, undefined)
            if (provided) {
                assert.strictEqual(provided.length, 2)
                assert.ok(
                    resources.includes((provided[0].invokeTarget as TemplateTargetProperties).samTemplateResource)
                )
                assert.ok(
                    resources.includes((provided[1].invokeTarget as TemplateTargetProperties).samTemplateResource)
                )
            }
        })

        it('only detects the specifically targeted workspace folder (and its subfolders)', async () => {
            const resources = ['resource1', 'resource2']
            const badResourceName = 'notIt'

            const nestedDir = path.join(tempFolder, 'nested')
            const nestedYaml = vscode.Uri.file(path.join(nestedDir, 'test.yaml'))
            tempFolderSimilarName = tempFolder + 'SimilarName'
            const similarNameYaml = vscode.Uri.file(path.join(tempFolderSimilarName, 'test.yaml'))

            await mkdir(nestedDir)
            await mkdir(tempFolderSimilarName)

            testutil.toFile(makeSampleSamTemplateYaml(true, { resourceName: resources[0] }), tempFile.fsPath)
            testutil.toFile(makeSampleSamTemplateYaml(true, { resourceName: resources[1] }), nestedYaml.fsPath)
            testutil.toFile(makeSampleSamTemplateYaml(true, { resourceName: badResourceName }), similarNameYaml.fsPath)

            await registry.addTemplateToRegistry(tempFile)
            await registry.addTemplateToRegistry(nestedYaml)
            await registry.addTemplateToRegistry(similarNameYaml)

            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.notStrictEqual(provided, undefined)
            if (provided) {
                assert.strictEqual(provided.length, 2)
                assert.ok(
                    resources.includes((provided[0].invokeTarget as TemplateTargetProperties).samTemplateResource)
                )
                assert.ok(
                    resources.includes((provided[1].invokeTarget as TemplateTargetProperties).samTemplateResource)
                )
                assert.ok(!resources.includes(badResourceName))
            }
        })
    })

    describe('makeConfig', async () => {
        it('failure modes', async () => {
            const config = await getConfig(
                debugConfigProvider,
                registry,
                'testFixtures/workspaceFolder/csharp2.1-plain-sam-app/'
            )

            // No workspace folder:
            assert.deepStrictEqual(await debugConfigProvider.makeConfig(undefined, config.config), undefined)

            // Unknown runtime:
            config.config.lambda = {
                runtime: 'happy-runtime-42',
            }
            assert.deepStrictEqual(await debugConfigProvider.makeConfig(config.folder, config.config), undefined)
        })

        it('returns undefined when resolving debug configurations with an invalid request type', async () => {
            const resolved = await debugConfigProvider.makeConfig(undefined, {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: 'not-direct-invoke',
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'sick handles',
                    projectRoot: 'root as in beer',
                },
            })
            assert.strictEqual(resolved, undefined)
        })

        it('returns undefined when resolving debug configurations with an invalid target type', async () => {
            const tgt = 'not-code' as 'code'
            const resolved = await debugConfigProvider.makeConfig(undefined, {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: tgt,
                    lambdaHandler: 'sick handles',
                    projectRoot: 'root as in beer',
                },
            })
            assert.strictEqual(resolved, undefined)
        })

        it("returns undefined when resolving template debug configurations with a template that isn't in the registry", async () => {
            const resolved = await debugConfigProvider.makeConfig(undefined, createFakeConfig({}))
            assert.strictEqual(resolved, undefined)
        })

        it("returns undefined when resolving template debug configurations with a template that doesn't have the set resource", async () => {
            await createAndRegisterYaml({}, tempFile, registry)
            const resolved = await debugConfigProvider.makeConfig(
                undefined,
                createFakeConfig({ samTemplatePath: tempFile.fsPath })
            )
            assert.strictEqual(resolved, undefined)
        })

        it('returns undefined when resolving template debug configurations with a resource that has an invalid runtime in template', async () => {
            await createAndRegisterYaml({ resourceName, runtime: 'moreLikeRanOutOfTime' }, tempFile, registry)
            const resolved = await debugConfigProvider.makeConfig(
                undefined,
                createFakeConfig({
                    samTemplatePath: tempFile.fsPath,
                    samTemplateResource: resourceName,
                })
            )
            assert.strictEqual(resolved, undefined)
        })

        it('returns undefined when resolving template debug configurations with a resource that has an invalid runtime in template', async () => {
            testutil.toFile(
                makeSampleSamTemplateYaml(true, { resourceName, runtime: 'moreLikeRanOutOfTime' }),
                tempFile.fsPath
            )
            await registry.addTemplateToRegistry(tempFile)
            const resolved = await debugConfigProvider.makeConfig(undefined, {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    samTemplatePath: tempFile.fsPath,
                    samTemplateResource: resourceName,
                },
            })
            assert.strictEqual(resolved, undefined)
        })

        it('returns undefined when resolving code debug configurations with invalid runtimes', async () => {
            const resolved = await debugConfigProvider.makeConfig(undefined, {
                ...createBaseCodeConfig({}),
                lambda: {
                    runtime: 'COBOL',
                },
            })
            assert.strictEqual(resolved, undefined)
        })

        it('supports workspace-relative template path ("./foo.yaml")', async () => {
            testutil.toFile(makeSampleSamTemplateYaml(true, { runtime: 'nodejs12.x' }), tempFile.fsPath)
            // Register with *full* path.
            await registry.addTemplateToRegistry(tempFile)
            // Simulates launch.json:
            //     "invokeTarget": {
            //         "target": "./test.yaml",
            //     },
            const relPath = './' + path.relative(fakeWorkspaceFolder.uri.path, tempFile.path)

            // Assert that the relative path correctly maps to the full path in the registry.
            const name = 'Test rel path'
            const resolved = await debugConfigProvider.makeConfig(fakeWorkspaceFolder, {
                type: AWS_SAM_DEBUG_TYPE,
                name: name,
                request: 'direct-invoke',
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    samTemplatePath: relPath,
                    samTemplateResource: 'TestResource',
                    //lambdaHandler: 'sick handles',
                    //projectRoot: 'root as in beer'
                },
            })
            // TODO: why not respect caller-chosen name?
            assert.strictEqual(resolved!.name, 'SamLocalDebug')
        })

        it('target=code: javascript', async () => {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/js-manifest-in-root/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'my.test.handler',
                    projectRoot: 'src',
                },
                lambda: {
                    runtime: 'nodejs12.x',
                    // For target=code these envvars are written to the input-template.yaml.
                    environmentVariables: {
                        'test-envvar-1': 'test value 1',
                        'test-envvar-2': 'test value 2',
                    },
                    memoryMb: 1.2,
                    timeoutSec: 9000,
                    event: {
                        json: {
                            'test-payload-key-1': 'test payload value 1',
                            'test-payload-key-2': 'test payload value 2',
                        },
                    },
                },
            }
            const actual = (await debugConfigProvider.makeConfig(folder, input))!
            const expected: SamLaunchRequestArgs = {
                type: AWS_SAM_DEBUG_TYPE,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'nodejs12.x',
                runtimeFamily: lambdaModel.RuntimeFamily.NodeJS,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: pathutil.normalize(path.join(appDir, 'src')), // Normalized to absolute path.
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'my.test.handler',
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                },
                localRoot: pathutil.normalize(path.join(appDir, 'src')), // Normalized to absolute path.
                name: 'SamLocalDebug',
                samTemplatePath: pathutil.normalize(path.join(actual.baseBuildDir ?? '?', 'input/input-template.yaml')),

                //
                // Node-related fields
                //
                address: 'localhost',
                port: actual.debugPort,
                preLaunchTask: undefined,
                protocol: 'inspector',
                remoteRoot: '/var/task',
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
            }

            assertEqualLaunchConfigs(actual, expected, appDir)
            assertFileText(
                expected.envFile,
                '{"awsToolkitSamLocalResource":{"test-envvar-1":"test value 1","test-envvar-2":"test value 2"}}'
            )
            assertFileText(
                expected.eventPayloadFile,
                '{"test-payload-key-1":"test payload value 1","test-payload-key-2":"test payload value 2"}'
            )
            assertFileText(
                expected.samTemplatePath,
                `Resources:
  awsToolkitSamLocalResource:
    Type: 'AWS::Serverless::Function'
    Properties:
      Handler: my.test.handler
      CodeUri: >-
        ${expected.codeRoot}
      Runtime: nodejs12.x
      Environment:
        Variables:
          test-envvar-1: test value 1
          test-envvar-2: test value 2
      MemorySize: 1.2
      Timeout: 9000
`
            )

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))!
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                noDebug: true,
                request: 'launch',
                debugPort: undefined,
                port: -1,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug, appDir)
        })

        it('target=template: javascript', async () => {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/js-manifest-in-root')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-js-template',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    samTemplatePath: 'template.yaml',
                    samTemplateResource: 'SourceCodeTwoFoldersDeep',
                },
                lambda: {
                    // For target=template these are written to env-vars.json,
                    // NOT the input-template.yaml.
                    environmentVariables: {
                        'test-js-template-envvar-1': 'test target=template envvar value 1',
                        'test-js-template-envvar-2': 'test target=template envvar value 2',
                    },
                    memoryMb: 1.01,
                    timeoutSec: 99,
                    event: {
                        json: {
                            'test-js-template-key-1': 'test js target=template value 1',
                            'test-js-template-key-2': 'test js target=template value 2',
                        },
                    },
                },
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'template.yaml'))
            await registry.addTemplateToRegistry(templatePath)
            const actual = (await debugConfigProvider.makeConfig(folder, input))!

            const expected: SamLaunchRequestArgs = {
                type: AWS_SAM_DEBUG_TYPE,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'nodejs10.x',
                runtimeFamily: lambdaModel.RuntimeFamily.NodeJS,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: appDir,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'src/subfolder/app.handlerTwoFoldersDeep',
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                },
                localRoot: appDir,
                name: 'SamLocalDebug',
                samTemplatePath: pathutil.normalize(path.join(actual.baseBuildDir ?? '?', 'input/input-template.yaml')),

                //
                // Node-related fields
                //
                address: 'localhost',
                port: actual.debugPort,
                preLaunchTask: undefined,
                protocol: 'inspector',
                remoteRoot: '/var/task',
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
            }

            assertEqualLaunchConfigs(actual, expected, appDir)
            assertFileText(
                expected.envFile,
                '{"awsToolkitSamLocalResource":{"test-js-template-envvar-1":"test target=template envvar value 1","test-js-template-envvar-2":"test target=template envvar value 2"}}'
            )
            assertFileText(
                expected.eventPayloadFile,
                '{"test-js-template-key-1":"test js target=template value 1","test-js-template-key-2":"test js target=template value 2"}'
            )
            assertFileText(
                expected.samTemplatePath,
                `Resources:
  awsToolkitSamLocalResource:
    Type: 'AWS::Serverless::Function'
    Properties:
      Handler: src/subfolder/app.handlerTwoFoldersDeep
      CodeUri: >-
        ${expected.codeRoot}
      Runtime: nodejs10.x
      MemorySize: 1.01
      Timeout: 99
`
            )

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))!
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                noDebug: true,
                request: 'launch',
                debugPort: undefined,
                port: -1,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug, appDir)
        })

        it('target=code: dotnet/csharp', async () => {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/csharp2.1-plain-sam-app/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'Test debugconfig',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                    projectRoot: 'src/HelloWorld',
                },
                lambda: {
                    runtime: 'dotnetcore2.1',
                },
            }
            const actual = (await debugConfigProvider.makeConfig(folder, input))! as DotNetCoreDebugConfiguration
            const codeRoot = `${appDir}${input.invokeTarget.projectRoot}`
            const expectedCodeRoot = (actual.baseBuildDir ?? 'fail') + '/input'
            const expected: SamLaunchRequestArgs = {
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'dotnetcore2.1', // lambdaModel.dotNetRuntimes[0],
                runtimeFamily: lambdaModel.RuntimeFamily.DotNetCore,
                type: AWS_SAM_DEBUG_TYPE,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: expectedCodeRoot, // Normalized to absolute path.
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                    environmentVariables: {},
                    memoryMb: undefined,
                    timeoutSec: undefined,
                },
                name: 'SamLocalDebug',
                samTemplatePath: expectedCodeRoot + '/input-template.yaml',

                //
                // Csharp-related fields
                //
                debuggerPath: codeRoot + '/.vsdbg', // Normalized to absolute path.
                processId: '1',
                pipeTransport: {
                    debuggerPath: '/tmp/lambci_debug_files/vsdbg',
                    // tslint:disable-next-line: no-invalid-template-strings
                    pipeArgs: [
                        '-c',
                        `docker exec -i $(docker ps -q -f publish=${actual.debugPort}) \${debuggerCommand}`,
                    ],
                    pipeCwd: codeRoot,
                    pipeProgram: 'sh',
                },
                sourceFileMap: {
                    '/var/task': codeRoot,
                },
                windows: {
                    pipeTransport: {
                        debuggerPath: '/tmp/lambci_debug_files/vsdbg',
                        // tslint:disable-next-line: no-invalid-template-strings
                        pipeArgs: [
                            '-c',
                            `docker exec -i $(docker ps -q -f publish=${actual.debugPort}) \${debuggerCommand}`,
                        ],
                        pipeCwd: codeRoot,
                        pipeProgram: 'powershell',
                    },
                },
            }

            // Windows: sourceFileMap driveletter must be uppercase.
            if (os.platform() === 'win32') {
                const sourceFileMap = actual.sourceFileMap['/var/task']
                assert.ok(/^[A-Z]:/.test(sourceFileMap.substring(0, 2)), 'sourceFileMap driveletter must be uppercase')
            }

            assertEqualLaunchConfigs(actual, expected, appDir)
            assertFileText(expected.envFile, '{"awsToolkitSamLocalResource":{}}')
            assertFileText(expected.eventPayloadFile, '{}')
            assertFileText(
                expected.samTemplatePath,
                `Resources:
  awsToolkitSamLocalResource:
    Type: 'AWS::Serverless::Function'
    Properties:
      Handler: 'HelloWorld::HelloWorld.Function::FunctionHandler'
      CodeUri: >-
        ${appDir}${input.invokeTarget.projectRoot}
      Runtime: dotnetcore2.1
      Environment:
        Variables: {}
`
            )

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))! as DotNetCoreDebugConfiguration
            const expectedCodeRootNoDebug = (actualNoDebug.baseBuildDir ?? 'fail') + '/input'
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                codeRoot: expectedCodeRootNoDebug,
                noDebug: true,
                request: 'launch',
                debuggerPath: undefined,
                debugPort: undefined,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            delete expectedNoDebug.processId
            delete expectedNoDebug.pipeTransport
            delete expectedNoDebug.sourceFileMap
            delete expectedNoDebug.windows
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug, appDir)
        })

        it('target=template: dotnet/csharp', async () => {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/csharp2.1-plain-sam-app')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-csharp-template',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    samTemplatePath: 'template.yaml',
                    samTemplateResource: 'HelloWorldFunction',
                },
                lambda: {
                    environmentVariables: {
                        'test-envvar-1': 'test value 1',
                    },
                    memoryMb: 42,
                    timeoutSec: 717,
                    event: {
                        json: {
                            'test-payload-key-1': 'test payload value 1',
                        },
                    },
                },
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'template.yaml'))
            await registry.addTemplateToRegistry(templatePath)
            const actual = (await debugConfigProvider.makeConfig(folder, input))! as DotNetCoreDebugConfiguration
            const codeRoot = `${appDir}/src/HelloWorld`
            const expectedCodeRoot = (actual.baseBuildDir ?? 'fail') + '/input'
            const expected: SamLaunchRequestArgs = {
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'dotnetcore2.1', // lambdaModel.dotNetRuntimes[0],
                runtimeFamily: lambdaModel.RuntimeFamily.DotNetCore,
                type: AWS_SAM_DEBUG_TYPE,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: expectedCodeRoot,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                },
                name: 'SamLocalDebug',
                samTemplatePath: expectedCodeRoot + '/input-template.yaml',

                //
                // Csharp-related fields
                //
                debuggerPath: codeRoot + '/.vsdbg', // Normalized to absolute path.
                processId: '1',
                pipeTransport: {
                    debuggerPath: '/tmp/lambci_debug_files/vsdbg',
                    // tslint:disable-next-line: no-invalid-template-strings
                    pipeArgs: [
                        '-c',
                        `docker exec -i $(docker ps -q -f publish=${actual.debugPort}) \${debuggerCommand}`,
                    ],
                    pipeCwd: codeRoot,
                    pipeProgram: 'sh',
                },
                sourceFileMap: {
                    '/var/task': codeRoot,
                },
                windows: {
                    pipeTransport: {
                        debuggerPath: '/tmp/lambci_debug_files/vsdbg',
                        // tslint:disable-next-line: no-invalid-template-strings
                        pipeArgs: [
                            '-c',
                            `docker exec -i $(docker ps -q -f publish=${actual.debugPort}) \${debuggerCommand}`,
                        ],
                        pipeCwd: codeRoot,
                        pipeProgram: 'powershell',
                    },
                },
            }

            // Windows: sourceFileMap driveletter must be uppercase.
            if (os.platform() === 'win32') {
                const sourceFileMap = actual.sourceFileMap['/var/task']
                assert.ok(/^[A-Z]:/.test(sourceFileMap.substring(0, 2)), 'sourceFileMap driveletter must be uppercase')
            }

            assertEqualLaunchConfigs(actual, expected, appDir)
            assertFileText(expected.envFile, '{"awsToolkitSamLocalResource":{"test-envvar-1":"test value 1"}}')
            assertFileText(expected.eventPayloadFile, '{"test-payload-key-1":"test payload value 1"}')
            assertFileText(
                expected.samTemplatePath,
                `Resources:
  awsToolkitSamLocalResource:
    Type: 'AWS::Serverless::Function'
    Properties:
      Handler: 'HelloWorld::HelloWorld.Function::FunctionHandler'
      CodeUri: >-
        ${appDir}/src/HelloWorld
      Runtime: dotnetcore2.1
      Environment:
        Variables:
          PARAM1: VALUE
      MemorySize: 42
      Timeout: 717
Globals:
  Function:
    Timeout: 10
`
            )

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))! as DotNetCoreDebugConfiguration
            const expectedCodeRootNoDebug = (actualNoDebug.baseBuildDir ?? 'fail') + '/input'
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                codeRoot: expectedCodeRootNoDebug,
                noDebug: true,
                request: 'launch',
                debuggerPath: undefined,
                debugPort: undefined,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            delete expectedNoDebug.processId
            delete expectedNoDebug.pipeTransport
            delete expectedNoDebug.sourceFileMap
            delete expectedNoDebug.windows
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug, appDir)
        })

        it('target=code: python 3.7', async () => {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/python3.7-plain-sam-app')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'Test debugconfig',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'app.lambda_handler',
                    projectRoot: 'hello_world',
                },
                lambda: {
                    runtime: 'python3.7',
                    event: {
                        path: `${appDir}/events/event.json`,
                    },
                },
            }

            // Invoke with noDebug=false (the default).
            const actual = (await debugConfigProvider.makeConfig(folder, input))!
            // Expected result with noDebug=false.
            const expected: SamLaunchRequestArgs = {
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'python3.7',
                runtimeFamily: lambdaModel.RuntimeFamily.Python,
                type: AWS_SAM_DEBUG_TYPE,
                handlerName: 'app___vsctk___debug.lambda_handler',
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: pathutil.normalize(path.join(appDir, 'hello_world')),
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                    environmentVariables: {},
                    memoryMb: undefined,
                    timeoutSec: undefined,
                },
                name: 'SamLocalDebug',
                samTemplatePath: pathutil.normalize(path.join(actual.baseBuildDir ?? '?', 'input/input-template.yaml')),
                port: actual.debugPort,
                redirectOutput: false,

                //
                // Python-related fields
                //
                host: 'localhost',
                outFilePath: pathutil.normalize(path.join(appDir, 'hello_world/app___vsctk___debug.py')),
                pathMappings: [
                    {
                        localRoot: pathutil.normalize(path.join(appDir, 'hello_world')),
                        remoteRoot: '/var/task',
                    },
                ],
            }

            // Windows: pathMappings has uppercase and lowercase variants.
            // See getLocalRootVariants(). ref: 4bd1418863edd45e27
            if (os.platform() === 'win32') {
                const localRoot: string = expected.pathMappings[0].localRoot
                expected.pathMappings.unshift({
                    localRoot: localRoot.substring(0, 1).toLowerCase() + localRoot.substring(1),
                    remoteRoot: '/var/task',
                })
            }

            assertEqualLaunchConfigs(actual, expected, appDir)
            assertFileText(expected.envFile, '{"awsToolkitSamLocalResource":{}}')
            assert.strictEqual(
                readFileSync(actual.eventPayloadFile, 'utf-8'),
                readFileSync(input.lambda.event.path, 'utf-8')
            )
            assertFileText(
                expected.samTemplatePath,
                `Resources:
  awsToolkitSamLocalResource:
    Type: 'AWS::Serverless::Function'
    Properties:
      Handler: ${expected.handlerName}
      CodeUri: >-
        ${expected.codeRoot}
      Runtime: python3.7
      Environment:
        Variables: {}
`
            )

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))! as DotNetCoreDebugConfiguration
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                noDebug: true,
                request: 'launch',
                debugPort: undefined,
                port: -1,
                outFilePath: '',
                handlerName: 'app.lambda_handler',
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug, appDir)
        })

        it('target=template: python 3.7 (deep project tree)', async () => {
            // Use "testFixtures/workspaceFolder/" as the project root to test
            // a deeper tree.
            const appDir = pathutil.normalize(path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/'))
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-py37-template',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    samTemplatePath: 'python3.7-plain-sam-app/template.yaml',
                    samTemplateResource: 'HelloWorldFunction',
                },
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'python3.7-plain-sam-app/template.yaml'))
            await registry.addTemplateToRegistry(templatePath)

            // Invoke with noDebug=false (the default).
            const actual = (await debugConfigProvider.makeConfig(folder, input))!
            // Expected result with noDebug=false.
            const expected: SamLaunchRequestArgs = {
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'python3.7',
                runtimeFamily: lambdaModel.RuntimeFamily.Python,
                type: AWS_SAM_DEBUG_TYPE,
                handlerName: 'app___vsctk___debug.lambda_handler',
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: pathutil.normalize(path.join(appDir, 'python3.7-plain-sam-app/hello_world')),
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    environmentVariables: {},
                    memoryMb: undefined,
                    timeoutSec: undefined,
                },
                name: 'SamLocalDebug',
                samTemplatePath: pathutil.normalize(path.join(actual.baseBuildDir ?? '?', 'input/input-template.yaml')),
                port: actual.debugPort,
                redirectOutput: false,

                //
                // Python-related fields
                //
                host: 'localhost',
                outFilePath: pathutil.normalize(
                    path.join(appDir, 'python3.7-plain-sam-app/hello_world/app___vsctk___debug.py')
                ),
                pathMappings: [
                    {
                        localRoot: pathutil.normalize(path.join(appDir, 'python3.7-plain-sam-app/hello_world')),
                        remoteRoot: '/var/task',
                    },
                ],
            }

            // Windows: pathMappings has uppercase and lowercase variants.
            // See getLocalRootVariants(). ref: 4bd1418863edd45e27
            if (os.platform() === 'win32') {
                const localRoot: string = expected.pathMappings[0].localRoot
                expected.pathMappings.unshift({
                    localRoot: localRoot.substring(0, 1).toLowerCase() + localRoot.substring(1),
                    remoteRoot: '/var/task',
                })
            }

            assertEqualLaunchConfigs(actual, expected, appDir)
            assertFileText(expected.envFile, '{"awsToolkitSamLocalResource":{}}')
            assertFileText(expected.eventPayloadFile, '{}')
            assertFileText(
                expected.samTemplatePath,
                `Resources:
  awsToolkitSamLocalResource:
    Type: 'AWS::Serverless::Function'
    Properties:
      Handler: ${expected.handlerName}
      CodeUri: >-
        ${expected.codeRoot}
      Runtime: python3.7
Globals:
  Function:
    Timeout: 3
`
            )

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))!
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                noDebug: true,
                request: 'launch',
                debugPort: undefined,
                port: -1,
                outFilePath: '',
                handlerName: 'app.lambda_handler',
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug, appDir)
        })

        it('debugconfig with extraneous env vars', async () => {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/js-manifest-in-root/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const c = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-extraneous-env',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    samTemplatePath: tempFile.fsPath,
                    samTemplateResource: resourceName,
                },
                lambda: {
                    // These are written to env-vars.json, but ignored by SAM.
                    environmentVariables: {
                        var1: '2',
                        var2: '1',
                    },
                },
            }
            testutil.toFile(
                makeSampleSamTemplateYaml(true, {
                    resourceName: resourceName,
                    runtime: 'nodejs12.x',
                    handler: 'my.test.handler',
                    codeUri: 'codeuri',
                }),
                tempFile.fsPath
            )
            await registry.addTemplateToRegistry(tempFile)
            const actual = (await debugConfigProvider.makeConfig(folder, c))!
            const tempDir = path.dirname(actual.codeRoot)

            const expected: SamLaunchRequestArgs = {
                type: AWS_SAM_DEBUG_TYPE,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: pathutil.normalize(path.join(tempDir, 'codeuri')), // Normalized to absolute path.
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'my.test.handler',
                invokeTarget: {
                    target: 'template',
                    samTemplatePath: pathutil.normalize(path.join(tempDir ?? '?', 'test.yaml')),
                    samTemplateResource: 'myResource',
                },
                lambda: {
                    environmentVariables: {
                        var1: '2',
                        var2: '1',
                    },
                    memoryMb: undefined,
                    timeoutSec: 12345, // From template.yaml.
                },
                localRoot: pathutil.normalize(path.join(tempDir, 'codeuri')), // Normalized to absolute path.
                name: 'SamLocalDebug',
                samTemplatePath: pathutil.normalize(path.join(actual.baseBuildDir ?? '?', 'input/input-template.yaml')),

                //
                // Node-related fields
                //
                address: 'localhost',
                port: actual.debugPort,
                preLaunchTask: undefined,
                protocol: 'inspector',
                remoteRoot: '/var/task',
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'nodejs12.x',
                runtimeFamily: lambdaModel.RuntimeFamily.NodeJS,
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
            }

            assertEqualLaunchConfigs(actual, expected, appDir)
            assertFileText(expected.envFile, '{"awsToolkitSamLocalResource":{"var1":"2","var2":"1"}}')
            assertFileText(expected.eventPayloadFile, '{}')
            assertFileText(
                expected.samTemplatePath,
                `Resources:
  awsToolkitSamLocalResource:
    Type: 'AWS::Serverless::Function'
    Properties:
      Handler: ${expected.handlerName}
      ${(expected.codeRoot.length > 80 ? 'CodeUri: >-\n        ' : 'CodeUri: ') + expected.codeRoot}
      Runtime: nodejs12.x
      Environment:
        Variables:
          ENVVAR: envvar
      Timeout: 12345
Globals:
  Function:
    Timeout: 5
`
            )
        })
    })
})

it('ensureRelativePaths', () => {
    let workspace: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file('/test1/'),
        name: 'test workspace',
        index: 0,
    }
    const templateConfig = createTemplateAwsSamDebugConfig(undefined, undefined, 'test name 1', '/test1/template.yaml')
    assert.strictEqual(
        (templateConfig.invokeTarget as TemplateTargetProperties).samTemplatePath,
        '/test1/template.yaml'
    )
    ensureRelativePaths(workspace, templateConfig)
    assert.strictEqual((templateConfig.invokeTarget as TemplateTargetProperties).samTemplatePath, 'template.yaml')

    const codeConfig = createCodeAwsSamDebugConfig(
        undefined,
        'testName1',
        '/test1/project',
        lambdaModel.getDefaultRuntime(lambdaModel.RuntimeFamily.NodeJS) ?? ''
    )
    assert.strictEqual((codeConfig.invokeTarget as CodeTargetProperties).projectRoot, '/test1/project')
    ensureRelativePaths(workspace, codeConfig)
    assert.strictEqual((codeConfig.invokeTarget as CodeTargetProperties).projectRoot, 'project')
})

function createBaseCodeConfig(params: {
    name?: string
    lambdaHandler?: string
    projectRoot?: string
}): AwsSamDebuggerConfiguration {
    return {
        type: AWS_SAM_DEBUG_TYPE,
        name: params.name ?? 'whats in a name',
        request: DIRECT_INVOKE_TYPE,
        invokeTarget: {
            target: CODE_TARGET_TYPE,
            lambdaHandler: params.lambdaHandler ?? 'sick handles',
            projectRoot: params.projectRoot ?? 'root as in beer',
        },
    }
}

/**
 * Gets a basic launch.json config for testing purposes, by generating the
 * config from a sample project located at `rootFolder`.
 */
async function getConfig(
    debugConfigProvider: SamDebugConfigProvider,
    registry: CloudFormationTemplateRegistry,
    rootFolder: string
): Promise<{ config: AwsSamDebuggerConfiguration; folder: vscode.WorkspaceFolder }> {
    const appDir = pathutil.normalize(path.join(testutil.getProjectDir(), rootFolder))
    const folder = testutil.getWorkspaceFolder(appDir)
    const templateFile = pathutil.normalize(path.join(appDir, 'template.yaml'))
    await registry.addTemplateToRegistry(vscode.Uri.file(templateFile))

    // Generate config(s) from a sample project.
    const configs = await debugConfigProvider.provideDebugConfigurations(folder)
    if (!configs || configs.length === 0) {
        throw Error(`failed to generate config from: ${rootFolder}`)
    }
    return {
        config: configs[0],
        folder: folder,
    }
}

function createFakeConfig(params: {
    name?: string
    target?: string
    samTemplatePath?: string
    samTemplateResource?: string
}): AwsSamDebuggerConfiguration {
    return {
        type: AWS_SAM_DEBUG_TYPE,
        name: params.name ?? 'whats in a name',
        request: DIRECT_INVOKE_TYPE,
        invokeTarget:
            !params.target || params.target === TEMPLATE_TARGET_TYPE
                ? {
                      target: TEMPLATE_TARGET_TYPE,
                      samTemplatePath: params.samTemplatePath ?? 'somewhere else',
                      samTemplateResource: params.samTemplateResource ?? 'you lack resources',
                  }
                : {
                      target: CODE_TARGET_TYPE,
                      lambdaHandler: 'test-handler',
                      projectRoot: 'test-project-root',
                  },
    }
}

async function createAndRegisterYaml(
    subValues: {
        resourceName?: string
        resourceType?: string
        runtime?: string
        handler?: string
    },
    file: vscode.Uri,
    registry: CloudFormationTemplateRegistry
) {
    testutil.toFile(makeSampleSamTemplateYaml(true, subValues), file.fsPath)
    await registry.addTemplateToRegistry(file)
}

describe('createTemplateAwsSamDebugConfig', () => {
    const name = 'my body is a template'
    const templatePath = path.join('two', 'roads', 'diverged', 'in', 'a', 'yellow', 'wood')

    it('creates a template-type SAM debugger configuration with minimal configurations', () => {
        const config = createTemplateAwsSamDebugConfig(undefined, undefined, name, templatePath)
        assert.deepStrictEqual(config, {
            name: `yellow:${name}`,
            type: AWS_SAM_DEBUG_TYPE,
            request: DIRECT_INVOKE_TYPE,
            invokeTarget: {
                target: TEMPLATE_TARGET_TYPE,
                samTemplateResource: name,
                samTemplatePath: templatePath,
            },
            lambda: {
                event: {},
                environmentVariables: {},
            },
        })
    })

    it('creates a template-type SAM debugger configuration with additional params', () => {
        const params = {
            eventJson: {
                event: 'uneventufl',
            },
            environmentVariables: {
                varial: 'invert to fakie',
            },
            dockerNetwork: 'rockerFretwork',
        }
        const config = createTemplateAwsSamDebugConfig(undefined, undefined, name, templatePath, params)
        assert.deepStrictEqual(config.lambda?.event?.json, params.eventJson)
        assert.deepStrictEqual(config.lambda?.environmentVariables, params.environmentVariables)
        assert.strictEqual(config.sam?.dockerNetwork, params.dockerNetwork)
        assert.strictEqual(config.sam?.containerBuild, undefined)
    })
})

describe('debugConfiguration', () => {
    let registry: CloudFormationTemplateRegistry
    let tempFolder: string
    let tempFile: vscode.Uri

    beforeEach(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
        tempFile = vscode.Uri.file(path.join(tempFolder, 'test.yaml'))
        registry = CloudFormationTemplateRegistry.getRegistry()
    })

    afterEach(async () => {
        await rmrf(tempFolder)
    })

    it('getCodeRoot(), getHandlerName() with invokeTarget=code', async () => {
        const folder = testutil.getWorkspaceFolder(tempFolder)
        const relativePath = 'src'
        const fullPath = pathutil.normalize(path.join(tempFolder, relativePath))

        const config = {
            type: AWS_SAM_DEBUG_TYPE,
            name: 'test debugconfig',
            request: DIRECT_INVOKE_TYPE,
            invokeTarget: {
                target: CODE_TARGET_TYPE,
                lambdaHandler: 'my.test.handler',
                projectRoot: '',
            },
            lambda: {
                runtime: [...lambdaModel.nodeJsRuntimes.values()][0],
            },
        }

        assert.strictEqual(debugConfiguration.getHandlerName(folder, config), 'my.test.handler')

        // Config with relative path:
        config.invokeTarget.projectRoot = relativePath
        assert.strictEqual(debugConfiguration.getCodeRoot(folder, config), fullPath)

        // Config with absolute path:
        config.invokeTarget.projectRoot = fullPath
        assert.strictEqual(debugConfiguration.getCodeRoot(folder, config), fullPath)
    })

    it('getCodeRoot(), getHandlerName() with invokeTarget=template', async () => {
        const folder = testutil.getWorkspaceFolder(tempFolder)
        const relativePath = 'src'
        const fullPath = pathutil.normalize(path.join(tempFolder, relativePath))

        const config = {
            type: AWS_SAM_DEBUG_TYPE,
            name: 'test debugconfig',
            request: DIRECT_INVOKE_TYPE,
            invokeTarget: {
                target: TEMPLATE_TARGET_TYPE,
                samTemplatePath: tempFile.fsPath,
                samTemplateResource: 'TestResource',
            },
            lambda: {
                runtime: [...lambdaModel.nodeJsRuntimes.values()][0],
            },
        }

        // Template with relative path:
        testutil.toFile(makeSampleSamTemplateYaml(true, { codeUri: relativePath }), tempFile.fsPath)
        await registry.addTemplateToRegistry(tempFile)
        assert.strictEqual(debugConfiguration.getCodeRoot(folder, config), fullPath)
        assert.strictEqual(debugConfiguration.getHandlerName(folder, config), 'handler')

        // Template with absolute path:
        testutil.toFile(makeSampleSamTemplateYaml(true, { codeUri: fullPath }), tempFile.fsPath)
        await registry.addTemplateToRegistry(tempFile)
        assert.strictEqual(debugConfiguration.getCodeRoot(folder, config), fullPath)
    })
})
