/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { FakeExtensionContext } from '../../../fakeExtensionContext'
import { nodeJsRuntimes } from '../../../../lambda/models/samLambdaRuntime'
import { CloudFormationTemplateRegistry } from '../../../../shared/cloudformation/templateRegistry'
import { mkdir, rmrf } from '../../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import {
    AWS_SAM_DEBUG_TYPE,
    SamDebugConfigProvider,
    CODE_TARGET_TYPE,
    DIRECT_INVOKE_TYPE,
    TEMPLATE_TARGET_TYPE,
} from '../../../../shared/sam/debugger/awsSamDebugger'
import {
    makeSampleSamTemplateYaml,
    makeSampleYamlResource,
    strToYamlFile,
} from '../../cloudformation/cloudformationTestUtils'
import { SamLaunchRequestArgs } from '../../../../shared/sam/debugger/samDebugSession'

/** Gets the full path to the project root directory. */
function getProjectDir(): string {
    return path.join(__dirname, '../../../../')
}

/** Creates a `WorkspaceFolder` for use in tests. */
function getWorkspaceFolder(dir: string): vscode.WorkspaceFolder {
    const folder = {
        uri: vscode.Uri.file(dir),
        name: 'test-workspace-folder',
        index: 0,
    }
    return folder
}

/**
 * Asserts the contents of a "launch config" (the result of
 * `resolveDebugConfiguration()` invoked on a user-provided "debug config").
 */
