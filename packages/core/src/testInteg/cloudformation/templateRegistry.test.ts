/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as fs from 'fs-extra'

import { CloudFormationTemplateRegistry } from '../../shared/fs/templateRegistry'
import { makeSampleSamTemplateYaml, strToYamlFile } from '../../test/shared/cloudformation/cloudformationTestUtils'
import { getTestWorkspaceFolder } from '../integrationTestsUtilities'
import { Timeout, sleep, waitUntil } from '../../shared/utilities/timeoutUtils'
import assert from 'assert'

/**
 * Note: these tests are pretty shallow right now. They do not test the following:
 * * Adding/removing workspace folders
 */
describe('CloudFormation Template Registry', async function () {
    let registry: CloudFormationTemplateRegistry
    let workspaceDir: string
    let testDir: string
    let testDirNested: string
    let dir: number = 0

    before(async function () {
        workspaceDir = getTestWorkspaceFolder()
    })

    beforeEach(async function () {
        testDir = path.join(workspaceDir, dir.toString())
        testDirNested = path.join(testDir, 'nested')
        await fs.mkdirp(testDirNested)
        registry = new CloudFormationTemplateRegistry()
        dir++
    })

    afterEach(async function () {
        registry.dispose()
        await fs.remove(testDir)
    })

    it('adds initial template files with yaml and yml extensions at various nesting levels', async function () {
        await strToYamlFile(makeSampleSamTemplateYaml(true), path.join(testDir, 'test.yaml'))
        await strToYamlFile(makeSampleSamTemplateYaml(false), path.join(testDirNested, 'test.yml'))

        registry.addWatchPatterns(['**/test.{yaml,yml}'])
        await registry.rebuild()

        await registryHasTargetNumberOfFiles(registry, 2)
    })

    it.skip('adds dynamically-added template files with yaml and yml extensions at various nesting levels', async function () {
        registry.addWatchPatterns(['**/test.{yaml,yml}'])
        await registry.rebuild()

        await strToYamlFile(makeSampleSamTemplateYaml(false), path.join(testDir, 'test.yml'))
        await strToYamlFile(makeSampleSamTemplateYaml(true), path.join(testDirNested, 'test.yaml'))

        await registryHasTargetNumberOfFiles(registry, 2)
    })

    it('Ignores templates matching excluded patterns', async function () {
        registry.addWatchPatterns(['**/test.{yaml,yml}'])
        registry.addExcludedPattern(/.*nested.*/)
        await registry.rebuild()

        await strToYamlFile(makeSampleSamTemplateYaml(false), path.join(testDir, 'test.yml'))
        await strToYamlFile(makeSampleSamTemplateYaml(true), path.join(testDirNested, 'test.yaml'))

        await registryHasTargetNumberOfFiles(registry, 1)
    })

    it('can handle changed files', async function () {
        const filepath = path.join(testDir, 'changeMe.yml')
        await strToYamlFile(makeSampleSamTemplateYaml(false), filepath)

        registry.addWatchPatterns(['**/changeMe.yml'])
        await registry.rebuild()

        await registryHasTargetNumberOfFiles(registry, 1)

        await queryRegistryForFileWithGlobalsKeyStatus(registry, filepath, false)

        await strToYamlFile(makeSampleSamTemplateYaml(true), filepath)

        await queryRegistryForFileWithGlobalsKeyStatus(registry, filepath, true)
    })

    it('can handle deleted files', async function () {
        registry.addWatchPatterns(['**/deleteMe.yml'])
        await registry.rebuild()

        // Specifically creating the file after the watcher is added
        // Otherwise, it seems the file is deleted before the file watcher realizes the file exists
        // This way, we know that a file watcher detects the create event on this file and thus is tracking it
        const filepath = path.join(testDir, 'deleteMe.yml')
        await strToYamlFile(makeSampleSamTemplateYaml(false), filepath)

        await registryHasTargetNumberOfFiles(registry, 1)

        await fs.remove(filepath)

        await registryHasTargetNumberOfFiles(registry, 0)
    })

    it('fails if you set watch patterns after init', async function () {
        registry.addWatchPatterns(['first/set'])
        await registry.rebuild()
        await assert.rejects(async () => {
            registry.addWatchPatterns(['second/set'])
        }, new Error('CloudFormationTemplateRegistry: cannot add watch patterns after watcher has begun watching'))
        await assert.rejects(async () => {
            registry.addExcludedPattern(/exclude me/)
        }, new Error('CloudFormationTemplateRegistry: cannot add excluded patterns after watcher has begun watching'))
    })

    it('cancels the rebuild if the cancellation timeout is completed', async function () {
        registry.addWatchPatterns(['**/test.{yaml,yml}'])
        const t = new Timeout(100)
        t.cancel()
        await registry.rebuild(t)
        await registryHasTargetNumberOfFiles(registry, 0)
    })
})

async function registryHasTargetNumberOfFiles(registry: CloudFormationTemplateRegistry, target: number) {
    if (!(await waitUntil(async () => registry.items.length === target, { timeout: 30000 }))) {
        throw new Error(`watchedFiles found wrong number files: expected ${target}, got ${registry.items.length}`)
    }
}

async function queryRegistryForFileWithGlobalsKeyStatus(
    registry: CloudFormationTemplateRegistry,
    filepath: string,
    hasGlobals: boolean
) {
    let foundMatch = false
    while (!foundMatch) {
        await sleep(20)
        const obj = registry.getItem(filepath)
        if (obj) {
            foundMatch = Object.keys(obj.item).includes('Globals') === hasGlobals
        }
    }
}
