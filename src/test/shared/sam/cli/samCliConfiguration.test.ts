/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import { SamCliConfig } from '../../../../shared/sam/cli/samCliConfiguration'
import { TestSettingsConfiguration } from '../../../utilities/testSettingsConfiguration'

describe('SamCliConfiguration', function () {
    let tempFolder: string
    let settingsConfiguration: TestSettingsConfiguration

    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        settingsConfiguration = new TestSettingsConfiguration()
    })

    afterEach(async function () {
        await fs.remove(tempFolder)
    })

    it('uses config value when referencing file that exists', async function () {
        const fakeCliLocation = path.join(tempFolder, 'fakeSamCli')

        createSampleFile(fakeCliLocation)
        const samCliConfig = new SamCliConfig({} as any, settingsConfiguration)
        await samCliConfig.update('location', fakeCliLocation)

        assert.strictEqual(await samCliConfig.getOrDetectSamCli().then(r => r.path), fakeCliLocation)
    })

    it('calls location provider when config not set', async function () {
        let timesCalled: number = 0

        const samCliConfig = new SamCliConfig(
            {
                getLocation: async (): Promise<string | undefined> => {
                    timesCalled++

                    return Promise.resolve(undefined)
                },
            },
            settingsConfiguration
        )

        await samCliConfig.getOrDetectSamCli()

        assert.strictEqual(timesCalled, 1)
    })

    it('location provider detects a file', async function () {
        const fakeCliLocation = path.join(tempFolder, 'fakeSamCli')

        const samCliConfig = new SamCliConfig(
            {
                getLocation: async (): Promise<string | undefined> => {
                    return Promise.resolve(fakeCliLocation)
                },
            },
            settingsConfiguration
        )

        assert.strictEqual(samCliConfig.get('location', ''), '')
        assert.strictEqual(await samCliConfig.getOrDetectSamCli().then(r => r.path), fakeCliLocation)
    })

    it('location provider does not detect a file', async function () {
        const samCliConfig = new SamCliConfig(
            {
                getLocation: async (): Promise<string | undefined> => {
                    return Promise.resolve(undefined)
                },
            },
            settingsConfiguration
        )

        assert.strictEqual(await samCliConfig.getOrDetectSamCli().then(r => r.path), undefined)
    })

    function createSampleFile(filename: string): void {
        fs.writeFileSync(filename, 'hi')
    }
})
