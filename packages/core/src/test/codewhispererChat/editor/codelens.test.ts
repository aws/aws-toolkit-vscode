/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import {
    TryChatCodeLensProvider,
    resolveModifierKey,
    tryChatCodeLensCommand,
} from '../../../codewhispererChat/editor/codelens'
import { assertTelemetry, installFakeClock, tryRegister } from '../../testUtil'
import { InstalledClock } from '@sinonjs/fake-timers'
import globals from '../../../shared/extensionGlobals'
import { focusAmazonQPanel } from '../../../codewhispererChat/commands/registerCommands'
import sinon from 'sinon'
import { AuthState, AuthStates, AuthUtil, FeatureAuthState } from '../../../codewhisperer/util/authUtil'

describe('TryChatCodeLensProvider', () => {
    let instance: TryChatCodeLensProvider = new TryChatCodeLensProvider()
    let cancellationTokenSource: vscode.CancellationTokenSource
    let clock: InstalledClock
    const codeLensPosition = new vscode.Position(1, 2)

    before(async function () {
        // HACK: We need to register these commands since the `core` `activate()` function
        // does not run Amazon Q `activate()` functions anymore. Due to this we need to register the Commands
        // that originally would have been registered by the `core` `activate()` at some point
        tryRegister(tryChatCodeLensCommand)
        tryRegister(focusAmazonQPanel)
        await TryChatCodeLensProvider.register()
    })

    beforeEach(function () {
        instance = new TryChatCodeLensProvider(() => codeLensPosition)
        clock = installFakeClock()
    })

    afterEach(function () {
        instance.dispose()
        cancellationTokenSource?.dispose()
        clock.uninstall()
        sinon.restore()
    })

    it('keeps returning a code lense until it hits the max times it should show', async function () {
        sinon.stub(AuthUtil.instance, 'getChatAuthState').returns(
            new Promise(resolve => {
                return resolve({
                    amazonQ: 'connected',
                } as FeatureAuthState)
            })
        )

        let codeLensCount = 0
        const modifierKey = resolveModifierKey()
        while (codeLensCount < 10) {
            cancellationTokenSource = new vscode.CancellationTokenSource()
            const resultPromise = instance.provideCodeLenses({} as any, cancellationTokenSource.token)
            clock.tick(TryChatCodeLensProvider.debounceMillis) // skip debounce

            assert.deepStrictEqual(await resultPromise, [
                {
                    range: new vscode.Range(codeLensPosition, codeLensPosition),
                    command: {
                        title: `Amazon Q: open chat with (${modifierKey} + i) - showing ${
                            TryChatCodeLensProvider.maxCount - codeLensCount
                        } more times`,
                        command: tryChatCodeLensCommand.id,
                    },
                    isResolved: true,
                },
            ])

            codeLensCount++
        }
        const emptyResult = await instance.provideCodeLenses({} as any, new vscode.CancellationTokenSource().token)
        assert.deepStrictEqual(emptyResult, [])
    })

    it('does not register the provider if we do not want to show the code lens', async function () {
        // indicate we do not want to show it
        await globals.context.globalState.update(TryChatCodeLensProvider.showCodeLensId, false)
        // ensure we do not show it
        assert.deepStrictEqual(await TryChatCodeLensProvider.register(), false)

        // indicate we want to show it
        await globals.context.globalState.update(TryChatCodeLensProvider.showCodeLensId, true)
        // The general toolkit activation will have already registered this provider, so it throws when we try again
        // But if it throws it implies it tried to register it.
        await assert.rejects(TryChatCodeLensProvider.register(), {
            message: `${TryChatCodeLensProvider.name} can only be registered once.`,
        })
    })

    it('does show codelens if amazon Q is not connected', async function () {
        const testConnection = async (state: AuthState) => {
            const stub = sinon.stub(AuthUtil.instance, 'getChatAuthState').returns(
                new Promise(resolve => {
                    return resolve({
                        amazonQ: state,
                    } as FeatureAuthState)
                })
            )
            const emptyResult = await instance.provideCodeLenses({} as any, new vscode.CancellationTokenSource().token)
            assert.deepStrictEqual(emptyResult, [], `codelens shown with state: ${state}`)
            stub.restore()
        }

        const testStates = Object.values(AuthStates).filter(s => s !== AuthStates.connected)
        for (const state of testStates) {
            await testConnection(state)
        }
    })

    it('outputs expected telemetry', async function () {
        await tryChatCodeLensCommand.execute()
        assertTelemetry('vscode_executeCommand', { command: focusAmazonQPanel.id, source: 'codeLens' })
    })
})
