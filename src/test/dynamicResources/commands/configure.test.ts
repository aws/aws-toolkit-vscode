/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { configureResources, ResourcesSettings } from '../../../dynamicResources/commands/configure'
import { Settings } from '../../../shared/settings'

describe('configureCommand', function () {
    let settings: ResourcesSettings

    beforeEach(async function () {
        const workspaceSettings = new Settings(vscode.ConfigurationTarget.Workspace)
        settings = new ResourcesSettings(workspaceSettings)
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
