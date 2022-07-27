/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { changeLogSearchParams } from '../../cloudWatchLogs/changeLogSearch'
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

    const fakeSearchLogGroup = async (): Promise<CloudWatchLogsResponse> => {
        return {
            events: [
                {
                    message: 'we just filtered some log events!',
                },
            ],
        }
    }

    const oldComponenents = {
        logGroupInfo: {
            groupName: 'this-is-a-group',
            regionName: 'this-is-a-region',
        },
        parameters: { streamName: 'this-is-a-stream' },
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

    const oldUri = createURIFromArgs(oldComponenents.logGroupInfo, oldComponenents.parameters)

    before(function () {
        testRegistry = new LogStreamRegistry(new CloudWatchLogsSettings(config), new Map<string, ActiveTab>())

        testRegistry.registerLog(oldUri, oldData)
    })
})
