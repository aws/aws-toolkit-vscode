/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Currently importing ChatItemType in Mynah UI from the vscode side causes an error
// TODO remove this once the import stops failing
export type ChatItemType =
    | 'prompt'
    | 'system-prompt'
    | 'ai-prompt'
    | 'answer'
    | 'answer-stream'
    | 'answer-part'
    | 'code-result'
