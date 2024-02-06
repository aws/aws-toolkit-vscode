/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as FakeTimers from '@sinonjs/fake-timers'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { addLogEvents } from '../../../cloudWatchLogs/commands/addLogEvents'
import { CloudWatchLogsEvent, LogDataRegistry } from '../../../cloudWatchLogs/registry/logDataRegistry'
import { CLOUDWATCH_LOGS_SCHEME } from '../../../shared/constants'
import { installFakeClock } from '../../testUtil'

describe('addLogEvents', async function () {
    let sandbox: sinon.SinonSandbox
    let clock: FakeTimers.InstalledClock

    before(function () {
        clock = installFakeClock()
    })

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        clock.reset()
        sandbox.restore()
    })

    after(function () {
        clock.uninstall()
    })

    it('runs updateLog and sets busy status correctly', async function () {
        const uri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:group:region:stream`)
        const setBusyStatus = sandbox.stub<[vscode.Uri, boolean], void>()
        const fetchNextLogEvents = sandbox.stub<
            [
                vscode.Uri,
                ('head' | 'tail' | undefined)?,
                (
                    | ((
                          logGroupInfo: {
                              groupName: string
                              streamName: string
                              regionName: string
                          },
                          nextToken?: string | undefined
                      ) => Promise<CloudWatchLogsEvent[]>)
                    | undefined
                )?
            ]
        >()

        const document: vscode.TextDocument = {
            uri: uri,
        } as any as vscode.TextDocument

        const fakeRegistry: LogDataRegistry = {
            setBusyStatus: setBusyStatus,
            fetchNextLogEvents: fetchNextLogEvents,
        } as any as LogDataRegistry

        const fakeEvent = sandbox.createStubInstance(vscode.EventEmitter)

        await addLogEvents(document, fakeRegistry, 'head', fakeEvent)

        sandbox.assert.calledTwice(setBusyStatus)
        sandbox.assert.calledWith(setBusyStatus.firstCall, uri, true)
        sandbox.assert.calledWith(setBusyStatus.secondCall, uri, false)
        // eslint-disable-next-line @typescript-eslint/unbound-method
        sandbox.assert.calledTwice(fakeEvent.fire)
        sandbox.assert.calledWith(setBusyStatus.secondCall, uri, false)
        sandbox.assert.calledOnce(fetchNextLogEvents)
        sandbox.assert.calledWith(fetchNextLogEvents.firstCall, uri, 'head')
    })

    it('async-locks to prevent more than one execution at a time', async function () {
        const uri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:group:stream:region`)
        const setBusyStatus = sandbox.stub<[vscode.Uri, boolean], void>()
        const fetchNextLogEvents = sandbox.stub<
            [
                vscode.Uri,
                ('head' | 'tail' | undefined)?,
                (
                    | ((
                          logGroupInfo: {
                              groupName: string
                              streamName: string
                              regionName: string
                          },
                          nextToken?: string | undefined
                      ) => Promise<CloudWatchLogsEvent[]>)
                    | undefined
                )?
            ]
        >()

        // simulates a long network call. Doesn't need to do anything otherwise
        fetchNextLogEvents.onFirstCall().callsFake(async () => {
            clock.setTimeout(() => {}, 5000)
        })
        // simulates another network call. Shorter so that way this one triggers before the initial lock is over
        fetchNextLogEvents.onThirdCall().callsFake(async () => {
            clock.setTimeout(() => {}, 500)
        })
        // simulates another network call. Shorter so that way this one triggers  before the initial lock is over
        fetchNextLogEvents.onSecondCall().callsFake(async () => {
            clock.setTimeout(() => {}, 100)
        })

        const document: vscode.TextDocument = {
            uri: uri,
        } as any as vscode.TextDocument

        const fakeRegistry: LogDataRegistry = {
            setBusyStatus: setBusyStatus,
            fetchNextLogEvents: fetchNextLogEvents,
        } as any as LogDataRegistry

        const fakeEvent = sandbox.createStubInstance(vscode.EventEmitter)

        void addLogEvents(document, fakeRegistry, 'head', fakeEvent)
        void addLogEvents(document, fakeRegistry, 'head', fakeEvent)
        void addLogEvents(document, fakeRegistry, 'head', fakeEvent)

        void new Promise<void>(resolve => {
            clock.setTimeout(() => {
                sandbox.assert.calledTwice(setBusyStatus)
                sandbox.assert.calledWith(setBusyStatus.firstCall, uri, true)
                sandbox.assert.calledWith(setBusyStatus.secondCall, uri, false)
                // eslint-disable-next-line @typescript-eslint/unbound-method
                sandbox.assert.calledTwice(fakeEvent.fire)
                sandbox.assert.calledWith(setBusyStatus.secondCall, uri, false)
                sandbox.assert.calledOnce(fetchNextLogEvents)
                sandbox.assert.calledWith(fetchNextLogEvents.firstCall, uri, 'head')
                resolve()
            }, 10000)
        })
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
    })
})
