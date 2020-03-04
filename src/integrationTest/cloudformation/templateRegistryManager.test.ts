/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { CloudFormationTemplateRegistry } from '../../shared/cloudformation/templateRegistry'
import { CloudFormationTemplateRegistryManager } from '../../shared/cloudformation/templateRegistryManager'
import { mkdir, rmrf } from '../../shared/filesystem'
import { getLogger, setLogger } from '../../shared/logger/logger'
import { makeSampleSamTemplateYaml, strToYamlFile } from '../../test/shared/cloudformation/cloudformationTestUtils'
import { TestLogger } from '../../test/testLogger'
import { getTestWorkspaceFolder } from '../integrationTestsUtilities'

/**
 * Note: these tests are pretty shallow right now. They do not test the following:
 * * Adding/removing workspace folders
 */
describe('CloudFormation Template Registry Manager', async () => {
    let registry: CloudFormationTemplateRegistry
    let manager: CloudFormationTemplateRegistryManager
    let workspaceDir: string
    let testDir: string
    let testDirNested: string

    before(() => {
        try {
            getLogger()
        } catch (e) {
            setLogger(new TestLogger())
        }
        workspaceDir = getTestWorkspaceFolder()
        testDir = path.join(workspaceDir, 'cloudFormationTemplateRegistry')
        testDirNested = path.join(testDir, 'nested')
    })

    beforeEach(async () => {
        await mkdir(testDirNested, { recursive: true })
        registry = new CloudFormationTemplateRegistry()
        manager = new CloudFormationTemplateRegistryManager(registry)
    })

    afterEach(async () => {
        manager.dispose()
        await rmrf(testDir)
    })

    it('adds initial template files with yaml and yml extensions at various nesting levels', async () => {
        await createTestYamlTemplates(testDir, testDirNested)

        await manager.addTemplateGlob('**/test.{yaml,yml}')

        assert.strictEqual(await registryHasTargetNumberOfFiles(registry, 2), true)
    })

    it('adds dynamically-added template files with yaml and yml extensions at various nesting levels', async () => {
        await manager.addTemplateGlob('**/test.{yaml,yml}')

        await createTestYamlTemplates(testDir, testDirNested)

        assert.strictEqual(await registryHasTargetNumberOfFiles(registry, 2), true)
    })

    it('can handle changed files', async () => {
        const filepath = path.join(testDir, 'changeMe.yml')

        const filename = vscode.Uri.file(filepath)
        await strToYamlFile(makeSampleSamTemplateYaml(false), filename.fsPath)

        await manager.addTemplateGlob('**/changeMe.yml')

        assert.strictEqual(await registryHasTargetNumberOfFiles(registry, 1), true)

        const initialObj = registry.getRegisteredTemplate(filepath)
        assert.ok(initialObj)
        if (initialObj) {
            assert.strictEqual(Object.keys(initialObj.template).includes('Globals'), false)
        }

        await strToYamlFile(makeSampleSamTemplateYaml(true), filename.fsPath)

        await new Promise(resolve => setTimeout(resolve, 500))
        assert.strictEqual(await registryHasTargetNumberOfFiles(registry, 1), true)

        const editedObj = registry.getRegisteredTemplate(filepath)
        assert.ok(editedObj)
        if (editedObj) {
            assert.strictEqual(Object.keys(editedObj.template).includes('Globals'), true)
        }
    })

    it('can handle deleted files', async () => {
        await manager.addTemplateGlob('**/deleteMe.yml')

        // Specifically creating the file after the watcher is added
        // Otherwise, it seems the file is deleted before the file watcher realizes the file exists
        // This way, we know that a file watcher detects the create event on this file and thus is tracking it
        const filepath = path.join(testDir, 'deleteMe.yml')

        const filename = vscode.Uri.file(filepath)
        await strToYamlFile(makeSampleSamTemplateYaml(false), filename.fsPath)

        assert.strictEqual(await registryHasTargetNumberOfFiles(registry, 1), true)

        await rmrf(filepath)

        assert.strictEqual(await registryHasTargetNumberOfFiles(registry, 0), true)
    })
})

async function registryHasTargetNumberOfFiles(
    registry: CloudFormationTemplateRegistry,
    target: number
): Promise<boolean> {
    while (registry.registeredTemplates.length !== target) {
        await new Promise(resolve => setTimeout(resolve, 20))
    }

    return true
}

async function createTestYamlTemplates(testDir: string, testDirNested: string) {
    const path1 = path.join(testDir, 'test.yml')
    const path2 = path.join(testDirNested, 'test.yaml')

    const filename = vscode.Uri.file(path1)
    await strToYamlFile(makeSampleSamTemplateYaml(false), filename.fsPath)

    const filename2 = vscode.Uri.file(path2)
    await strToYamlFile(makeSampleSamTemplateYaml(false), filename2.fsPath)
}
