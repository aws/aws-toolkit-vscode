/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import assert from 'assert'
import { LiveTailSessionConfiguration } from '../../../../awsService/cloudWatchLogs/registry/liveTailSession'
import { createLiveTailURIFromArgs } from '../../../../awsService/cloudWatchLogs/registry/liveTailSessionRegistry'
import { cloudwatchLogsLiveTailScheme } from '../../../../shared/constants'

describe('LiveTailSession URI', async function () {
    const testLogGroupName = 'test-log-group'
    const testRegion = 'test-region'
    const testAwsCredentials = {} as any as AWS.Credentials
    const expectedUriBase = `${cloudwatchLogsLiveTailScheme}:${testRegion}:${testLogGroupName}`

    it('is correct with no logStream filter, no filter pattern', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupArn: testLogGroupName,
            region: testRegion,
            awsCredentials: testAwsCredentials,
        }
        const expectedUri = vscode.Uri.parse(expectedUriBase)
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with no logStream filter, with filter pattern', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupArn: testLogGroupName,
            region: testRegion,
            logEventFilterPattern: 'test-filter',
            awsCredentials: testAwsCredentials,
        }
        const expectedUri = vscode.Uri.parse(`${expectedUriBase}:test-filter`)
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with ALL logStream filter', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupArn: testLogGroupName,
            region: testRegion,
            logStreamFilter: {
                type: 'all',
            },
            awsCredentials: testAwsCredentials,
        }
        const expectedUri = vscode.Uri.parse(`${expectedUriBase}:all`)
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with prefix logStream filter', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupArn: testLogGroupName,
            region: testRegion,
            logStreamFilter: {
                type: 'prefix',
                filter: 'test-prefix',
            },
            awsCredentials: testAwsCredentials,
        }
        const expectedUri = vscode.Uri.parse(`${expectedUriBase}:prefix:test-prefix`)
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with specific logStream filter', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupArn: testLogGroupName,
            region: testRegion,
            logStreamFilter: {
                type: 'specific',
                filter: 'test-stream',
            },
            awsCredentials: testAwsCredentials,
        }
        const expectedUri = vscode.Uri.parse(`${expectedUriBase}:specific:test-stream`)
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with specific logStream filter and filter pattern', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupArn: testLogGroupName,
            region: testRegion,
            logStreamFilter: {
                type: 'specific',
                filter: 'test-stream',
            },
            logEventFilterPattern: 'test-filter',
            awsCredentials: testAwsCredentials,
        }
        const expectedUri = vscode.Uri.parse(`${expectedUriBase}:specific:test-stream:test-filter`)
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })
})
