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
import { assertTelemetry } from '../../testUtil'
import { ChildProcess } from '../../../shared/utilities/childProcess'

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
            const { exitCode } = await new ChildProcess(cliPath).run()

            return exitCode === 0
        }

        it('downloads and installs the SSM CLI automatically', async function () {
            const ssmCli = await installCli('session-manager-plugin', false, new FakeWindow())
            assert.ok(await hasFunctionalCli(ssmCli))
            assertTelemetry('aws_toolInstallation', {
                result: 'Succeeded',
                toolId: 'session-manager-plugin',
            })
        })

        it('downloads and installs the SSM CLI if prompted and accepted', async function () {
            const ssmCli = await installCli('session-manager-plugin', true, acceptInstallWindow)
            assert.ok(await hasFunctionalCli(ssmCli))
            assertTelemetry('aws_toolInstallation', {
                result: 'Succeeded',
                toolId: 'session-manager-plugin',
            })
        })

        it('does not install a CLI if the user is prompted and opts out', async function () {
            const ssmCli = installCli('session-manager-plugin', true, new FakeWindow({}))
            await assert.rejects(ssmCli, /cancelled/)
            assertTelemetry('aws_toolInstallation', {
                result: 'Cancelled',
                toolId: 'session-manager-plugin',
            })
        })
    })
})
