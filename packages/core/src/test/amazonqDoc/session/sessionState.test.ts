/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import { DocPrepareCodeGenState, SessionStateConfig } from '../../../amazonqDoc'
import { createMockSessionStateAction } from '../../amazonq/utils'

import { TestSessionMocks } from '../../amazonq/utils'
import { beforeEachFunc, createSessionTestSetup } from '../../amazonq/session/testSetup'

let testMocks: TestSessionMocks

describe('sessionStateDoc', () => {
    const { conversationId, uploadId, tabId, currentCodeGenerationId } = createSessionTestSetup()
    let testConfig: SessionStateConfig

    beforeEach(async () => {
        testMocks = {}
        testConfig = await beforeEachFunc(testMocks, conversationId, uploadId, currentCodeGenerationId)
    })

    afterEach(() => {
        sinon.restore()
    })

    describe('DocPrepareCodeGenState', () => {
        it('error when failing to prepare repo information', async () => {
            sinon.stub(vscode.workspace, 'findFiles').throws()
            testMocks.createUploadUrl!.resolves({ uploadId: '', uploadUrl: '' })
            const testAction = createMockSessionStateAction()

            await assert.rejects(() => {
                return new DocPrepareCodeGenState(testConfig, [], [], [], tabId, 0).interact(testAction)
            })
        })
    })
})
