/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'

import sinon from 'sinon'
import * as Cfn from '../../../../shared/cloudformation/cloudformation'
import { CloudFormationTemplateRegistry } from '../../../../shared/fs/templateRegistry'
import { WatchedItem } from '../../../../shared/fs/watchedFiles'
import * as SamUtilsModule from '../../../../shared/sam/utils'
import { createTemplatePrompter } from '../../../../shared/ui/sam/templatePrompter'
import { assertEqualPaths } from '../../../testUtil'
import { samDeployUrl } from '../../../../shared/constants'

describe('createTemplatePrompter', () => {
    let registry: CloudFormationTemplateRegistry
    let sandbox: sinon.SinonSandbox
    const mementoRootKey = 'samcli.sync.params'

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        // Create a mock instance of CloudFormationTemplateRegistry
        registry = {
            items: [
                { path: '/path/to/template1.yaml', item: {} } as WatchedItem<Cfn.Template>,
                { path: '/path/to/template2.yaml', item: {} } as WatchedItem<Cfn.Template>,
            ],
        } as CloudFormationTemplateRegistry // Typecasting to match expected type
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('should create quick pick items from registry items', () => {
        // Arrange
        const recentTemplatePathStub = sandbox.stub().returns(undefined)
        sandbox.replace(SamUtilsModule, 'getRecentResponse', recentTemplatePathStub)
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        assert.ok(workspaceFolder)

        const prompter = createTemplatePrompter(registry, mementoRootKey, samDeployUrl)

        assert.strictEqual(prompter.quickPick.items.length, 2)
        assertEqualPaths(prompter.quickPick.items[0].label, '/path/to/template1.yaml')
        assertEqualPaths(prompter.quickPick.items[1].label, '/path/to/template2.yaml')
        assert.strictEqual(prompter.quickPick.title, 'Select a SAM/CloudFormation Template')
        assert.strictEqual(prompter.quickPick.placeholder, 'Select a SAM/CloudFormation Template')
    })
})
