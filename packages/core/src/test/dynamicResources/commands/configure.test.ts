/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { configureResources, ResourcesSettings } from '../../../dynamicResources/commands/configure'
import { memoizedGetResourceTypes } from '../../../dynamicResources/model/resources'
import { Settings } from '../../../shared/settings'
import { getTestWindow } from '../../shared/vscode/window'

describe('configureCommand', function () {
    let settings: ResourcesSettings

    beforeEach(async function () {
        const workspaceSettings = new Settings(vscode.ConfigurationTarget.Workspace)
        settings = new ResourcesSettings(workspaceSettings)
        await settings.reset()
    })

    it('maps selected services to configuration', async function () {
        const testItems = Array.from(memoizedGetResourceTypes().keys())
        getTestWindow().onDidShowQuickPick(picker => picker.acceptItems(...testItems))
        await configureResources(settings)

        assert.deepStrictEqual(settings.get('enabledResources'), testItems)
    })
})
