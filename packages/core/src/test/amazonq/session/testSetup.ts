/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
