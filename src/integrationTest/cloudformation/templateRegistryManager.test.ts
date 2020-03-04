/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { CloudFormationTemplateRegistry } from '../../shared/cloudformation/templateRegistry'
import { CloudFormationTemplateRegistryManager } from '../../shared/cloudformation/templateRegistryManager'
import { rmrf } from '../../shared/filesystem'
import { getLogger, setLogger } from '../../shared/logger/logger'
import { makeSampleSamTemplateYaml, strToYamlFile } from '../../test/shared/cloudformation/cloudformationTestUtils'
import { TestLogger } from '../../test/testLogger'
import { getTestWorkspaceFolder } from '../integrationTestsUtilities'

/**
 * Note: these tests are pretty shallow right now. They do not test the following:
 * * Adding/removing workspace folders
 */
describe.only('CloudFormation Template Registry Manager', async () => {
    let registry: CloudFormationTemplateRegistry
    let manager: CloudFormationTemplateRegistryManager
    let workspaceDir: string
    let testDir: string
    const additionalFiles: string[] = []

    before(async function() {
        try {
            getLogger()
        } catch (e) {
            setLogger(new TestLogger())
        }
        workspaceDir = getTestWorkspaceFolder()
        testDir = path.join(workspaceDir, 'cloudFormationTemplateRegistry')
    })

    beforeEach(() => {
        registry = new CloudFormationTemplateRegistry()
        manager = new CloudFormationTemplateRegistryManager(registry)
    })

    afterEach(async () => {
        while (additionalFiles.length > 0) {
            const file = additionalFiles.pop()
            if (file) {
                await rmrf(file)
            }
        }
        manager.dispose()
    })

    it('adds initial template files with yaml and yml extensions at various nesting levels', async () => {
        await manager.addTemplateGlob('**/test.{yaml,yml}')
        await new Promise(resolve => setTimeout(resolve, 500))
        assert.strictEqual(registry.registeredTemplates.length, 2)
    })

    it('adds dynamically-added template files with yaml and yml extensions at various nesting levels', async () => {
        await manager.addTemplateGlob('**/test.{yaml,yml}')
        await new Promise(resolve => setTimeout(resolve, 500))
        assert.strictEqual(registry.registeredTemplates.length, 2)

        const path1 = path.join(testDir, 'test.yml')
        const path2 = path.join(testDir, 'nested', 'test.yaml')
        additionalFiles.push(path1)
        additionalFiles.push(path2)

        const filename = vscode.Uri.file(path1)
        await strToYamlFile(makeSampleSamTemplateYaml(false), filename.fsPath)

        const filename2 = vscode.Uri.file(path2)
        await strToYamlFile(makeSampleSamTemplateYaml(false), filename2.fsPath)

        await new Promise(resolve => setTimeout(resolve, 500))
        assert.strictEqual(registry.registeredTemplates.length, 4)
    })

    it('can handle changed files', async () => {
        let objectsFound = 0

        const path1 = path.join(testDir, 'changeMe.yml')
        additionalFiles.push(path1)

        const filename = vscode.Uri.file(path1)
        await strToYamlFile(makeSampleSamTemplateYaml(false), filename.fsPath)

        await manager.addTemplateGlob('**/changeMe.yml')

        await new Promise(resolve => setTimeout(resolve, 500))
        assert.strictEqual(registry.registeredTemplates.length, 1)

        const initialObj = registry.getRegisteredTemplate(path1)
        assert.ok(initialObj)
        if (initialObj) {
            objectsFound++
            assert.strictEqual(Object.keys(initialObj.template).includes('Globals'), false)
        }

        await strToYamlFile(makeSampleSamTemplateYaml(true), filename.fsPath)

        await new Promise(resolve => setTimeout(resolve, 500))
        assert.strictEqual(registry.registeredTemplates.length, 1)

        const editedObj = registry.getRegisteredTemplate(path1)
        assert.ok(editedObj)
        if (editedObj) {
            objectsFound++
            assert.strictEqual(Object.keys(editedObj.template).includes('Globals'), true)
        }

        assert.strictEqual(objectsFound, 2)
    })

    it('can handle deleted files', async () => {
        const path1 = path.join(testDir, 'deleteMe.yml')
        additionalFiles.push(path1)

        const filename = vscode.Uri.file(path1)
        await strToYamlFile(makeSampleSamTemplateYaml(false), filename.fsPath)

        await manager.addTemplateGlob('**/deleteMe.yml')

        await new Promise(resolve => setTimeout(resolve, 500))
        assert.strictEqual(registry.registeredTemplates.length, 1)

        const fileToDelete = additionalFiles.pop()
        if (fileToDelete) {
            await rmrf(fileToDelete)
        }

        await new Promise(resolve => setTimeout(resolve, 500))
        assert.strictEqual(registry.registeredTemplates.length, 0)
    })
})
