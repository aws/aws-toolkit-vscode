/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { CloudFormationTemplateRegistry } from '../../../../shared/cloudformation/templateRegistry'
import { rmrf } from '../../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import { AwsSamDebugConfigurationProvider } from '../../../../shared/sam/debugger/awsSamDebugger'
import { makeSampleSamTemplateYaml, strToYamlFile } from '../../cloudformation/cloudformationTestUtils'

describe('AwsSamDebugConfigurationProvider', async () => {
    let debugConfigProvider: AwsSamDebugConfigurationProvider
    let registry: CloudFormationTemplateRegistry
    let tempFolder: string
    let tempFile: vscode.Uri
    let fakeWorkspaceFolder: vscode.WorkspaceFolder

    beforeEach(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
        tempFile = vscode.Uri.file(path.join(tempFolder, 'test.yaml'))
        registry = new CloudFormationTemplateRegistry()
        debugConfigProvider = new AwsSamDebugConfigurationProvider(registry)
        fakeWorkspaceFolder = {
            uri: vscode.Uri.file(tempFolder),
            name: 'It was me, fakeWorkspaceFolder!',
            index: 0
        }
    })

    afterEach(async () => {
        await rmrf(tempFolder)
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
    })

    describe('resolveDebugConfiguration', async () => {
        it('TEMP!!! - returns undefined when resolving debug configurations', async () => {
            const resolved = await debugConfigProvider.resolveDebugConfiguration(undefined, {
                type: 'aws-sam',
                name: 'whats in a name',
                request: 'direct-invoke',
                invokeTarget: {
                    target: 'code',
                    lambdaHandler: 'sick handles',
                    projectRoot: 'root as in beer'
                }
            })
            assert.strictEqual(resolved, undefined)
        })
    })
})
