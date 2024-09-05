/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { manageAccessGuideURL } from '../amazonq/webview/ui/texts/constants'
import { userGuideURL } from '../amazonq/webview/ui/texts/constants'
import { featureName } from './constants'

export const examples = `
You can use /dev to:
- Add a new feature or logic
- Write tests
- Fix a bug in your project
- Generate a README for a file, folder, or project

To learn more, visit the _[Amazon Q User Guide](${userGuideURL})_.
`

export const uploadCodeError = `I'm sorry, I couldn’t upload your workspace artifacts to Amazon S3 to help you with this task. You might need to allow access to the S3 bucket. For more information, see the [Amazon Q documentation](${manageAccessGuideURL}) or contact your network or organization administrator.`

/**
 * Creates a message with the conversation ID if provided.
 * @param {string} [conversationId] - The conversation ID to include in the message.
 * @returns {string} A formatted message with the conversation ID, or an empty string if no ID is provided.
 */
export const messageWithConversationId = (conversationId?: string) =>
    conversationId ? `\n\nConversation ID: **${conversationId}**` : ''

/**
 * Creates a log message with the conversation ID.
 * @param {string} conversationId - The conversation ID to include in the log message.
 * @returns {string} A formatted log message with the feature name and conversation ID.
 */
export const logWithConversationId = (conversationId: string) => `${featureName} Conversation ID: ${conversationId}`
