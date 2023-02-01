/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as os from 'os'
import { installCli } from '../../../shared/utilities/cliUtils'
import globals from '../../../shared/extensionGlobals'
import { ChildProcess } from '../../../shared/utilities/childProcess'
import { createTestWindow } from '../vscode/window'
import { SeverityLevel } from '../vscode/message'
import { assertTelemetryCurried } from '../../testUtil'

describe('cliUtils', async function () {
    let testWindow: ReturnType<typeof createTestWindow>

    beforeEach(function () {
        testWindow = createTestWindow()
    })

    afterEach(async function () {
        fs.remove(path.join(globals.context.globalStorageUri.fsPath, 'tools'))
    })

    describe('installCli', async function () {
        async function hasFunctionalCli(cliPath: string): Promise<boolean> {
            const { exitCode } = await new ChildProcess(cliPath).run()

            return exitCode === 0
        }

        const assertTelemetry = assertTelemetryCurried('aws_toolInstallation')

        it('downloads and installs the SSM CLI automatically', async function () {
            const ssmCli = await installCli('session-manager-plugin', false, testWindow)
            assert.ok(await hasFunctionalCli(ssmCli))
            assertTelemetry({
                result: 'Succeeded',
                toolId: 'session-manager-plugin',
            })
        })

        it('downloads and installs the SSM CLI if prompted and accepted', async function () {
            const ssmCli = installCli('session-manager-plugin', true, testWindow)
            const message = await testWindow.waitForMessage(/Install/)
            message.assertSeverity(SeverityLevel.Information)
            message.selectItem('Install')

            assert.ok(await hasFunctionalCli(await ssmCli))
            assertTelemetry({
                result: 'Succeeded',
                toolId: 'session-manager-plugin',
            })
        })

        it('does not install a CLI if the user is prompted and opts out', async function () {
            const ssmCli = installCli('session-manager-plugin', true, testWindow)
            const message = await testWindow.waitForMessage(/Install/)
            message.close()

            await assert.rejects(ssmCli, /cancelled/)
            assertTelemetry({
                result: 'Cancelled',
                toolId: 'session-manager-plugin',
            })
        })

        it('downloads and installs the SAM CLI automatically', async function () {
            // sam cli install scoped to just Linux
            if (os.platform() !== 'linux') {
                this.skip()
            }
            const samCli = await installCli('sam-cli', false, testWindow)
            assert.ok(await hasFunctionalCli(samCli))
            assertTelemetry({
                result: 'Succeeded',
                toolId: 'sam-cli',
            })
        })

        it('downloads and installs the SAM CLI if prompted and accepted', async function () {
            // sam cli install scoped to just Linux
            if (os.platform() !== 'linux') {
                this.skip()
            }
            const samCli = installCli('sam-cli', true, testWindow)
            const message = await testWindow.waitForMessage(/Install/)
            message.assertSeverity(SeverityLevel.Information)
            message.selectItem('Install')

            assert.ok(await hasFunctionalCli(await samCli))
            assertTelemetry({
                result: 'Succeeded',
                toolId: 'sam-cli',
            })
        })
    })
})
