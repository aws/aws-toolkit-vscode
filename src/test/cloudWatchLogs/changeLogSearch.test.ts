/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as assert from 'assert'
import { CloudWatchLogsSettings, createURIFromArgs } from '../../cloudWatchLogs/cloudWatchLogsUtils'
import { LogDataRegistry, ActiveTab, CloudWatchLogsData } from '../../cloudWatchLogs/registry/logDataRegistry'
import { Settings } from '../../shared/settings'
import { fakeGetLogEvents, testComponents, testLogData } from './utils.test'

describe('changeLogSearch', async function () {
    let testRegistry: LogDataRegistry
    const config = new Settings(vscode.ConfigurationTarget.Workspace)

    const newText = 'this is a good filter!'
    const newComponents = {
        ...testComponents,
        parameters: {
            ...testComponents,
            filterPattern: newText,
        },
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

    const oldUri = createURIFromArgs(testComponents.logGroupInfo, testComponents.parameters)

    before(function () {
        testRegistry = new LogDataRegistry(new CloudWatchLogsSettings(config), new Map<string, ActiveTab>())

        testRegistry.registerLog(oldUri, testLogData)
    })

    it('unregisters old log and registers a new one', async function () {
        assert.deepStrictEqual(testRegistry.hasLog(oldUri), true)
        testRegistry.disposeRegistryData(oldUri)
        const newUri = createURIFromArgs(newData.logGroupInfo, newData.parameters)
        await testRegistry.registerLog(newUri, newData)
        assert.deepStrictEqual(testRegistry.hasLog(oldUri), false)
        assert.deepStrictEqual(testRegistry.getLogData(newUri)?.parameters.filterPattern, newText)
    })
})
