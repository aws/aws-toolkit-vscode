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
} from '../../../../shared/sam/debugger/awsSamDebugConfiguration'
import { SamDebugConfigProvider } from '../../../../shared/sam/debugger/awsSamDebugger'
import { SamLaunchRequestArgs } from '../../../../shared/sam/debugger/samDebugSession'
import * as debugConfiguration from '../../../../lambda/local/debugConfiguration'
import * as pathutil from '../../../../shared/utilities/pathUtils'
import { FakeExtensionContext } from '../../../fakeExtensionContext'
import * as testutil from '../../../testUtil'
import {
    makeSampleSamTemplateYaml,
    makeSampleYamlResource,
    strToYamlFile,
} from '../../cloudformation/cloudformationTestUtils'

/**
 * Asserts the contents of a "launch config" (the result of
 * `resolveDebugConfiguration()` invoked on a user-provided "debug config").
 */
function assertEqualLaunchConfigs(actual: SamLaunchRequestArgs, expected: SamLaunchRequestArgs, appDir: string) {
    assert.strictEqual(actual.workspaceFolder.name, expected.workspaceFolder.name)

    // Compare filepaths (before removing them for deep-compare).
    testutil.assertEqualPaths(actual.workspaceFolder.uri.fsPath, expected.workspaceFolder.uri.fsPath)
    testutil.assertEqualPaths(actual.codeRoot, expected.codeRoot)
    testutil.assertEqualPaths(actual.debuggerPath ?? '', expected.debuggerPath ?? '')
    testutil.assertEqualPaths(
        (actual.localRoot as string | undefined) ?? '',
        (expected.localRoot as string | undefined) ?? ''
    )

    // Build dir is randomly-generated; check that it looks reasonable.
    assert.ok(actual.baseBuildDir && actual.baseBuildDir.length > 9)
    if (expected.type === 'python') {
        // manifestPath is randomly-generated; check that it looks reasonable.
        assert.ok(actual.manifestPath && actual.manifestPath.length > 9)
    }

    // Remove noisy properties before doing a deep-compare.
    for (const o of [actual, expected]) {
        delete o.manifestPath
        delete o.documentUri
        delete o.baseBuildDir
        delete o.samTemplatePath
        delete o.originalSamTemplatePath
        delete o.workspaceFolder
        delete o.codeRoot
        delete (o as any).localRoot // Node-only
        delete (o as any).debuggerPath // Dotnet-only
    }
    assert.deepStrictEqual(actual, expected)
}

