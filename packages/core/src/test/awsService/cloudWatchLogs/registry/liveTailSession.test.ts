/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { LiveTailSession } from '../../../../awsService/cloudWatchLogs/registry/liveTailSession'
import { StartLiveTailCommand } from '@aws-sdk/client-cloudwatch-logs'
describe('LiveTailSession', async function () {
    const testLogGroupArn = 'arn:aws:test-log-group'
    const testRegion = 'test-region'
    const testFilter = 'test-filter'
    const testAwsCredentials = {} as any as AWS.Credentials
    it('correctly builds StartLiveTailCommand: no stream Filter, no event filter.', function () {
        const session = new LiveTailSession({
            logGroupArn: testLogGroupArn,
            region: testRegion,
            awsCredentials: testAwsCredentials,
        })
        assert.strictEqual(
            JSON.stringify(session.buildStartLiveTailCommand()),
            JSON.stringify(
                new StartLiveTailCommand({
                    logGroupIdentifiers: [testLogGroupArn],
                    logEventFilterPattern: undefined,
                    logStreamNamePrefixes: undefined,
                    logStreamNames: undefined,
                })
            )
        )
    })
    it('correctly builds StartLiveTailCommand: with prefix stream Filter', function () {
        const session = new LiveTailSession({
            logGroupArn: testLogGroupArn,
            logStreamFilter: {
                type: 'prefix',
                filter: 'test-filter',
            },
            region: testRegion,
            awsCredentials: testAwsCredentials,
        })
        assert.strictEqual(
            JSON.stringify(session.buildStartLiveTailCommand()),
            JSON.stringify(
                new StartLiveTailCommand({
                    logGroupIdentifiers: [testLogGroupArn],
                    logEventFilterPattern: undefined,
                    logStreamNamePrefixes: [testFilter],
                    logStreamNames: undefined,
                })
            )
        )
    })
    it('correctly builds StartLiveTailCommand: with specific stream Filter', function () {
        const session = new LiveTailSession({
            logGroupArn: testLogGroupArn,
            logStreamFilter: {
                type: 'specific',
                filter: 'test-filter',
            },
            region: testRegion,
            awsCredentials: testAwsCredentials,
        })
        assert.strictEqual(
            JSON.stringify(session.buildStartLiveTailCommand()),
            JSON.stringify(
                new StartLiveTailCommand({
                    logGroupIdentifiers: [testLogGroupArn],
                    logEventFilterPattern: undefined,
                    logStreamNamePrefixes: undefined,
                    logStreamNames: [testFilter],
                })
            )
        )
    })
    it('correctly builds StartLiveTailCommand: with log event Filter', function () {
        const session = new LiveTailSession({
            logGroupArn: testLogGroupArn,
            logStreamFilter: {
                type: 'all',
            },
            logEventFilterPattern: 'test-filter',
            region: testRegion,
            awsCredentials: testAwsCredentials,
        })
        assert.strictEqual(
            JSON.stringify(session.buildStartLiveTailCommand()),
            JSON.stringify(
                new StartLiveTailCommand({
                    logGroupIdentifiers: [testLogGroupArn],
                    logEventFilterPattern: testFilter,
                    logStreamNamePrefixes: undefined,
                    logStreamNames: undefined,
                })
            )
        )
    })
})
