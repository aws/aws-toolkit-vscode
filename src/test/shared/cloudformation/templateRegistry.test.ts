/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import {
    CloudFormationTemplateRegistry,
    getResourcesFromTemplateDatum,
    TemplateDatum,
} from '../../../shared/cloudformation/templateRegistry'
import { rmrf } from '../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { assertThrowsError } from '../utilities/assertUtils'
import { badYaml, makeSampleSamTemplateYaml, strToYamlFile } from './cloudformationTestUtils'

describe('CloudFormation Template Registry', async () => {
    const goodYaml1 = makeSampleSamTemplateYaml(false)
    const goodYaml2 = makeSampleSamTemplateYaml(true)

    describe('CloudFormationTemplateRegistry', async () => {
        let testRegistry: CloudFormationTemplateRegistry
        let tempFolder: string

        beforeEach(async () => {
            tempFolder = await makeTemporaryToolkitFolder()
            testRegistry = new CloudFormationTemplateRegistry()
        })

        afterEach(async () => {
            await rmrf(tempFolder)
        })

        describe('addTemplateToRegistry', async () => {
            it("adds data from a template to the registry and can receive the template's data", async () => {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                await testRegistry.addTemplateToRegistry(filename)

                assert.strictEqual(testRegistry.registeredTemplates.length, 1)

                const data = testRegistry.getRegisteredTemplate(filename.fsPath)

                assertValidTestTemplate(data, filename.fsPath)
            })

            it('throws an error if the file to add is not a CF template', async () => {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(badYaml, filename.fsPath)

                await assertThrowsError(
                    async () => await testRegistry.addTemplateToRegistry(vscode.Uri.file(filename.fsPath))
                )
            })
        })

        describe('addTemplatesToRegistry', async () => {
            it("adds data from multiple templates to the registry and can receive the templates' data", async () => {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                const filename2 = vscode.Uri.file(path.join(tempFolder, 'template2.yaml'))
                await strToYamlFile(goodYaml2, filename2.fsPath)
                await testRegistry.addTemplatesToRegistry([filename, filename2])

                assert.strictEqual(testRegistry.registeredTemplates.length, 2)

                const data = testRegistry.getRegisteredTemplate(filename.fsPath)
                const data2 = testRegistry.getRegisteredTemplate(filename2.fsPath)

                assertValidTestTemplate(data, filename.fsPath)
                assertValidTestTemplate(data2, filename2.fsPath)
            })

            it('swallows errors if a template is not parseable while still parsing valid YAML', async () => {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                const badFilename = vscode.Uri.file(path.join(tempFolder, 'template2.yaml'))
                await strToYamlFile(badYaml, badFilename.fsPath)
                await testRegistry.addTemplatesToRegistry([filename, badFilename])

                assert.strictEqual(testRegistry.registeredTemplates.length, 1)

                const data = testRegistry.getRegisteredTemplate(filename.fsPath)

                assertValidTestTemplate(data, filename.fsPath)
            })
        })

        // other get cases are tested in the add section
        describe('registeredTemplates', async () => {
            it('returns an empty array if the registry has no registered templates', () => {
                assert.strictEqual(testRegistry.registeredTemplates.length, 0)
            })
        })

        // other get cases are tested in the add section
        describe('getRegisteredTemplate', async () => {
            it('returns undefined if the registry has no registered templates', () => {
                assert.strictEqual(testRegistry.getRegisteredTemplate('template.yaml'), undefined)
            })

            it('returns undefined if the registry does not contain the template in question', async () => {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                await testRegistry.addTemplateToRegistry(vscode.Uri.file(filename.fsPath))

                assert.strictEqual(testRegistry.getRegisteredTemplate('not-the-template.yaml'), undefined)
            })
        })

        describe('removeTemplateFromRegistry', async () => {
            it('removes an added template', async () => {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                await testRegistry.addTemplateToRegistry(vscode.Uri.file(filename.fsPath))
                assert.strictEqual(testRegistry.registeredTemplates.length, 1)

                testRegistry.removeTemplateFromRegistry(vscode.Uri.file(filename.fsPath))
                assert.strictEqual(testRegistry.registeredTemplates.length, 0)
            })

            it('does not affect the registry if a nonexistant template is removed', async () => {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                await testRegistry.addTemplateToRegistry(vscode.Uri.file(filename.fsPath))
                assert.strictEqual(testRegistry.registeredTemplates.length, 1)

                testRegistry.removeTemplateFromRegistry(vscode.Uri.file(path.join(tempFolder, 'wrong-template.yaml')))
                assert.strictEqual(testRegistry.registeredTemplates.length, 1)
            })
        })
    })
})

describe('parseCloudFormationResources', () => {
    const templateDatum: TemplateDatum = {
        path: path.join('the', 'path', 'led', 'us', 'here', 'today'),
        template: {
            Resources: {
                resource1: {
                    Type: 'AWS::Serverless::Function',
                    Properties: {
                        Handler: 'tooHotTo.handler',
                        CodeUri: 'rightHere',
                    },
                },
            },
        },
    }

    it('creates a map with a single resource', () => {
        const resources = getResourcesFromTemplateDatum(templateDatum)
        assert.strictEqual(resources.size, 1)
        assert.strictEqual(resources.get('resource1')?.Properties?.Handler, 'tooHotTo.handler')
    })

    it('creates a map with an entry for each defined resource', () => {
        const biggerDatum: TemplateDatum = {
            ...templateDatum,
            template: {
                Resources: {
                    ...templateDatum.template.Resources,
                    resource2: {
                        Type: 'AWS::Serverless::Function',
                        Properties: {
                            Handler: 'handledWith.care',
                            CodeUri: 'overThere',
                        },
                    },
                    undefinedResource: undefined,
                },
            },
        }
        const resources = getResourcesFromTemplateDatum(biggerDatum)
        assert.strictEqual(resources.size, 2)
        assert.ok(resources.has('resource1'))
        assert.ok(resources.has('resource2'))
        assert.ok(!resources.has('undefinedResource'))
    })
})

function assertValidTestTemplate(data: TemplateDatum | undefined, filename: string): void {
    assert.ok(data)
    if (data) {
        assert.strictEqual(data.path, filename)
        assert.ok(data.template.Resources?.TestResource)
    }
}
