/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { configureResources } from '../../../dynamicResources/commands/configure'

describe('configureCommand', function () {
    let sandbox: sinon.SinonSandbox

    // These tests operate against the user's configuration.
    // Restore the initial value after testing is complete.
    let originalResourcesValue: any
    let settings: vscode.WorkspaceConfiguration

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        settings = vscode.workspace.getConfiguration('aws.resources')
        originalResourcesValue = settings.get('enabledResources')
    })

    afterEach(async function () {
        sandbox.restore()
        await settings.update('enabledResources', originalResourcesValue, vscode.ConfigurationTarget.Global)
    })

    it('maps selected services to configuration', async function () {
        const testItems: vscode.QuickPickItem[] = [{ label: 'Foo' }, { label: 'Bar' }, { label: 'Baz' }]

        sandbox.stub(vscode.window, 'showQuickPick' as any).returns(Promise.resolve(testItems))
        await configureResources()

        const updatedConfiguration = vscode.workspace.getConfiguration('aws.resources').get('enabledResources')
        assert.deepStrictEqual(updatedConfiguration, ['Foo', 'Bar', 'Baz'])
    })
})
