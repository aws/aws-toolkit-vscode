/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import { SamCliSettings } from '../../../../shared/sam/cli/samCliSettings'
import { TestSettings } from '../../../utilities/testSettingsConfiguration'

describe('samCliConfiguration', function () {
    let tempFolder: string
    let settingsConfiguration: TestSettings

    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        settingsConfiguration = new TestSettings()
    })

    afterEach(async function () {
        await fs.remove(tempFolder)
    })

    it('uses config value when referencing file that exists', async function () {
        const fakeCliLocation = path.join(tempFolder, 'fakeSamCli')

        createSampleFile(fakeCliLocation)
        const config = new SamCliSettings({} as any, settingsConfiguration)
        await config.update('location', fakeCliLocation)

        assert.strictEqual(await config.getOrDetectSamCli().then(r => r.path), fakeCliLocation)
    })

    it('calls location provider when config not set', async function () {
        let timesCalled: number = 0

        const config = new SamCliSettings(
            {
                getLocation: async (): Promise<string | undefined> => {
                    timesCalled++

                    return Promise.resolve(undefined)
                },
            },
            settingsConfiguration
        )

        await config.getOrDetectSamCli()

        assert.strictEqual(timesCalled, 1)
    })

    it('location provider detects a file', async function () {
        const fakeCliLocation = path.join(tempFolder, 'fakeSamCli')

        const config = new SamCliSettings(
            {
                getLocation: async (): Promise<string | undefined> => {
                    return Promise.resolve(fakeCliLocation)
                },
            },
            settingsConfiguration
        )

        assert.strictEqual(config.get('location', ''), '')
        assert.strictEqual(await config.getOrDetectSamCli().then(r => r.path), fakeCliLocation)
    })

    it('location provider does not detect a file', async function () {
        const config = new SamCliSettings(
            {
                getLocation: async (): Promise<string | undefined> => {
                    return Promise.resolve(undefined)
                },
            },
            settingsConfiguration
        )

        assert.strictEqual(await config.getOrDetectSamCli().then(r => r.path), undefined)
    })

    function createSampleFile(filename: string): void {
        fs.writeFileSync(filename, 'hi')
    }
})
