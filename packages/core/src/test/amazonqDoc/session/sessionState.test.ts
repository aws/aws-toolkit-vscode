/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import { DocPrepareCodeGenState, SessionStateConfig } from '../../../amazonqDoc'
import { createMockSessionStateAction } from '../../amazonq/utils'

import { TestSessionMocks, createMockSessionStateConfig, createBasicTestConfig } from '../../amazonq/utils'
import { createSessionTestSetup } from '../../amazonq/session/testSetup'

let testMocks: TestSessionMocks

describe('sessionStateDoc', () => {
    const { conversationId, uploadId, tabId, currentCodeGenerationId } = createSessionTestSetup()
    let testConfig: SessionStateConfig

    beforeEach(async () => {
        testMocks = {
            getCodeGeneration: sinon.stub(),
            exportResultArchive: sinon.stub(),
            createUploadUrl: sinon.stub(),
        }
        const basicConfig = await createBasicTestConfig(conversationId, uploadId, currentCodeGenerationId)
        testConfig = createMockSessionStateConfig(basicConfig, testMocks)
    })

    afterEach(() => {
        sinon.restore()
    })

    describe('DocPrepareCodeGenState', () => {
        it('error when failing to prepare repo information', async () => {
            sinon.stub(vscode.workspace, 'findFiles').throws()
            testMocks.createUploadUrl.resolves({ uploadId: '', uploadUrl: '' })
            const testAction = createMockSessionStateAction()

            await assert.rejects(() => {
                return new DocPrepareCodeGenState(testConfig, [], [], [], tabId, 0).interact(testAction)
            })
        })
    })
})
