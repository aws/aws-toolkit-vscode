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
import { inlinehintKey } from '../../../codewhisperer/models/constants'
import {
    AutotriggerState,
    EndState,
    ManualtriggerState,
    PressTabState,
    TryMoreExState,
} from '../../../codewhisperer/views/lineAnnotationController'

describe('TryChatCodeLensProvider', () => {
    let instance: TryChatCodeLensProvider
    let cancellationTokenSource: vscode.CancellationTokenSource
    let clock: InstalledClock
    const codeLensPosition = new vscode.Position(1, 2)

    let isAmazonQVisibleEventEmitter: vscode.EventEmitter<boolean>
    let isAmazonQVisibleEvent: vscode.Event<boolean>

    before(async function () {
        // HACK: We need to register these commands since the `core` `activate()` function
        // does not run Amazon Q `activate()` functions anymore. Due to this we need to register the Commands
        // that originally would have been registered by the `core` `activate()` at some point
        tryRegister(tryChatCodeLensCommand)
        tryRegister(focusAmazonQPanel)
    })

    beforeEach(async function () {
        isAmazonQVisibleEventEmitter = new vscode.EventEmitter<boolean>()
        isAmazonQVisibleEvent = isAmazonQVisibleEventEmitter.event
        instance = new TryChatCodeLensProvider(isAmazonQVisibleEvent, () => codeLensPosition)
        clock = installFakeClock()
    })

    afterEach(function () {
        isAmazonQVisibleEventEmitter.dispose()
        instance.dispose()
        cancellationTokenSource?.dispose()
        clock.uninstall()
        sinon.restore()
    })

    function stubConnection(state: AuthState) {
        return sinon.stub(AuthUtil.instance, 'getChatAuthStateSync').returns({ amazonQ: state } as FeatureAuthState)
    }

    it('keeps returning a code lense until it hits the max times it should show', async function () {
        stubConnection('connected')

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
        await TryChatCodeLensProvider.register(isAmazonQVisibleEvent)
        // indicate we do not want to show it
        await globals.context.globalState.update(TryChatCodeLensProvider.showCodeLensId, false)
        // ensure we do not show it
        assert.deepStrictEqual(await TryChatCodeLensProvider.register(isAmazonQVisibleEvent), false)

        // indicate we want to show it
        await globals.context.globalState.update(TryChatCodeLensProvider.showCodeLensId, true)
        // The general toolkit activation will have already registered this provider, so it throws when we try again
        // But if it throws it implies it tried to register it.
        await assert.rejects(TryChatCodeLensProvider.register(isAmazonQVisibleEvent), {
            message: `${TryChatCodeLensProvider.name} can only be registered once.`,
        })
    })

    it('does NOT show codelens if amazon Q is not connected', async function () {
        const testConnection = async (state: AuthState) => {
            const stub = stubConnection(state)

            const emptyResult = await instance.provideCodeLenses({} as any, new vscode.CancellationTokenSource().token)
            assert.deepStrictEqual(emptyResult, [], `codelens shown with state: ${state}`)
            stub.restore()
        }

        const testStates = Object.values(AuthStates).filter(s => s !== AuthStates.connected)
        for (const state of testStates) {
            await testConnection(state)
        }
    })

    it('does show codelens if lineAnnotationController (tips) is in end state', async function () {
        stubConnection('connected')
        // indicate lineAnnotationController is not visible and in end state
        await globals.context.globalState.update(inlinehintKey, EndState.id)

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

    it('does NOT show codelens if lineAnnotationController (tips) is visible', async function () {
        stubConnection('connected')
        // indicate lineAnnotationController is visible and not in end state
        const lineAnnotationControllerStates: string[] = [
            AutotriggerState.id,
            PressTabState.id,
            ManualtriggerState.id,
            TryMoreExState.id,
        ]

        lineAnnotationControllerStates.forEach((id: string) => {
            it(`id - ${id}`, async () => {
                await globals.context.globalState.update(inlinehintKey, id)

                const emptyResult = await instance.provideCodeLenses(
                    {} as any,
                    new vscode.CancellationTokenSource().token
                )

                assert.deepStrictEqual(emptyResult, [])
            })
        })
    })

    it('does NOT show codelens if amazon Q chat is open', async function () {
        stubConnection('connected')
        isAmazonQVisibleEventEmitter.fire(true)
        const emptyResult = await instance.provideCodeLenses({} as any, new vscode.CancellationTokenSource().token)
        assert.deepStrictEqual(emptyResult, [])
    })

    it('outputs expected telemetry', async function () {
        await tryChatCodeLensCommand.execute()
        assertTelemetry('vscode_executeCommand', { command: focusAmazonQPanel.id, source: 'codeLens' })
    })
})
