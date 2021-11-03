/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { Logger } from '../../../shared/logger'
import { makeLogger } from '../../../shared/logger/activation'
import { WinstonToolkitLogger } from '../../../shared/logger/winstonToolkitLogger'
import { installCli } from '../../../shared/utilities/cliUtils'
import { FakeWindow } from '../vscode/fakeWindow'
import { TestSettingsConfiguration } from '../../utilities/testSettingsConfiguration'

describe('cliUtils', async function () {
    let tempFolder: string
    let testLogger: Logger | undefined

    const settingsConfig = new TestSettingsConfiguration()
    // confirms installation confirmation prompt
    const acceptInstallWindow = new FakeWindow({
        message: {
            informationSelection: 'Install',
        },
    })

    before(async function () {
        settingsConfig.writeSetting('aws.dev.forceInstallTools', true)
        tempFolder = await makeTemporaryToolkitFolder()
        testLogger = makeLogger({ staticLogLevel: 'debug', logPaths: [path.join(tempFolder, 'log.txt')] })
    })

    after(async function () {
        if (testLogger && testLogger instanceof WinstonToolkitLogger) {
            testLogger.dispose()
        }

        testLogger = undefined
        await fs.remove(tempFolder)
    })

    describe('installCli', async function () {
        async function hasFunctionalCli(cliPath: string): Promise<boolean> {
            return new Promise(resolve => {
                fs.access(cliPath, fs.constants.X_OK, err => {
                    if (err) {
                        resolve(false)
                    }
                    resolve(true)
                })
            })
        }

        it('downloads and installs the SSM CLI', async function () {
            const ssmCli = await installCli('ssm', true, acceptInstallWindow)
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
            const awsCli = await installCli('aws', true, new FakeWindow({}))
            assert.strictEqual(awsCli, undefined)
        })
    })
})
