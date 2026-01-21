/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import { installCli, updateAwsCli } from '../../../shared/utilities/cliUtils'
import globals from '../../../shared/extensionGlobals'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { SeverityLevel } from '../vscode/message'
import { assertTelemetryCurried } from '../../testUtil'
import { getTestWindow } from '../../shared/vscode/window'
import { fs } from '../../../shared'
import sinon from 'sinon'

describe('cliUtils', async function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(async function () {
        sandbox.restore()
        await fs.delete(path.join(globals.context.globalStorageUri.fsPath, 'tools'), { recursive: true, force: true })
    })

    describe('installCli', async function () {
        async function hasFunctionalCli(cliPath: string): Promise<boolean> {
            const { exitCode } = await new ChildProcess(cliPath).run()

            return exitCode === 0
        }

        const assertTelemetry = assertTelemetryCurried('aws_toolInstallation')

        it('downloads and installs the SSM CLI automatically', async function () {
            const ssmCli = await installCli('session-manager-plugin', false)
            assert.ok(await hasFunctionalCli(ssmCli))
            assertTelemetry({
                result: 'Succeeded',
                toolId: 'session-manager-plugin',
            })
        })

        it('downloads and installs the SSM CLI if prompted and accepted', async function () {
            const ssmCli = installCli('session-manager-plugin', true)
            const message = await getTestWindow().waitForMessage(/Install/)
            message.assertSeverity(SeverityLevel.Information)
            message.selectItem('Install')

            assert.ok(await hasFunctionalCli(await ssmCli))
            assertTelemetry({
                result: 'Succeeded',
                toolId: 'session-manager-plugin',
            })
        })

        it('does not install a CLI if the user is prompted and opts out', async function () {
            const ssmCli = installCli('session-manager-plugin', true)
            const message = await getTestWindow().waitForMessage(/Install/)
            message.close()

            await assert.rejects(ssmCli, /cancelled/)
            assertTelemetry({
                result: 'Cancelled',
                toolId: 'session-manager-plugin',
            })
        })
    })

    describe('updateAwsCli', function () {
        it('cancels when user does not confirm update', async function () {
            getTestWindow().onDidShowMessage((m) => m.close())

            await assert.rejects(() => updateAwsCli(), /cancelled/)
        })

        it('installs CLI and shows path when user confirms', async function () {
            let messageCount = 0
            getTestWindow().onDidShowMessage((m) => {
                messageCount++
                if (messageCount === 1 && m.items.some((i) => i.title === 'Update')) {
                    m.selectItem('Update')
                }
            })
            sandbox.stub(ChildProcess.prototype, 'run').resolves({
                exitCode: 0,
                stdout: '/usr/local/bin/aws\n',
                stderr: '',
            } as any)

            const result = await updateAwsCli()

            assert.ok(result)
            const messages = getTestWindow().shownMessages
            assert.ok(messages.some((m) => m.message.includes('/usr/local/bin/aws')))
        })
    })
})
