/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as sinon from 'sinon'
import * as FakeTimers from '@sinonjs/fake-timers'
import assert from 'assert'
import { LiveTailSession } from '../../../../awsService/cloudWatchLogs/registry/liveTailSession'
import {
    CloudWatchLogsClient,
    StartLiveTailCommand,
    StartLiveTailCommandOutput,
    StartLiveTailResponseStream,
} from '@aws-sdk/client-cloudwatch-logs'
import { LogStreamFilterResponse } from '../../../../awsService/cloudWatchLogs/wizard/liveTailLogStreamSubmenu'
import { installFakeClock } from '../../../testUtil'

describe('LiveTailSession', async function () {
    const testLogGroupArn = 'arn:aws:test-log-group'
    const testRegion = 'test-region'
    const testFilter = 'test-filter'
    const testAwsCredentials = {} as any as AWS.Credentials

    let sandbox: sinon.SinonSandbox
    let clock: FakeTimers.InstalledClock

    before(function () {
        clock = installFakeClock()
    })

    beforeEach(function () {
        clock.reset()
        sandbox = sinon.createSandbox()
    })

    after(function () {
        clock.uninstall()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('builds StartLiveTailCommand: no stream Filter, no event filter.', function () {
        const session = buildLiveTailSession({ type: 'all' }, undefined)
        assert.deepStrictEqual(
            session.buildStartLiveTailCommand().input,
            new StartLiveTailCommand({
                logGroupIdentifiers: [testLogGroupArn],
                logEventFilterPattern: undefined,
                logStreamNamePrefixes: undefined,
                logStreamNames: undefined,
            }).input
        )
    })

    it('builds StartLiveTailCommand: with prefix stream Filter', function () {
        const session = buildLiveTailSession({ type: 'prefix', filter: testFilter }, undefined)
        assert.deepStrictEqual(
            session.buildStartLiveTailCommand().input,
            new StartLiveTailCommand({
                logGroupIdentifiers: [testLogGroupArn],
                logEventFilterPattern: undefined,
                logStreamNamePrefixes: [testFilter],
                logStreamNames: undefined,
            }).input
        )
    })

    it('builds StartLiveTailCommand: with specific stream Filter', function () {
        const session = buildLiveTailSession({ type: 'specific', filter: testFilter }, undefined)
        assert.deepStrictEqual(
            session.buildStartLiveTailCommand().input,
            new StartLiveTailCommand({
                logGroupIdentifiers: [testLogGroupArn],
                logEventFilterPattern: undefined,
                logStreamNamePrefixes: undefined,
                logStreamNames: [testFilter],
            }).input
        )
    })

    it('builds StartLiveTailCommand: with log event Filter', function () {
        const session = buildLiveTailSession({ type: 'all' }, testFilter)
        assert.deepStrictEqual(
            session.buildStartLiveTailCommand().input,
            new StartLiveTailCommand({
                logGroupIdentifiers: [testLogGroupArn],
                logEventFilterPattern: testFilter,
                logStreamNamePrefixes: undefined,
                logStreamNames: undefined,
            }).input
        )
    })

    it('closes a started session', async function () {
        const startLiveTailStub = sinon.stub(CloudWatchLogsClient.prototype, 'send').callsFake(function () {
            return {
                responseStream: mockResponseStream(),
            }
        })
        const session = buildLiveTailSession({ type: 'all' }, testFilter)
        assert.strictEqual(session.getLiveTailSessionDuration(), 0)

        const returnedResponseStream = await session.startLiveTailSession()
        assert.strictEqual(startLiveTailStub.calledOnce, true)
        const requestArgs = startLiveTailStub.getCall(0).args
        assert.deepEqual(requestArgs[0].input, session.buildStartLiveTailCommand().input)
        assert.strictEqual(requestArgs[1].abortSignal !== undefined && !requestArgs[1].abortSignal.aborted, true)
        assert.strictEqual(session.isAborted, false)
        assert.strictEqual(clock.countTimers(), 1)
        assert.deepStrictEqual(returnedResponseStream, mockResponseStream())

        clock.tick(1000)
        assert.strictEqual(session.getLiveTailSessionDuration(), 1000)

        session.stopLiveTailSession()
        assert.strictEqual(session.isAborted, true)
        assert.strictEqual(clock.countTimers(), 0)

        //Session is stopped; ticking the clock forward should not change the session duration
        clock.tick(1000)
        assert.strictEqual(session.getLiveTailSessionDuration(), 1000)
    })

    function buildLiveTailSession(
        logStreamFilter: LogStreamFilterResponse,
        logEventFilterPattern: string | undefined
    ): LiveTailSession {
        return new LiveTailSession({
            logGroupArn: testLogGroupArn,
            logStreamFilter: logStreamFilter,
            logEventFilterPattern: logEventFilterPattern,
            region: testRegion,
            awsCredentials: testAwsCredentials,
        })
    }

    async function* mockResponseStream(): AsyncIterable<StartLiveTailResponseStream> {
        const frame: StartLiveTailResponseStream = {
            sessionUpdate: {
                sessionMetadata: {
                    sampled: false,
                },
                sessionResults: [],
            },
        }
        yield frame
    }
})