function assertEqualLaunchConfigs(actual: SamLaunchRequestArgs, expected: SamLaunchRequestArgs, appDir: string) {
    assert.strictEqual(actual.workspaceFolder.name, expected.workspaceFolder.name)
    assert.strictEqual(actual.workspaceFolder.uri.fsPath, expected.workspaceFolder.uri.fsPath)
    // Build dir is a generated temp dir, check that it looks reasonable.
    assert.ok(actual.baseBuildDir && actual.baseBuildDir.length > 9)
    // Remove noisy properties before doing a deep-compare.
    for (const o of [actual, expected]) {
        delete (o as any).documentUri
        delete (o as any).baseBuildDir
        delete (o as any).samTemplatePath
        delete (o as any).originalSamTemplatePath
        delete (o as any).workspaceFolder
        delete (o as any).configOnly
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
    const validRuntime = [...nodeJsRuntimes.values()][0]
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
            const resolved = await debugConfigProvider.resolveDebugConfiguration(undefined, {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    samTemplatePath: 'not here',
                    samTemplateResource: 'you lack resources',
                },
            })
            assert.strictEqual(resolved, undefined)
        })

        it("returns undefined when resolving template debug configurations with a template that doesn't have the set resource", async () => {
            await strToYamlFile(makeSampleSamTemplateYaml(true), tempFile.fsPath)
            await registry.addTemplateToRegistry(tempFile)
            const resolved = await debugConfigProvider.resolveDebugConfiguration(undefined, {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    samTemplatePath: tempFile.fsPath,
                    samTemplateResource: 'you lack resources',
                },
            })
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
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'sick handles',
                    projectRoot: 'root as in beer',
                },
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
                configOnly: true,
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

        it('target=code', async () => {
            const appDir = path.join(getProjectDir(), 'integrationTest-samples/js-manifest-in-root/')
            const folder = getWorkspaceFolder(appDir)
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
            ;(c as any).configOnly = true
            const actual = (await debugConfigProvider.resolveDebugConfiguration(folder, c))!!
            const expected: SamLaunchRequestArgs = {
                type: 'node', // Input "aws-sam", output "node".
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.parse(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                codeRoot: path.join(appDir, 'src'), // Normalized to absolute path.
                debugPort: 5858,
                documentUri: vscode.Uri.parse(''), // TODO: remove or test.
                handlerName: 'my.test.handler',
                invokeTarget: {
                    lambdaHandler: 'my.test.handler',
                    projectRoot: 'src',
                    target: 'code',
                },
                lambda: {
                    runtime: 'nodejs12.x',
                },
                localRoot: path.join(appDir, 'src'), // Normalized to absolute path.
                name: 'SamLocalDebug', // "name": "whats in a name"
                originalHandlerName: 'my.test.handler',
                originalSamTemplatePath: '?',
                samTemplatePath: path.join(actual.baseBuildDir ?? '?', 'input/input-template.yaml'),

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
                runtimeFamily: 1,
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
            }

            assertEqualLaunchConfigs(actual, expected, appDir)
        })

        it('target=template', async () => {
            const appDir = path.join(getProjectDir(), 'integrationTest-samples/js-manifest-in-root/')
            const folder = getWorkspaceFolder(appDir)
            const c = {
                configOnly: true,
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    samTemplatePath: tempFile.fsPath,
                    samTemplateResource: resourceName,
                },
            }
            ;(c as any).configOnly = true
            await strToYamlFile(
                makeSampleSamTemplateYaml(true, {
                    resourceName: resourceName,
                    runtime: validRuntime,
                    handler: 'my.test.handler',
                }),
                tempFile.fsPath
            )
            await registry.addTemplateToRegistry(tempFile)
            const actual = (await debugConfigProvider.resolveDebugConfiguration(folder, c))!!
            const tempDir = path.dirname(actual.codeRoot)

            const expected: SamLaunchRequestArgs = {
                type: 'node', // Input "aws-sam", output "node".
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.parse(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                codeRoot: path.join(tempDir, 'codeuri'), // Normalized to absolute path.
                debugPort: 5858,
                documentUri: vscode.Uri.parse(''), // TODO: remove or test.
                handlerName: 'my.test.handler',
                invokeTarget: {
                    target: 'template',
                    samTemplatePath: path.join(tempDir ?? '?', 'test.yaml'),
                    samTemplateResource: 'myResource',
                },
                localRoot: path.join(tempDir, 'codeuri'), // Normalized to absolute path.
                name: 'SamLocalDebug', // "name": "whats in a name"
                originalHandlerName: 'my.test.handler',
                originalSamTemplatePath: '?',
                samTemplatePath: path.join(tempDir ?? '?', 'input/input-template.yaml'),

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
                runtimeFamily: 1,
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
            }

            assertEqualLaunchConfigs(actual, expected, appDir)
        })

        it('debugconfig with extraneous env vars', async () => {
            const appDir = path.join(getProjectDir(), 'integrationTest-samples/js-manifest-in-root/')
            const folder = getWorkspaceFolder(appDir)
            const c = {
                configOnly: true,
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
            ;(c as any).configOnly = true
            await strToYamlFile(
                makeSampleSamTemplateYaml(true, {
                    resourceName: resourceName,
                    runtime: validRuntime,
                    handler: 'my.test.handler',
                }),
                tempFile.fsPath
            )
            await registry.addTemplateToRegistry(tempFile)
            const actual = (await debugConfigProvider.resolveDebugConfiguration(folder, c))!!
            const tempDir = path.dirname(actual.codeRoot)

            const expected: SamLaunchRequestArgs = {
                type: 'node', // Input "aws-sam", output "node".
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.parse(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                codeRoot: path.join(tempDir, 'codeuri'), // Normalized to absolute path.
                debugPort: 5858,
                documentUri: vscode.Uri.parse(''), // TODO: remove or test.
                handlerName: 'my.test.handler',
                invokeTarget: {
                    target: 'template',
                    samTemplatePath: path.join(tempDir ?? '?', 'test.yaml'),
                    samTemplateResource: 'myResource',
                },
                lambda: {
                    environmentVariables: {
                        var1: 2,
                        var2: '1',
                    },
                },
                localRoot: path.join(tempDir, 'codeuri'), // Normalized to absolute path.
                name: 'SamLocalDebug', // "name": "whats in a name"
                originalHandlerName: 'my.test.handler',
                originalSamTemplatePath: '?',
                samTemplatePath: path.join(tempDir ?? '?', 'input/input-template.yaml'),

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
                runtimeFamily: 1,
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
            }

            assertEqualLaunchConfigs(actual, expected, appDir)
        })
    })
})
