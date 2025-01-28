/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { createBasicTestConfig, createMockSessionStateConfig, TestSessionMocks } from '../utils'
import { SessionStateConfig } from '../../../amazonq'

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

export async function createTestConfig(
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

export interface TestContext {
    conversationId: string
    uploadId: string
    tabId: string
    currentCodeGenerationId: string
    testConfig: SessionStateConfig
    testMocks: Record<string, any>
}

export function createTestContext(): TestContext {
    const { conversationId, uploadId, tabId, currentCodeGenerationId } = createSessionTestSetup()

    return {
        conversationId,
        uploadId,
        tabId,
        currentCodeGenerationId,
        testConfig: {} as SessionStateConfig,
        testMocks: {},
    }
}

export function setupTestHooks(context: TestContext) {
    beforeEach(async () => {
        context.testMocks = {}
        context.testConfig = await createTestConfig(
            context.testMocks,
            context.conversationId,
            context.uploadId,
            context.currentCodeGenerationId
        )
    })

    afterEach(() => {
        sinon.restore()
    })
}
