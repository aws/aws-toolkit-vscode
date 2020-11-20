/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as fs from 'fs-extra'

import { CloudFormationTemplateRegistry } from '../../shared/cloudformation/templateRegistry'
import { makeSampleSamTemplateYaml, strToYamlFile } from '../../test/shared/cloudformation/cloudformationTestUtils'
import { getTestWorkspaceFolder } from '../integrationTestsUtilities'

/**
 * Note: these tests are pretty shallow right now. They do not test the following:
 * * Adding/removing workspace folders
 */
describe('CloudFormation Template Registry', async () => {
    let registry: CloudFormationTemplateRegistry
    let workspaceDir: string
    let testDir: string
    let testDirNested: string
    let dir: number = 0

    before(async () => {
        workspaceDir = getTestWorkspaceFolder()
    })

    beforeEach(async () => {
        testDir = path.join(workspaceDir, dir.toString())
        testDirNested = path.join(testDir, 'nested')
        await fs.mkdirp(testDirNested)
        registry = new CloudFormationTemplateRegistry()
    })

    afterEach(async () => {
        registry.dispose()
        await fs.remove(testDir)
        dir++
    })

    it('adds initial template files with yaml and yml extensions at various nesting levels', async () => {
        await strToYamlFile(makeSampleSamTemplateYaml(true), path.join(testDir, 'test.yaml'))
        await strToYamlFile(makeSampleSamTemplateYaml(false), path.join(testDirNested, 'test.yml'))

        await registry.addWatchPattern('**/test.{yaml,yml}')

        await registryHasTargetNumberOfFiles(registry, 2)
    })

    it('adds dynamically-added template files with yaml and yml extensions at various nesting levels', async () => {
        await registry.addWatchPattern('**/test.{yaml,yml}')

        await strToYamlFile(makeSampleSamTemplateYaml(false), path.join(testDir, 'test.yml'))
        await strToYamlFile(makeSampleSamTemplateYaml(true), path.join(testDirNested, 'test.yaml'))

        await registryHasTargetNumberOfFiles(registry, 2)
    })

    it('Ignores templates matching excluded patterns', async () => {
        await registry.addWatchPattern('**/test.{yaml,yml}')
        await registry.addExcludedPattern(/.*nested.*/)

        await strToYamlFile(makeSampleSamTemplateYaml(false), path.join(testDir, 'test.yml'))
        await strToYamlFile(makeSampleSamTemplateYaml(true), path.join(testDirNested, 'test.yaml'))

        await registryHasTargetNumberOfFiles(registry, 1)
    })

    it('can handle changed files', async () => {
        const filepath = path.join(testDir, 'changeMe.yml')
        await strToYamlFile(makeSampleSamTemplateYaml(false), filepath)

        await registry.addWatchPattern('**/changeMe.yml')

        await registryHasTargetNumberOfFiles(registry, 1)

        await queryRegistryForFileWithGlobalsKeyStatus(registry, filepath, false)

        await strToYamlFile(makeSampleSamTemplateYaml(true), filepath)

        await queryRegistryForFileWithGlobalsKeyStatus(registry, filepath, true)
    })

    it('can handle deleted files', async () => {
        await registry.addWatchPattern('**/deleteMe.yml')

        // Specifically creating the file after the watcher is added
        // Otherwise, it seems the file is deleted before the file watcher realizes the file exists
        // This way, we know that a file watcher detects the create event on this file and thus is tracking it
        const filepath = path.join(testDir, 'deleteMe.yml')
        await strToYamlFile(makeSampleSamTemplateYaml(false), filepath)

        await registryHasTargetNumberOfFiles(registry, 1)

        await fs.remove(filepath)

        await registryHasTargetNumberOfFiles(registry, 0)
    })
})

async function registryHasTargetNumberOfFiles(registry: CloudFormationTemplateRegistry, target: number) {
    while (registry.registeredItems.length !== target) {
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
        const obj = registry.getRegisteredItem(filepath)
        if (obj) {
            foundMatch = Object.keys(obj.item).includes('Globals') === hasGlobals
        }
    }
}
