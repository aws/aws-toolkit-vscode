/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TODO:
 * This file/declaration needs to be moved to packages/amazonq/src/amazonqScan/chat/views/connector/connector
 * Once the mapping from Q folder to core is configured.
 */

export type ScanMessageType =
    | 'authenticationUpdateMessage'
    | 'authNeededException'
    | 'chatMessage'
    | 'chatInputEnabledMessage'
    | 'sendCommandMessage'
    | 'updatePlaceholderMessage'
    | 'updatePromptProgress'
    | 'chatPrompt'
    | 'errorMessage'
