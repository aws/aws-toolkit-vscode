/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { CloudFormationTemplateRegistry, TemplateData } from '../../../shared/cloudformation/templateRegistry'
import { rmrf } from '../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { normalizePathIfWindows } from '../../../shared/utilities/pathUtils'
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
            testRegistry = CloudFormationTemplateRegistry.getRegistry()
        })

        afterEach(async () => {
            await rmrf(tempFolder)
        })

        describe('addTemplateToRegistry', async () => {
            it("adds data from a template to the registry and can receive the template's data", async () => {
                const filename = path.join(tempFolder, 'template.yaml')
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToRegistry(vscode.Uri.file(filename))

                assert.strictEqual(testRegistry.registeredTemplates.length, 1)

                const data = testRegistry.getRegisteredTemplate(filename)

                assertValidTestTemplate(data, filename)
            })

            it('throws an error if the file to add is not a CF template', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(badYaml, filename)

                await assertThrowsError(async () => await testRegistry.addTemplateToRegistry(vscode.Uri.file(filename)))
            })
        })

        describe('addTemplatesToRegistry', async () => {
            it("adds data from multiple templates to the registry and can receive the templates' data", async () => {
                const filename = path.join(tempFolder, 'template.yaml')
                await strToYamlFile(goodYaml1, filename)
                const filename2 = path.join(tempFolder, 'template2.yaml')
                await strToYamlFile(goodYaml2, filename)
                await testRegistry.addTemplatesToRegistry([vscode.Uri.file(filename), vscode.Uri.file(filename2)])

                assert.strictEqual(testRegistry.registeredTemplates.length, 2)

                const data = testRegistry.getRegisteredTemplate(filename)
                const data2 = testRegistry.getRegisteredTemplate(filename2)

                assertValidTestTemplate(data, filename)
                assertValidTestTemplate(data2, filename2)
            })

            it('swallows errors if a template is not parseable while still parsing valid YAML', async () => {
                const filename = path.join(tempFolder, 'template.yaml')
                await strToYamlFile(goodYaml1, filename)
                const badFilename = path.join(tempFolder, 'template2.yaml')
                await strToYamlFile(badYaml, badFilename)
                await testRegistry.addTemplatesToRegistry([vscode.Uri.file(filename), vscode.Uri.file(badFilename)])

                assert.strictEqual(testRegistry.registeredTemplates.length, 1)

                const data = testRegistry.getRegisteredTemplate(filename)

                assertValidTestTemplate(data, filename)
            })
        })

        describe('registeredTemplates', async () => {
            it('returns an empty array if the registry has no registered templates', () => {
                assert.strictEqual(testRegistry.registeredTemplates.length, 0)
            })

            it('returns an populated array if the registry has a registered template', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToRegistry(vscode.Uri.file(filename))
                assert.strictEqual(testRegistry.registeredTemplates.length, 1)
            })

            it('returns an populated array if the registry has multiple registered templates', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToRegistry(vscode.Uri.file(filename))

                const filename2 = normalizePathIfWindows(path.join(tempFolder, 'template2.yaml'))
                await strToYamlFile(goodYaml2, filename2)
                await testRegistry.addTemplateToRegistry(vscode.Uri.file(filename2))

                assert.strictEqual(testRegistry.registeredTemplates.length, 2)
            })
        })

        describe('getRegisteredTemplate', async () => {
            it('returns undefined if the registry has no registered templates', () => {
                assert.strictEqual(testRegistry.getRegisteredTemplate('template.yaml'), undefined)
            })

            it('returns undefined if the registry does not contain the template in question', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToRegistry(vscode.Uri.file(filename))

                assert.strictEqual(testRegistry.getRegisteredTemplate('not-the-template.yaml'), undefined)
            })

            it('returns a template if the registry has registered said template', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToRegistry(vscode.Uri.file(filename))

                assert.ok(testRegistry.getRegisteredTemplate(filename))
            })
        })

        describe('removeTemplateFromRegistry', async () => {
            it('removes an added template', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToRegistry(vscode.Uri.file(filename))
                assert.strictEqual(testRegistry.registeredTemplates.length, 1)

                testRegistry.removeTemplateFromRegistry(vscode.Uri.file(filename))
                assert.strictEqual(testRegistry.registeredTemplates.length, 0)
            })

            it('does not affect the registry if a nonexistant template is removed', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToRegistry(vscode.Uri.file(filename))
                assert.strictEqual(testRegistry.registeredTemplates.length, 1)

                testRegistry.removeTemplateFromRegistry(vscode.Uri.file(path.join(tempFolder, 'wrong-template.yaml')))
                assert.strictEqual(testRegistry.registeredTemplates.length, 1)
            })
        })
    })
})

function assertValidTestTemplate(data: TemplateData | undefined, filename: string): void {
    assert.ok(data)
    if (data) {
        assert.strictEqual(data.templatePath, filename)
        assert.ok(data.templateData.Resources?.TestResource)
    }
}
