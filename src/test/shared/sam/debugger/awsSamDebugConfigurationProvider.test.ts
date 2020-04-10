/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { CloudFormationTemplateRegistry } from '../../../../shared/cloudformation/templateRegistry'
import { mkdir, rmrf } from '../../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import {
    AWS_SAM_DEBUG_TYPE,
    AwsSamDebuggerConfiguration,
    CODE_TARGET_TYPE,
} from '../../../../shared/sam/debugger/awsSamDebugConfiguration'
import { AwsSamDebugConfigurationProvider } from '../../../../shared/sam/debugger/awsSamDebugConfigurationProvider'
import {
    AwsSamDebugConfigurationValidator,
    ValidationResult,
} from '../../../../shared/sam/debugger/awsSamDebugConfigurationValidator'
import {
    makeSampleSamTemplateYaml,
    makeSampleYamlResource,
    strToYamlFile,
} from '../../cloudformation/cloudformationTestUtils'

class AlwaysValidValidator implements AwsSamDebugConfigurationValidator {
    public isValidSamDebugConfiguration(debugConfiguration: AwsSamDebuggerConfiguration): boolean {
        return true
    }

    public validateSamDebugConfiguration(debugConfiguration: AwsSamDebuggerConfiguration): ValidationResult {
        return { isValid: true }
    }
}

class NeverValidValidator implements AwsSamDebugConfigurationValidator {
    public isValidSamDebugConfiguration(debugConfiguration: AwsSamDebuggerConfiguration): boolean {
        return false
    }

    public validateSamDebugConfiguration(debugConfiguration: AwsSamDebuggerConfiguration): ValidationResult {
        return { isValid: false, message: 'Always false' }
    }
}

// TODO!!!!! Remove all tests prefaced with 'TEMP!!! - '
describe('AwsSamDebugConfigurationProvider', async () => {
    const config: AwsSamDebuggerConfiguration = {
        type: AWS_SAM_DEBUG_TYPE,
        name: 'whats in a name',
        request: 'not-direct-invoke',
        invokeTarget: {
            target: CODE_TARGET_TYPE,
            lambdaHandler: 'sick handles',
            projectRoot: 'root as in beer',
        },
    }

    let debugConfigProvider: AwsSamDebugConfigurationProvider
    let alwaysInvalidDebugConfigProvider: AwsSamDebugConfigurationProvider
    let registry: CloudFormationTemplateRegistry
    let tempFolder: string
    let tempFolderSimilarName: string | undefined
    let tempFile: vscode.Uri
    let fakeWorkspaceFolder: vscode.WorkspaceFolder

    beforeEach(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
        tempFile = vscode.Uri.file(path.join(tempFolder, 'test.yaml'))
        registry = new CloudFormationTemplateRegistry()
        debugConfigProvider = new AwsSamDebugConfigurationProvider(registry, new AlwaysValidValidator())
        alwaysInvalidDebugConfigProvider = new AwsSamDebugConfigurationProvider(registry, new NeverValidValidator())
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
            await strToYamlFile(makeSampleSamTemplateYaml(true), tempFile.fsPath)
            await registry.addTemplateToRegistry(tempFile)
            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.notStrictEqual(provided, undefined)
            if (provided) {
                assert.strictEqual(provided.length, 1)
                assert.strictEqual(provided[0].name, 'TestResource')
            }
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
        it('TEMP!!! - returns undefined when resolving a valid debug configuration', async () => {
            const resolved = await debugConfigProvider.resolveDebugConfiguration(undefined, config)
            assert.strictEqual(resolved, undefined)
        })
        it('returns undefined when resolving an invalid debug configuration', async () => {
            const resolved = await alwaysInvalidDebugConfigProvider.resolveDebugConfiguration(undefined, config)
            assert.strictEqual(resolved, undefined)
        })
    })
})
