/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import assert from 'assert'
import { LiveTailSessionConfiguration } from '../../../../awsService/cloudWatchLogs/registry/liveTailSession'
import { createLiveTailURIFromArgs } from '../../../../awsService/cloudWatchLogs/registry/liveTailSessionRegistry'
import { CLOUDWATCH_LOGS_LIVETAIL_SCHEME } from '../../../../shared/constants'

describe('LiveTailSession URI', async function () {
    const testLogGroupName = 'test-log-group'
    const testRegion = 'test-region'
    const expectedUriBase = `${CLOUDWATCH_LOGS_LIVETAIL_SCHEME}:${testRegion}:${testLogGroupName}`

    it('is correct with no logStream filter, no filter pattern', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupName: testLogGroupName,
            region: testRegion,
        }
        const expectedUri = vscode.Uri.parse(expectedUriBase)
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with no logStream filter, with filter pattern', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupName: testLogGroupName,
            region: testRegion,
            logEventFilterPattern: 'test-filter',
        }
        const expectedUri = vscode.Uri.parse(`${expectedUriBase}:test-filter`)
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with ALL logStream filter', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupName: testLogGroupName,
            region: testRegion,
            logStreamFilter: {
                type: 'all',
            },
        }
        const expectedUri = vscode.Uri.parse(`${expectedUriBase}:all`)
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with prefix logStream filter', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupName: testLogGroupName,
            region: testRegion,
            logStreamFilter: {
                type: 'prefix',
                filter: 'test-prefix',
            },
        }
        const expectedUri = vscode.Uri.parse(`${expectedUriBase}:prefix:test-prefix`)
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with specific logStream filter', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupName: testLogGroupName,
            region: testRegion,
            logStreamFilter: {
                type: 'specific',
                filter: 'test-stream',
            },
        }
        const expectedUri = vscode.Uri.parse(`${expectedUriBase}:specific:test-stream`)
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with specific logStream filter and filter pattern', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupName: testLogGroupName,
            region: testRegion,
            logStreamFilter: {
                type: 'specific',
                filter: 'test-stream',
            },
            logEventFilterPattern: 'test-filter',
        }
        const expectedUri = vscode.Uri.parse(`${expectedUriBase}:specific:test-stream:test-filter`)
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })
})
