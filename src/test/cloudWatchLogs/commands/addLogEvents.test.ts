/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudWatchLogs } from 'aws-sdk'
import * as lolex from 'lolex'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { addLogEvents } from '../../../cloudWatchLogs/commands/addLogEvents'
import { LogStreamRegistry } from '../../../cloudWatchLogs/registry/logStreamRegistry'
import { CLOUDWATCH_LOGS_SCHEME } from '../../../shared/constants'
import { TestSettingsConfiguration } from '../../utilities/testSettingsConfiguration'

describe('addLogEvents', async () => {
    let sandbox: sinon.SinonSandbox
    let clock: lolex.InstalledClock
    const config = new TestSettingsConfiguration()

    before(() => {
        clock = lolex.install()
        config.writeSetting('cloudWatchLogs.limit', 1000)
    })

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        clock.reset()
        sandbox.restore()
    })

    after(() => {
        clock.uninstall()
    })

    it('runs updateLog and sets busy status correctly', async () => {
        const uri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:group:stream:region`)
        const setBusyStatus = sandbox.stub<[vscode.Uri, boolean], void>()
        const updateLog = sandbox.stub<
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
                      ) => Promise<CloudWatchLogs.GetLogEventsResponse>)
                    | undefined
                )?
            ]
        >()

        const document: vscode.TextDocument = ({
            uri: uri,
        } as any) as vscode.TextDocument

        const fakeRegistry: LogStreamRegistry = ({
            setBusyStatus: setBusyStatus,
            updateLog: updateLog,
        } as any) as LogStreamRegistry

        const fakeEvent = sandbox.createStubInstance(vscode.EventEmitter)

        await addLogEvents(document, fakeRegistry, 'head', fakeEvent, config)

        sandbox.assert.calledTwice(setBusyStatus)
        sandbox.assert.calledWith(setBusyStatus.firstCall, uri, true)
        sandbox.assert.calledWith(setBusyStatus.secondCall, uri, false)
        sandbox.assert.calledTwice(fakeEvent.fire)
        sandbox.assert.calledWith(setBusyStatus.secondCall, uri, false)
        sandbox.assert.calledOnce(updateLog)
        sandbox.assert.calledWith(updateLog.firstCall, uri, 'head')
    })

    it('async-locks to prevent more than one execution at a time', async () => {
        const uri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:group:stream:region`)
        const setBusyStatus = sandbox.stub<[vscode.Uri, boolean], void>()
        const updateLog = sandbox.stub<
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
                      ) => Promise<CloudWatchLogs.GetLogEventsResponse>)
                    | undefined
                )?
            ]
        >()

        // simulates a long network call. Doesn't need to do anything otherwise
        updateLog.onFirstCall().callsFake(async () => {
            clock.setTimeout(() => {}, 5000)
        })
        // simulates another network call. Shorter so that way this one triggers before the initial lock is over
        updateLog.onThirdCall().callsFake(async () => {
            clock.setTimeout(() => {}, 500)
        })
        // simulates another network call. Shorter so that way this one triggers  before the initial lock is over
        updateLog.onSecondCall().callsFake(async () => {
            clock.setTimeout(() => {}, 100)
        })

        const document: vscode.TextDocument = ({
            uri: uri,
        } as any) as vscode.TextDocument

        const fakeRegistry: LogStreamRegistry = ({
            setBusyStatus: setBusyStatus,
            updateLog: updateLog,
        } as any) as LogStreamRegistry

        const fakeEvent = sandbox.createStubInstance(vscode.EventEmitter)

        addLogEvents(document, fakeRegistry, 'head', fakeEvent, config)

        addLogEvents(document, fakeRegistry, 'head', fakeEvent, config)

        addLogEvents(document, fakeRegistry, 'head', fakeEvent, config)

        new Promise(resolve => {
            clock.setTimeout(() => {
                sandbox.assert.calledTwice(setBusyStatus)
                sandbox.assert.calledWith(setBusyStatus.firstCall, uri, true)
                sandbox.assert.calledWith(setBusyStatus.secondCall, uri, false)
                sandbox.assert.calledTwice(fakeEvent.fire)
                sandbox.assert.calledWith(setBusyStatus.secondCall, uri, false)
                sandbox.assert.calledOnce(updateLog)
                sandbox.assert.calledWith(updateLog.firstCall, uri, 'head')
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
