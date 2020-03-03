/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { CloudFormationTemplateRegistry } from '../../shared/cloudformation/templateRegistry'
import { CloudFormationTemplateRegistryManager } from '../../shared/cloudformation/templateRegistryManager'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { rmrf } from '../../shared/filesystem'
import { makeSampleSamTemplateYaml, strToYamlFile } from '../../test/shared/cloudformation/cloudformationTestUtils'
import { activateExtension, getTestWorkspaceFolder } from '../integrationTestsUtilities'

const ACTIVATE_EXTENSION_TIMEOUT_MILLIS = 30000

/**
 * Note: these tests are pretty shallow right now. They do not test the following:
 * * Adding/removing workspace folders
 */
describe('CloudFormation Template Registry Manager', async () => {
    let registry: CloudFormationTemplateRegistry
    let manager: CloudFormationTemplateRegistryManager
    let workspaceDir: string
    const additionalFiles: string[] = []

    before(async function() {
        // tslint:disable-next-line: no-invalid-this
        this.timeout(ACTIVATE_EXTENSION_TIMEOUT_MILLIS)
        await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
        workspaceDir = getTestWorkspaceFolder()
        registry = CloudFormationTemplateRegistry.getRegistry()
        manager = new CloudFormationTemplateRegistryManager(registry)
        await manager.addTemplateGlob('**/test.{yaml,yml}')
    })

    afterEach(async () => {
        while (additionalFiles.length > 0) {
            const file = additionalFiles.pop()
            if (file) {
                await rmrf(file)
            }
        }
    })

    after(() => {
        manager.dispose()
    })

    it('adds initial template files with yaml and yml extensions at various nesting levels', async () => {
        await new Promise(resolve => setTimeout(resolve, 1000))
        assert.strictEqual(registry.registeredTemplates.length, 2)
    })

    it('adds dynamically-added template files with yaml and yml extensions at various nesting levels', async () => {
        const path1 = path.join(workspaceDir, 'cloudFormationTemplateRegistry', 'test.yml')
        const path2 = path.join(workspaceDir, 'cloudFormationTemplateRegistry', 'nested', 'test.yaml')
        additionalFiles.push(path1)
        additionalFiles.push(path2)

        const filename = vscode.Uri.file(path1)
        await strToYamlFile(makeSampleSamTemplateYaml(false), filename.fsPath)

        const filename2 = vscode.Uri.file(path2)
        await strToYamlFile(makeSampleSamTemplateYaml(false), filename2.fsPath)

        await new Promise(resolve => setTimeout(resolve, 500))
        assert.strictEqual(registry.registeredTemplates.length, 4)
    })

    it('can handle new globs and files associated with the new globs', async () => {
        const path1 = path.join(workspaceDir, 'cloudFormationTemplateRegistry', 'globbed.yml')
        additionalFiles.push(path1)

        const filename = vscode.Uri.file(path1)
        await strToYamlFile(makeSampleSamTemplateYaml(false), filename.fsPath)

        await manager.addTemplateGlob('**/globbed.yml')

        await new Promise(resolve => setTimeout(resolve, 500))
        assert.strictEqual(registry.registeredTemplates.length, 3)
    })

    it('can handle changed files', async () => {
        let objectsFound = 0

        const path1 = path.join(workspaceDir, 'cloudFormationTemplateRegistry', 'changeMe.yml')
        additionalFiles.push(path1)

        const filename = vscode.Uri.file(path1)
        await strToYamlFile(makeSampleSamTemplateYaml(false), filename.fsPath)

        await manager.addTemplateGlob('**/changeMe.yml')

        await new Promise(resolve => setTimeout(resolve, 500))
        assert.strictEqual(registry.registeredTemplates.length, 3)

        const initialObj = registry.getRegisteredTemplate(path1)
        assert.ok(initialObj)
        if (initialObj) {
            objectsFound++
            assert.strictEqual(Object.keys(initialObj.template).includes('Globals'), false)
        }

        await strToYamlFile(makeSampleSamTemplateYaml(true), filename.fsPath)

        await new Promise(resolve => setTimeout(resolve, 500))
        assert.strictEqual(registry.registeredTemplates.length, 3)

        const editedObj = registry.getRegisteredTemplate(path1)
        assert.ok(editedObj)
        if (editedObj) {
            objectsFound++
            assert.strictEqual(Object.keys(editedObj.template).includes('Globals'), true)
        }

        assert.strictEqual(objectsFound, 2)
    })

    it('can handle deleted files', async () => {
        const path1 = path.join(workspaceDir, 'cloudFormationTemplateRegistry', 'deleteMe.yml')
        additionalFiles.push(path1)

        const filename = vscode.Uri.file(path1)
        await strToYamlFile(makeSampleSamTemplateYaml(false), filename.fsPath)

        await manager.addTemplateGlob('**/deleteMe.yml')

        assert.strictEqual(registry.registeredTemplates.length, 3)

        const fileToDelete = additionalFiles.pop()
        if (fileToDelete) {
            await rmrf(fileToDelete)
        }

        await new Promise(resolve => setTimeout(resolve, 500))
        assert.strictEqual(registry.registeredTemplates.length, 2)
    })
})
