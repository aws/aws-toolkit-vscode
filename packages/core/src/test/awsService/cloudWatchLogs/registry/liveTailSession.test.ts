/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { LiveTailSession } from '../../../../awsService/cloudWatchLogs/registry/liveTailSession'
import { StartLiveTailCommand } from '@aws-sdk/client-cloudwatch-logs'
import { LogStreamFilterResponse } from '../../../../awsService/cloudWatchLogs/wizard/liveTailLogStreamSubmenu'

describe('LiveTailSession', async function () {
    const testLogGroupArn = 'arn:aws:test-log-group'
    const testRegion = 'test-region'
    const testFilter = 'test-filter'
    const testAwsCredentials = {} as any as AWS.Credentials

    it('builds StartLiveTailCommand: no stream Filter, no event filter.', function () {
        const session = buildLiveTailSession({ type: 'all' }, undefined)
        validateStartLiveTailCommand(
            session.buildStartLiveTailCommand(),
            new StartLiveTailCommand({
                logGroupIdentifiers: [testLogGroupArn],
                logEventFilterPattern: undefined,
                logStreamNamePrefixes: undefined,
                logStreamNames: undefined,
            })
        )
    })

    it('builds StartLiveTailCommand: with prefix stream Filter', function () {
        const session = buildLiveTailSession({ type: 'prefix', filter: testFilter }, undefined)
        validateStartLiveTailCommand(
            session.buildStartLiveTailCommand(),
            new StartLiveTailCommand({
                logGroupIdentifiers: [testLogGroupArn],
                logEventFilterPattern: undefined,
                logStreamNamePrefixes: [testFilter],
                logStreamNames: undefined,
            })
        )
    })

    it('builds StartLiveTailCommand: with specific stream Filter', function () {
        const session = buildLiveTailSession({ type: 'specific', filter: testFilter }, undefined)
        validateStartLiveTailCommand(
            session.buildStartLiveTailCommand(),
            new StartLiveTailCommand({
                logGroupIdentifiers: [testLogGroupArn],
                logEventFilterPattern: undefined,
                logStreamNamePrefixes: undefined,
                logStreamNames: [testFilter],
            })
        )
    })

    it('builds StartLiveTailCommand: with log event Filter', function () {
        const session = buildLiveTailSession({ type: 'all' }, testFilter)
        validateStartLiveTailCommand(
            session.buildStartLiveTailCommand(),
            new StartLiveTailCommand({
                logGroupIdentifiers: [testLogGroupArn],
                logEventFilterPattern: testFilter,
                logStreamNamePrefixes: undefined,
                logStreamNames: undefined,
            })
        )
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

    function validateStartLiveTailCommand(actual: StartLiveTailCommand, expected: StartLiveTailCommand) {
        assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected))
    }
})
