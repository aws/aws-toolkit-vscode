/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

import { CloudFormationTemplateRegistry, DefaultCloudFormationTemplateRegistry, DefaultCloudFormationTemplateRegistryListener, normalizePathIfWindows, pathToUri } from '../../../shared/cloudformation/templateRegistry'
import { rmrf } from '../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { assertThrowsError } from '../utilities/assertUtils'
import { badYaml, FakeRegistry, makeSampleSamTemplateYaml, strToYamlFile } from './cloudformationTestUtils'

describe('CloudFormation Template Registry', async () => {

    const goodYaml1 = makeSampleSamTemplateYaml(false)
    const goodYaml2 = makeSampleSamTemplateYaml(true)

    describe('DefaultCloudFormationTemplateRegistry', async () => {
        let testRegistry: DefaultCloudFormationTemplateRegistry
        let tempFolder: string

        beforeEach(async () => {
            tempFolder = await makeTemporaryToolkitFolder()
            testRegistry = new DefaultCloudFormationTemplateRegistry()
        })

        afterEach(async () => {
            await rmrf(tempFolder)
        })

        describe('addTemplateToTemplateData', async () => {
            it ('adds data from a template to the registry', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToTemplateData(pathToUri(filename))

                assert.strictEqual(testRegistry.registeredTemplates.size, 1)

                assert.ok(testRegistry.getRegisteredTemplate(filename))
                assert.ok(testRegistry.getRegisteredTemplate(filename)?.Resources)
            })

            it ('throws an error if the file to add is not a CF template', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(badYaml, filename)

                await assertThrowsError(async () => await testRegistry.addTemplateToTemplateData(pathToUri(filename)))
            })
        })

        describe('registeredTemplates', async () => {
            it ('returns an empty map if the registry has no registered templates', () => {
                assert.strictEqual(testRegistry.registeredTemplates.size, 0)
            })

            it ('returns an populated map if the registry has a registered template', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToTemplateData(pathToUri(filename))
                assert.strictEqual(testRegistry.registeredTemplates.size, 1)
            })

            it ('returns an populated map if the registry has multiple registered templates', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToTemplateData(pathToUri(filename))

                const filename2 = normalizePathIfWindows(path.join(tempFolder, 'template2.yaml'))
                await strToYamlFile(goodYaml2, filename2)
                await testRegistry.addTemplateToTemplateData(pathToUri(filename2))

                assert.strictEqual(testRegistry.registeredTemplates.size, 2)
            })
        })

        describe('getRegisteredTemplate', async () => {
            it ('returns undefined if the registry has no registered templates', () => {
                assert.strictEqual(testRegistry.getRegisteredTemplate('template.yaml'), undefined)
            })

            it ('returns undefined if the registry does not contain the template in question', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToTemplateData(pathToUri(filename))

                assert.strictEqual(testRegistry.getRegisteredTemplate('not-the-template.yaml'), undefined)
            })

            it ('returns a template if the registry has registered said template', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToTemplateData(pathToUri(filename))

                assert.ok(testRegistry.getRegisteredTemplate(filename))
            })

            it ('returns a template if the registry has multiple registered templates, including the template in question', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToTemplateData(pathToUri(filename))

                const filename2 = normalizePathIfWindows(path.join(tempFolder, 'template2.yaml'))
                await strToYamlFile(goodYaml2, filename2)
                await testRegistry.addTemplateToTemplateData(pathToUri(filename2))

                assert.ok(testRegistry.getRegisteredTemplate(filename))
                assert.ok(testRegistry.getRegisteredTemplate(filename))
            })
        })

        describe('removeTemplateFromRegistry', async () => {
            it ('removes an added template', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToTemplateData(pathToUri(filename))

                assert.strictEqual(testRegistry.registeredTemplates.size, 1)

                testRegistry.removeTemplateFromRegistry(pathToUri(filename))
                assert.strictEqual(testRegistry.registeredTemplates.size, 0)
            })

            it ('does not affect the registry if a nonexistant template is removed', async () => {
                const filename = normalizePathIfWindows(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename)
                await testRegistry.addTemplateToTemplateData(pathToUri(filename))

                assert.strictEqual(testRegistry.registeredTemplates.size, 1)

                testRegistry.removeTemplateFromRegistry(pathToUri('wrong-template.yaml'))
                assert.strictEqual(testRegistry.registeredTemplates.size, 1)
            })
        })
    })

    describe('DefaultCloudFormationTemplateRegistryListener', async () => {
        let sandbox: sinon.SinonSandbox
        let registry: CloudFormationTemplateRegistry
        let addTemplateStub: sinon.SinonStub<[vscode.Uri], Promise<void>>
        let removeTemplateStub: sinon.SinonStub<[vscode.Uri], void>
        const uri = vscode.Uri.parse('asdf')

        beforeEach(() => {
            registry = new FakeRegistry()
            sandbox = sinon.createSandbox()
            addTemplateStub = sandbox.stub(registry, 'addTemplateToTemplateData')
            removeTemplateStub = sandbox.stub(registry, 'removeTemplateFromRegistry')
        })

        afterEach(() => {
            sandbox.restore()
        })

        it ('can call a function in an onChange event', async () => {
            const listener = new DefaultCloudFormationTemplateRegistryListener(registry)
            await listener.onListenedChange(uri)
            assert.ok(addTemplateStub.calledOnce)
            assert.ok(addTemplateStub.withArgs(uri))
        })

        it ('can call a function in an onCreate event', async () => {
            const listener = new DefaultCloudFormationTemplateRegistryListener(registry)
            await listener.onListenedCreate(uri)
            assert.ok(addTemplateStub.calledOnce)
            assert.ok(addTemplateStub.withArgs(uri))
        })

        it ('can call a function in an onDelete event', async () => {
            const listener = new DefaultCloudFormationTemplateRegistryListener(registry)
            await listener.onListenedDelete(uri)
            assert.ok(removeTemplateStub.calledOnce)
            assert.ok(removeTemplateStub.withArgs(uri))
        })
    })
})
