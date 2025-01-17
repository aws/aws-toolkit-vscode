/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { createBasicTestConfig, createMockSessionStateConfig, TestSessionMocks } from '../utils'

export function createSessionTestSetup() {
    const conversationId = 'conversation-id'
    const uploadId = 'upload-id'
    const tabId = 'tab-id'
    const currentCodeGenerationId = ''

    return {
        conversationId,
        uploadId,
        tabId,
        currentCodeGenerationId,
    }
}

export async function beforeEachFunc(
    testMocks: TestSessionMocks,
    conversationId: string,
    uploadId: string,
    currentCodeGenerationId: string
) {
    testMocks.getCodeGeneration = sinon.stub()
    testMocks.exportResultArchive = sinon.stub()
    testMocks.createUploadUrl = sinon.stub()
    const basicConfig = await createBasicTestConfig(conversationId, uploadId, currentCodeGenerationId)
    const testConfig = createMockSessionStateConfig(basicConfig, testMocks)
    return testConfig
}
