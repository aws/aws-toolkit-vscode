/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { configureResources, ResourcesConfiguration } from '../../../dynamicResources/commands/configure'
import { SettingsConfiguration } from '../../../shared/settingsConfiguration'

describe('configureCommand', function () {
    let settings: ResourcesConfiguration

    beforeEach(async function () {
        const workspaceSettings = new SettingsConfiguration(vscode.ConfigurationTarget.Workspace)
        settings = new ResourcesConfiguration(workspaceSettings)
        await settings.reset()
    })

    afterEach(function () {
        sinon.restore()
    })

    it('maps selected services to configuration', async function () {
        const testItems: vscode.QuickPickItem[] = [{ label: 'Foo' }, { label: 'Bar' }, { label: 'Baz' }]

        sinon.stub(vscode.window, 'showQuickPick' as any).returns(Promise.resolve(testItems))
        await configureResources(settings)

        assert.deepStrictEqual(settings.get('enabledResources'), ['Foo', 'Bar', 'Baz'])
    })
})
