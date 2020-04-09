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
    TemplateTargetProperties,
    AwsSamDebuggerConfiguration,
} from '../../../../shared/sam/debugger/awsSamDebugConfiguration'
import {
    SamDebugConfigProvider,
    createDirectInvokeSamDebugConfiguration,
} from '../../../../shared/sam/debugger/awsSamDebugger'
import {
    makeSampleSamTemplateYaml,
    makeSampleYamlResource,
    strToYamlFile,
} from '../../cloudformation/cloudformationTestUtils'
import {
    AWS_SAM_DEBUG_TYPE,
    CODE_TARGET_TYPE,
    DIRECT_INVOKE_TYPE,
    TEMPLATE_TARGET_TYPE,
} from '../../../../lambda/local/debugConfiguration'

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
        const fakeContext = new FakeExtensionContext()
        tempFolder = await makeTemporaryToolkitFolder()
        tempFile = vscode.Uri.file(path.join(tempFolder, 'test.yaml'))
        registry = new CloudFormationTemplateRegistry()
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
        it('returns undefined if no workspace folder is provided', async () => {
            const provided = await debugConfigProvider.provideDebugConfigurations(undefined)
            assert.strictEqual(provided, undefined)
        })

        it('returns a blank array if no templates are in the workspace', async () => {
            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.deepStrictEqual(provided, [])
        })

        it('returns an array with a single item if a template with one resource is in the workspace', async () => {
            await createAndRegisterYaml({}, tempFile, registry)
            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.notStrictEqual(provided, undefined)
            assert.strictEqual(provided!.length, 1)
            assert.strictEqual(provided![0].name, 'TestResource')
        })

        it('returns an array with multiple items if a template with more than one resource is in the workspace', async () => {
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

            await createAndRegisterYaml({ resourceName: resources[0] }, tempFile, registry)
            await createAndRegisterYaml({ resourceName: resources[1] }, nestedYaml, registry)
            await createAndRegisterYaml({ resourceName: badResourceName }, similarNameYaml, registry)

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
            const resolved = await debugConfigProvider.resolveDebugConfiguration(
                undefined,
                createBaseTemplateConfig({})
            )
            assert.strictEqual(resolved, undefined)
        })

        it("returns undefined when resolving template debug configurations with a template that doesn't have the set resource", async () => {
            await createAndRegisterYaml({}, tempFile, registry)
            const resolved = await debugConfigProvider.resolveDebugConfiguration(
                undefined,
                createBaseTemplateConfig({ samTemplatePath: tempFile.fsPath })
            )
            assert.strictEqual(resolved, undefined)
        })

        it('returns undefined when resolving template debug configurations with a resource that has an invalid runtime in template', async () => {
            await createAndRegisterYaml({ resourceName, runtime: 'moreLikeRanOutOfTime' }, tempFile, registry)
            const resolved = await debugConfigProvider.resolveDebugConfiguration(
                undefined,
                createBaseTemplateConfig({
                    samTemplatePath: tempFile.fsPath,
                    samTemplateResource: resourceName,
                })
            )
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
            // Register with *full* path.
            await createAndRegisterYaml({}, tempFile, registry)
            // Simulates launch.json:
            //     "invokeTarget": {
            //         "target": "./test.yaml",
            //     },
            const relPath = './' + path.relative(fakeWorkspaceFolder.uri.path, tempFile.path)

            // Assert that the relative path correctly maps to the full path in the registry.
            const name = 'Test rel path'
            const resolved = await debugConfigProvider.resolveDebugConfiguration(
                fakeWorkspaceFolder,
                createBaseTemplateConfig({
                    samTemplatePath: relPath,
                    samTemplateResource: 'TestResource',
                    name,
                })
            )
            assert.strictEqual(resolved!.name, name)
        })
        it('target=code', async () => {
            const debugConfig = {
                ...createBaseCodeConfig({}),
                lambda: {
                    runtime: validRuntime,
                },
            }
            assert.deepStrictEqual(
                await debugConfigProvider.resolveDebugConfiguration(undefined, debugConfig),
                debugConfig
            )
        })

        it('target=template', async () => {
            const debugConfig = createBaseTemplateConfig({
                samTemplatePath: tempFile.fsPath,
                samTemplateResource: resourceName,
            })
            await createAndRegisterYaml({ resourceName, runtime: validRuntime }, tempFile, registry)
            assert.deepStrictEqual(
                await debugConfigProvider.resolveDebugConfiguration(undefined, debugConfig),
                debugConfig
            )
        })

        it('valid debugconfig with extraneous env vars', async () => {
            const debugConfig = {
                ...createBaseTemplateConfig({
                    samTemplatePath: tempFile.fsPath,
                    samTemplateResource: resourceName,
                }),
                lambda: {
                    environmentVariables: {
                        var1: 2,
                        var2: '1',
                    },
                },
            }

            await createAndRegisterYaml({ resourceName, runtime: validRuntime }, tempFile, registry)
            assert.deepStrictEqual(
                await debugConfigProvider.resolveDebugConfiguration(undefined, debugConfig),
                debugConfig
            )
        })
    })
})

describe('createDirectInvokeSamDebugConfiguration', () => {
    const name = 'my body is a template'
    const templatePath = path.join('two', 'roads', 'diverged', 'in', 'a', 'yellow', 'wood')

    it('creates a template-type SAM debugger configuration with minimal configurations', () => {
        const config = createDirectInvokeSamDebugConfiguration(name, templatePath)
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
        const config = createDirectInvokeSamDebugConfiguration(name, templatePath, params)
        assert.deepStrictEqual(config.lambda?.event?.json, params.eventJson)
        assert.deepStrictEqual(config.lambda?.environmentVariables, params.environmentVariables)
        assert.strictEqual(config.sam?.dockerNetwork, params.dockerNetwork)
        assert.strictEqual(config.sam?.containerBuild, undefined)
    })
})

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

function createBaseTemplateConfig(params: {
    name?: string
    samTemplatePath?: string
    samTemplateResource?: string
}): AwsSamDebuggerConfiguration {
    return {
        type: AWS_SAM_DEBUG_TYPE,
        name: params.name ?? 'whats in a name',
        request: DIRECT_INVOKE_TYPE,
        invokeTarget: {
            target: TEMPLATE_TARGET_TYPE,
            samTemplatePath: params.samTemplatePath ?? 'somewhere else',
            samTemplateResource: params.samTemplateResource ?? 'you lack resources',
        },
    }
}

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
