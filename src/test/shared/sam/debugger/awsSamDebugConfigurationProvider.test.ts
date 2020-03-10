/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { nodeJsRuntimes } from '../../../../lambda/models/samLambdaRuntime'
import { CloudFormationTemplateRegistry } from '../../../../shared/cloudformation/templateRegistry'
import { rmrf } from '../../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import {
    AWS_SAM_DEBUG_TYPE,
    AwsSamDebugConfigurationProvider,
    CODE_TARGET_TYPE,
    DIRECT_INVOKE_TYPE,
    TEMPLATE_TARGET_TYPE
} from '../../../../shared/sam/debugger/awsSamDebugger'
import { makeSampleSamTemplateYaml, strToYamlFile } from '../../cloudformation/cloudformationTestUtils'

// TODO!!!!! Remove all tests prefaced with 'TEMP!!! - '
describe('AwsSamDebugConfigurationProvider', async () => {
    let debugConfigProvider: AwsSamDebugConfigurationProvider
    let registry: CloudFormationTemplateRegistry
    let tempFolder: string
    let tempFile: vscode.Uri

    const validRuntime = [...nodeJsRuntimes.values()][0]
    const resourceName = 'myResource'

    beforeEach(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
        tempFile = vscode.Uri.file(path.join(tempFolder, 'test.yaml'))
        registry = new CloudFormationTemplateRegistry()
        debugConfigProvider = new AwsSamDebugConfigurationProvider(registry)
    })

    afterEach(async () => {
        await rmrf(tempFolder)
    })

    describe('provideDebugConfig', async () => {
        it('TEMP!!! - returns undefined when providing debug configurations', async () => {
            const provided = await debugConfigProvider.provideDebugConfigurations(undefined)
            assert.strictEqual(provided, undefined)
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
                    projectRoot: 'root as in beer'
                }
            })
            assert.strictEqual(resolved, undefined)
        })

        it('returns undefined when resolving debug configurations with an invalid target type', async () => {
            const resolved = await debugConfigProvider.resolveDebugConfiguration(undefined, {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: 'not-code',
                    lambdaHandler: 'sick handles',
                    projectRoot: 'root as in beer'
                }
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
                    samTemplateResource: 'you lack resources'
                }
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
                    samTemplateResource: 'you lack resources'
                }
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
                    samTemplateResource: resourceName
                }
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
                    projectRoot: 'root as in beer'
                },
                lambda: {
                    runtime: 'COBOL'
                }
            })
            assert.strictEqual(resolved, undefined)
        })

        it('TEMP!!! - returns undefined when resolving a valid code debug configuration', async () => {
            const debugConfig = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'sick handles',
                    projectRoot: 'root as in beer'
                },
                lambda: {
                    runtime: validRuntime
                }
            }
            assert.deepStrictEqual(
                await debugConfigProvider.resolveDebugConfiguration(undefined, debugConfig),
                undefined
            )
        })

        it('TEMP!!! - returns undefined when resolving a valid template debug configuration', async () => {
            const debugConfig = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    samTemplatePath: tempFile.fsPath,
                    samTemplateResource: resourceName
                }
            }
            await strToYamlFile(
                makeSampleSamTemplateYaml(true, { resourceName, runtime: validRuntime }),
                tempFile.fsPath
            )
            await registry.addTemplateToRegistry(tempFile)
            assert.deepStrictEqual(
                await debugConfigProvider.resolveDebugConfiguration(undefined, debugConfig),
                undefined
            )
        })

        it('TEMP!!! - returns undefined when resolving a valid template debug configuration that specifies extraneous environment variables', async () => {
            const debugConfig = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    samTemplatePath: tempFile.fsPath,
                    samTemplateResource: resourceName
                },
                lambda: {
                    environmentVariables: {
                        var1: 2,
                        var2: '1'
                    }
                }
            }
            await strToYamlFile(
                makeSampleSamTemplateYaml(true, { resourceName, runtime: validRuntime }),
                tempFile.fsPath
            )
            await registry.addTemplateToRegistry(tempFile)
            assert.deepStrictEqual(
                await debugConfigProvider.resolveDebugConfiguration(undefined, debugConfig),
                undefined
            )
        })
    })
})
