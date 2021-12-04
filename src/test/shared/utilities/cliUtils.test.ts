/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import { installCli } from '../../../shared/utilities/cliUtils'
import { FakeWindow } from '../vscode/fakeWindow'
import { TestSettingsConfiguration } from '../../utilities/testSettingsConfiguration'
import globals from '../../../shared/extensionGlobals'

describe('cliUtils', async function () {
    const settingsConfig = new TestSettingsConfiguration()
    // confirms installation confirmation prompt
    const acceptInstallWindow = new FakeWindow({
        message: {
            informationSelection: 'Install',
        },
    })

    before(function () {
        settingsConfig.writeSetting('aws.dev.forceInstallTools', true)
    })

    afterEach(async function () {
        fs.remove(path.join(globals.context.globalStoragePath, 'tools'))
    })

    describe('installCli', async function () {
        async function hasFunctionalCli(cliPath: string): Promise<boolean> {
            return new Promise(resolve => {
                fs.access(cliPath, fs.constants.X_OK, err => {
                    if (err) {
                        resolve(false)
                    } else {
                        resolve(true)
                    }
                })
            })
        }
        it('downloads and installs the SSM CLI', async function () {
            const ssmCli = await installCli('session-manager-plugin', true, acceptInstallWindow)
            assert.ok(ssmCli)
            assert.ok(hasFunctionalCli(ssmCli))
        })

        // TODO: Restore? Needs `sudo` on Linux
        // it('downloads and installs the AWS CLI', async function () {
        //     const awsCli = await installCli('aws', acceptInstallWindow)
        //     assert.ok(awsCli)
        //     assert.ok(hasFunctionalCli(awsCli))
        // })

        it('does not install if the user opts out', async function () {
            const awsCli = installCli('session-manager-plugin', true, new FakeWindow({}))
            await assert.rejects(awsCli)
        })
    })
})
