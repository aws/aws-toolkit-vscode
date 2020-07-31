/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'

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
    let dir: number = 0
    let testSuiteLogger: TestLogger | undefined

    before(() => {
        try {
            getLogger()
        } catch (e) {
            testSuiteLogger = new TestLogger()
            setLogger(testSuiteLogger)
        }
        workspaceDir = getTestWorkspaceFolder()
    })

    beforeEach(async () => {
        testDir = path.join(workspaceDir, dir.toString())
        testDirNested = path.join(testDir, 'nested')
        await mkdir(testDirNested, { recursive: true })
        registry = new CloudFormationTemplateRegistry()
        manager = new CloudFormationTemplateRegistryManager(registry)
    })

    afterEach(async () => {
        manager.dispose()
        await rmrf(testDir)
        dir++
    })

    after(() => {
        if (!!testSuiteLogger && getLogger() == testSuiteLogger) {
            setLogger(undefined)
        }
    })

    it('adds initial template files with yaml and yml extensions at various nesting levels', async () => {
        await strToYamlFile(makeSampleSamTemplateYaml(true), path.join(testDir, 'test.yaml'))
        await strToYamlFile(makeSampleSamTemplateYaml(false), path.join(testDirNested, 'test.yml'))

        await manager.addTemplateGlob('**/test.{yaml,yml}')

        await registryHasTargetNumberOfFiles(registry, 2)
    })

    it('adds dynamically-added template files with yaml and yml extensions at various nesting levels', async () => {
        await manager.addTemplateGlob('**/test.{yaml,yml}')

        await strToYamlFile(makeSampleSamTemplateYaml(false), path.join(testDir, 'test.yml'))
        await strToYamlFile(makeSampleSamTemplateYaml(true), path.join(testDirNested, 'test.yaml'))

        await registryHasTargetNumberOfFiles(registry, 2)
    })

    it('can handle changed files', async () => {
        const filepath = path.join(testDir, 'changeMe.yml')
        await strToYamlFile(makeSampleSamTemplateYaml(false), filepath)

        await manager.addTemplateGlob('**/changeMe.yml')

        await registryHasTargetNumberOfFiles(registry, 1)

        await queryRegistryForFileWithGlobalsKeyStatus(registry, filepath, false)

        await strToYamlFile(makeSampleSamTemplateYaml(true), filepath)

        await queryRegistryForFileWithGlobalsKeyStatus(registry, filepath, true)
    })

    it('can handle deleted files', async () => {
        await manager.addTemplateGlob('**/deleteMe.yml')

        // Specifically creating the file after the watcher is added
        // Otherwise, it seems the file is deleted before the file watcher realizes the file exists
        // This way, we know that a file watcher detects the create event on this file and thus is tracking it
        const filepath = path.join(testDir, 'deleteMe.yml')
        await strToYamlFile(makeSampleSamTemplateYaml(false), filepath)

        await registryHasTargetNumberOfFiles(registry, 1)

        await rmrf(filepath)

        await registryHasTargetNumberOfFiles(registry, 0)
    })
})

async function registryHasTargetNumberOfFiles(registry: CloudFormationTemplateRegistry, target: number) {
    while (registry.registeredTemplates.length !== target) {
        await new Promise(resolve => setTimeout(resolve, 20))
    }
}

async function queryRegistryForFileWithGlobalsKeyStatus(
    registry: CloudFormationTemplateRegistry,
    filepath: string,
    hasGlobals: boolean
) {
    let foundMatch = false
    while (!foundMatch) {
        await new Promise(resolve => setTimeout(resolve, 20))
        const obj = registry.getRegisteredTemplate(filepath)
        if (obj) {
            foundMatch = Object.keys(obj.template).includes('Globals') === hasGlobals
        }
    }
}