describe('AwsSamDebugConfigurationProvider', async () => {
    let debugConfigProvider: SamDebugConfigProvider
    let registry: CloudFormationTemplateRegistry
    let tempFolder: string
    let tempFolderSimilarName: string | undefined
    let tempFile: vscode.Uri
    let fakeWorkspaceFolder: vscode.WorkspaceFolder
    const validRuntime = [...lambdaModel.nodeJsRuntimes.values()][0]
    const resourceName = 'myResource'

    beforeEach(async () => {
        const fakeContext = await FakeExtensionContext.getNew()
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
            await strToYamlFile('bogus', tempFile.fsPath)
            await registry.addTemplateToRegistry(tempFile)
            assert.deepStrictEqual(await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder), [])
        })

        it('returns one item if a template with one resource is in the workspace', async () => {
            await strToYamlFile(makeSampleSamTemplateYaml(true), tempFile.fsPath)
            await registry.addTemplateToRegistry(tempFile)
            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.notStrictEqual(provided, undefined)
            assert.strictEqual(provided!.length, 1)
            assert.strictEqual(provided![0].name, 'TestResource')
        })

        it('returns multiple items if a template with multiple resources is in the workspace', async () => {
            const resources = ['resource1', 'resource2']
            const bigYamlStr = `${makeSampleSamTemplateYaml(true, {
                resourceName: resources[0],
            })}\n${makeSampleYamlResource({ resourceName: resources[1] })}`
            await strToYamlFile(bigYamlStr, tempFile.fsPath)
            await registry.addTemplateToRegistry(tempFile)
            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.notStrictEqual(provided, undefined)
            if (provided) {
                assert.strictEqual(provided.length, 2)
                assert.ok(resources.includes(provided[0].name))
                assert.ok(resources.includes(provided[1].name))
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

            await strToYamlFile(makeSampleSamTemplateYaml(true, { resourceName: resources[0] }), tempFile.fsPath)
            await strToYamlFile(makeSampleSamTemplateYaml(true, { resourceName: resources[1] }), nestedYaml.fsPath)
            await strToYamlFile(
                makeSampleSamTemplateYaml(true, { resourceName: badResourceName }),
                similarNameYaml.fsPath
            )

            await registry.addTemplateToRegistry(tempFile)
            await registry.addTemplateToRegistry(nestedYaml)
            await registry.addTemplateToRegistry(similarNameYaml)

            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.notStrictEqual(provided, undefined)
            if (provided) {
                assert.strictEqual(provided.length, 2)
                assert.ok(resources.includes(provided[0].name))
                assert.ok(resources.includes(provided[1].name))
                assert.ok(!resources.includes(badResourceName))
            }
        })
    })

    describe('resolveDebugConfiguration', async () => {
        it('failure modes', async () => {
            const config = await getConfig(
                debugConfigProvider,
                registry,
                'testFixtures/workspaceFolder/csharp2.1-plain-sam-app/'
            )

            // No workspace folder:
            assert.deepStrictEqual(
                await debugConfigProvider.resolveDebugConfiguration(undefined, config.config),
                undefined
            )

            // Unknown runtime:
            config.config.lambda = {
                runtime: 'happy-runtime-42',
            }
            assert.deepStrictEqual(
                await debugConfigProvider.resolveDebugConfiguration(config.folder, config.config),
                undefined
            )
        })

        it('returns undefined when resolving debug configurations with an invalid request type', async () => {
            const resolved = await debugConfigProvider.resolveDebugConfiguration(undefined, {
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
            const resolved = await debugConfigProvider.resolveDebugConfiguration(undefined, {
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
            const resolved = await debugConfigProvider.resolveDebugConfiguration(undefined, createFakeConfig({}))
            assert.strictEqual(resolved, undefined)
        })

        it("returns undefined when resolving template debug configurations with a template that doesn't have the set resource", async () => {
            await createAndRegisterYaml({}, tempFile, registry)
            const resolved = await debugConfigProvider.resolveDebugConfiguration(
                undefined,
                createFakeConfig({ samTemplatePath: tempFile.fsPath })
            )
            assert.strictEqual(resolved, undefined)
        })

        it('returns undefined when resolving template debug configurations with a resource that has an invalid runtime in template', async () => {
            await createAndRegisterYaml({ resourceName, runtime: 'moreLikeRanOutOfTime' }, tempFile, registry)
            const resolved = await debugConfigProvider.resolveDebugConfiguration(
                undefined,
                createFakeConfig({
                    samTemplatePath: tempFile.fsPath,
                    samTemplateResource: resourceName,
                })
            )
            assert.strictEqual(resolved, undefined)
        })

        it('returns undefined when resolving template debug configurations with a resource that has an invalid runtime in template', async () => {
            await strToYamlFile(
                makeSampleSamTemplateYaml(true, { resourceName, runtime: 'moreLikeRanOutOfTime' }),
                tempFile.fsPath
            )
            await registry.addTemplateToRegistry(tempFile)
            const resolved = await debugConfigProvider.resolveDebugConfiguration(undefined, {
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
            const resolved = await debugConfigProvider.resolveDebugConfiguration(undefined, {
                ...createBaseCodeConfig({}),
                lambda: {
                    runtime: 'COBOL',
                },
            })
            assert.strictEqual(resolved, undefined)
        })

        it('supports workspace-relative template path ("./foo.yaml")', async () => {
            await strToYamlFile(makeSampleSamTemplateYaml(true, { runtime: 'nodejs12.x' }), tempFile.fsPath)
            // Register with *full* path.
            await registry.addTemplateToRegistry(tempFile)
            // Simulates launch.json:
            //     "invokeTarget": {
            //         "target": "./test.yaml",
            //     },
            const relPath = './' + path.relative(fakeWorkspaceFolder.uri.path, tempFile.path)

            // Assert that the relative path correctly maps to the full path in the registry.
            const name = 'Test rel path'
            const resolved = await debugConfigProvider.resolveDebugConfiguration(fakeWorkspaceFolder, {
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
            const c = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'my.test.handler',
                    projectRoot: 'src',
                },
                lambda: {
                    runtime: validRuntime,
                },
            }
            const actual = (await debugConfigProvider.resolveDebugConfiguration(folder, c))!
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
                codeRoot: pathutil.normalize(path.join(appDir, 'src')), // Normalized to absolute path.
                debugPort: 5858,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'my.test.handler',
                invokeTarget: {
                    lambdaHandler: 'my.test.handler',
                    projectRoot: 'src',
                    target: 'code',
                },
                lambda: {
                    runtime: 'nodejs12.x',
                },
                localRoot: pathutil.normalize(path.join(appDir, 'src')), // Normalized to absolute path.
                name: 'SamLocalDebug',
                originalHandlerName: 'my.test.handler',
                originalSamTemplatePath: '?',
                samTemplatePath: pathutil.normalize(path.join(actual.baseBuildDir ?? '?', 'input/input-template.yaml')),

                //
                // Node-related fields
                //
                address: 'localhost',
                port: 5858,
                preLaunchTask: undefined,
                protocol: 'inspector',
                remoteRoot: '/var/task',
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
            }

            assertEqualLaunchConfigs(actual, expected, appDir)
        })

        it('target=template: javascript', async () => {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/js-manifest-in-root/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const c = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    samTemplatePath: tempFile.fsPath,
                    samTemplateResource: resourceName,
                },
            }
            await strToYamlFile(
                makeSampleSamTemplateYaml(true, {
                    resourceName: resourceName,
                    runtime: validRuntime,
                    handler: 'my.test.handler',
                    codeUri: 'codeuri',
                }),
                tempFile.fsPath
            )
            await registry.addTemplateToRegistry(tempFile)
            const actual = (await debugConfigProvider.resolveDebugConfiguration(folder, c))!
            const tempDir = path.dirname(actual.codeRoot)

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
                codeRoot: pathutil.normalize(path.join(tempDir, 'codeuri')), // Normalized to absolute path.
                debugPort: 5858,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'my.test.handler',
                invokeTarget: {
                    target: 'template',
                    samTemplatePath: pathutil.normalize(path.join(tempDir ?? '?', 'test.yaml')),
                    samTemplateResource: 'myResource',
                },
                localRoot: pathutil.normalize(path.join(tempDir, 'codeuri')), // Normalized to absolute path.
                name: 'SamLocalDebug',
                originalHandlerName: 'my.test.handler',
                originalSamTemplatePath: '?',
                samTemplatePath: pathutil.normalize(path.join(tempDir ?? '?', 'input/input-template.yaml')),

                //
                // Node-related fields
                //
                address: 'localhost',
                port: 5858,
                preLaunchTask: undefined,
                protocol: 'inspector',
                remoteRoot: '/var/task',
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
            }

            assertEqualLaunchConfigs(actual, expected, appDir)
        })

        it('target=code: dotnet/csharp', async () => {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/csharp2.1-plain-sam-app/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const c = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'Test debugconfig',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                    projectRoot: 'src/HelloWorld/',
                },
                lambda: {
                    runtime: 'dotnetcore2.1',
                },
            }
            const actual = (await debugConfigProvider.resolveDebugConfiguration(
                folder,
                c
            ))! as DotNetCoreDebugConfiguration
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
                codeRoot: pathutil.normalize(path.join(appDir, 'src/HelloWorld')), // Normalized to absolute path.
                debugPort: 5858,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                invokeTarget: {
                    lambdaHandler: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                    projectRoot: 'src/HelloWorld/',
                    target: 'code',
                },
                lambda: {
                    runtime: 'dotnetcore2.1',
                },
                name: 'SamLocalDebug',
                originalHandlerName: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                originalSamTemplatePath: '?',
                samTemplatePath: pathutil.normalize(path.join(actual.baseBuildDir ?? '?', 'input/input-template.yaml')),

                //
                // Csharp-related fields
                //
                debuggerPath: pathutil.normalize(path.join(path.join(appDir, 'src/HelloWorld'), '.vsdbg')),
                processId: '1',
                pipeTransport: {
                    debuggerPath: '/tmp/lambci_debug_files/vsdbg',
                    // tslint:disable-next-line: no-invalid-template-strings
                    pipeArgs: ['-c', 'docker exec -i $(docker ps -q -f publish=5858) ${debuggerCommand}'],
                    pipeCwd: pathutil.normalize(path.join(appDir, 'src/HelloWorld')),
                    pipeProgram: 'sh',
                },
                sourceFileMap: {
                    '/var/task': pathutil.normalize(path.join(appDir, 'src/HelloWorld')),
                },
                windows: {
                    pipeTransport: {
                        debuggerPath: '/tmp/lambci_debug_files/vsdbg',
                        // tslint:disable-next-line: no-invalid-template-strings
                        pipeArgs: ['-c', 'docker exec -i $(docker ps -q -f publish=5858) ${debuggerCommand}'],
                        pipeCwd: pathutil.normalize(path.join(appDir, 'src/HelloWorld')),
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
        })

        it('target=code: python 3.7', async () => {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/python3.7-plain-sam-app/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const c = {
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
                },
            }
            const actual = (await debugConfigProvider.resolveDebugConfiguration(
                folder,
                c
            ))! as DotNetCoreDebugConfiguration
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
                codeRoot: pathutil.normalize(path.join(appDir, 'hello_world')),
                debugPort: 5858,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                invokeTarget: {
                    lambdaHandler: 'app.lambda_handler',
                    projectRoot: 'hello_world',
                    target: 'code',
                },
                lambda: {
                    runtime: 'python3.7',
                },
                name: 'SamLocalDebug',
                noDebug: false,
                originalHandlerName: 'app___vsctk___debug.lambda_handler',
                originalSamTemplatePath: '?',
                samTemplatePath: pathutil.normalize(path.join(actual.baseBuildDir ?? '?', 'input/input-template.yaml')),
                port: 5858,
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
        })

        it('debugconfig with extraneous env vars', async () => {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/js-manifest-in-root/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const c = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    samTemplatePath: tempFile.fsPath,
                    samTemplateResource: resourceName,
                },
                lambda: {
                    environmentVariables: {
                        var1: 2,
                        var2: '1',
                    },
                },
            }
            await strToYamlFile(
                makeSampleSamTemplateYaml(true, {
                    resourceName: resourceName,
                    runtime: validRuntime,
                    handler: 'my.test.handler',
                    codeUri: 'codeuri',
                }),
                tempFile.fsPath
            )
            await registry.addTemplateToRegistry(tempFile)
            const actual = (await debugConfigProvider.resolveDebugConfiguration(folder, c))!
            const tempDir = path.dirname(actual.codeRoot)

            const expected: SamLaunchRequestArgs = {
                type: AWS_SAM_DEBUG_TYPE,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                codeRoot: pathutil.normalize(path.join(tempDir, 'codeuri')), // Normalized to absolute path.
                debugPort: 5858,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'my.test.handler',
                invokeTarget: {
                    target: 'template',
                    samTemplatePath: pathutil.normalize(path.join(tempDir ?? '?', 'test.yaml')),
                    samTemplateResource: 'myResource',
                },
                lambda: {
                    environmentVariables: {
                        var1: 2,
                        var2: '1',
                    },
                },
                localRoot: pathutil.normalize(path.join(tempDir, 'codeuri')), // Normalized to absolute path.
                name: 'SamLocalDebug',
                originalHandlerName: 'my.test.handler',
                originalSamTemplatePath: '?',
                samTemplatePath: pathutil.normalize(path.join(tempDir ?? '?', 'input/input-template.yaml')),

                //
                // Node-related fields
                //
                address: 'localhost',
                port: 5858,
                preLaunchTask: undefined,
                protocol: 'inspector',
                remoteRoot: '/var/task',
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'nodejs12.x',
                runtimeFamily: lambdaModel.RuntimeFamily.NodeJS,
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
            }

            assertEqualLaunchConfigs(actual, expected, appDir)
        })
    })
})

