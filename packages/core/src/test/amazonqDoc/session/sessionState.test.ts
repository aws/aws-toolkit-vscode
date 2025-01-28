/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import { DocPrepareCodeGenState } from '../../../amazonqDoc'
import { createMockSessionStateAction } from '../../amazonq/utils'

import { createTestContext, setupTestHooks } from '../../amazonq/session/testSetup'

describe('sessionStateDoc', () => {
    const context = createTestContext()
    setupTestHooks(context)

    describe('DocPrepareCodeGenState', () => {
        it('error when failing to prepare repo information', async () => {
            sinon.stub(vscode.workspace, 'findFiles').throws()
            context.testMocks.createUploadUrl!.resolves({ uploadId: '', uploadUrl: '' })
            const testAction = createMockSessionStateAction()

            await assert.rejects(() => {
                return new DocPrepareCodeGenState(context.testConfig, [], [], [], context.tabId, 0).interact(testAction)
            })
        })
    })
})
