/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as assert from 'assert'
import { CloudWatchLogsSettings, createURIFromArgs } from '../../cloudWatchLogs/cloudWatchLogsUtils'
import {
    LogStreamRegistry,
    ActiveTab,
    CloudWatchLogsData,
    CloudWatchLogsResponse,
} from '../../cloudWatchLogs/registry/logStreamRegistry'
import { Settings } from '../../shared/settings'

describe('changeLogSearch', async function () {
    let testRegistry: LogStreamRegistry
    const config = new Settings(vscode.ConfigurationTarget.Workspace)

    const fakeGetLogEvents = async (): Promise<CloudWatchLogsResponse> => {
        return {
            events: [
                {
                    message: 'we just got some log events!',
                },
            ],
        }
    }

    const oldComponenents = {
        logGroupInfo: {
            groupName: 'this-is-a-group',
            regionName: 'this-is-a-region',
        },
        parameters: { streamName: 'this-is-a-stream', filterPattern: 'this is a bad filter!' },
    }
    const newText = 'this is a good filter!'
    const newComponents = {
        ...oldComponenents,
        parameters: {
            ...oldComponenents,
            filterPattern: newText,
        },
    }

    const oldData: CloudWatchLogsData = {
        data: [
            {
                message: 'Here is some original text that we want to overwrite.',
            },
        ],
        parameters: oldComponenents.parameters,
        logGroupInfo: oldComponenents.logGroupInfo,
        retrieveLogsFunction: fakeGetLogEvents,
        busy: false,
    }

    const newData: CloudWatchLogsData = {
        data: [
            {
                message: 'Here is the new text that we want to have.',
            },
        ],
        parameters: newComponents.parameters,
        logGroupInfo: newComponents.logGroupInfo,
        retrieveLogsFunction: fakeGetLogEvents,
        busy: false,
    }

    const oldUri = createURIFromArgs(oldComponenents.logGroupInfo, oldComponenents.parameters)

    before(function () {
        testRegistry = new LogStreamRegistry(new CloudWatchLogsSettings(config), new Map<string, ActiveTab>())

        testRegistry.registerLog(oldUri, oldData)
    })

    it('unregisters old log and registers a new one', async function () {
        assert.deepStrictEqual(testRegistry.hasLog(oldUri), true)
        const newUri = await testRegistry.registerLogWithNewUri(oldUri, newData)
        assert.deepStrictEqual(testRegistry.hasLog(oldUri), false)
        assert.deepStrictEqual(testRegistry.getLogData(newUri)?.parameters.filterPattern, newText)
    })
})