describe('createTemplateAwsSamDebugConfig', () => {
    const name = 'my body is a template'
    const templatePath = path.join('two', 'roads', 'diverged', 'in', 'a', 'yellow', 'wood')

    it('creates a template-type SAM debugger configuration with minimal configurations', () => {
        const config = createTemplateAwsSamDebugConfig(name, templatePath)
        assert.strictEqual(config.invokeTarget.target, TEMPLATE_TARGET_TYPE)
        const invokeTarget = config.invokeTarget as TemplateTargetProperties
        assert.strictEqual(config.name, name)
        assert.strictEqual(invokeTarget.samTemplateResource, name)
        assert.strictEqual(invokeTarget.samTemplatePath, templatePath)
        assert.ok(!config.hasOwnProperty('lambda'))
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
        const config = createTemplateAwsSamDebugConfig(name, templatePath, params)
        assert.deepStrictEqual(config.lambda?.event?.json, params.eventJson)
        assert.deepStrictEqual(config.lambda?.environmentVariables, params.environmentVariables)
        assert.strictEqual(config.sam?.dockerNetwork, params.dockerNetwork)
        assert.strictEqual(config.sam?.containerBuild, undefined)
    })
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
    await strToYamlFile(makeSampleSamTemplateYaml(true, subValues), file.fsPath)
    await registry.addTemplateToRegistry(file)
}

describe('createTemplateAwsSamDebugConfig', () => {
    const name = 'my body is a template'
    const templatePath = path.join('two', 'roads', 'diverged', 'in', 'a', 'yellow', 'wood')

    it('creates a template-type SAM debugger configuration with minimal configurations', () => {
        const config = createTemplateAwsSamDebugConfig(name, templatePath)
        assert.strictEqual(config.invokeTarget.target, TEMPLATE_TARGET_TYPE)
        const invokeTarget = config.invokeTarget as TemplateTargetProperties
        assert.strictEqual(config.name, name)
        assert.strictEqual(invokeTarget.samTemplateResource, name)
        assert.strictEqual(invokeTarget.samTemplatePath, templatePath)
        assert.ok(!config.hasOwnProperty('lambda'))
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
        const config = createTemplateAwsSamDebugConfig(name, templatePath, params)
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

        assert.strictEqual(debugConfiguration.getHandlerName(config), 'my.test.handler')

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
        await strToYamlFile(makeSampleSamTemplateYaml(true, { codeUri: relativePath }), tempFile.fsPath)
        await registry.addTemplateToRegistry(tempFile)
        assert.strictEqual(debugConfiguration.getCodeRoot(folder, config), fullPath)
        assert.strictEqual(debugConfiguration.getHandlerName(config), 'handler')

        // Template with absolute path:
        await strToYamlFile(makeSampleSamTemplateYaml(true, { codeUri: fullPath }), tempFile.fsPath)
        await registry.addTemplateToRegistry(tempFile)
        assert.strictEqual(debugConfiguration.getCodeRoot(folder, config), fullPath)
    })
})
