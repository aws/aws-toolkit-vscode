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

export const approachCreation = 'Ok, let me create a plan. This may take a few minutes.'
export const updateCode = 'Code has been updated. Would you like to work on another task?'
export const sessionClosed = 'Your session is now closed.'
export const newTaskChanges = 'What change would you like to make?'
export const uploadCodeError = `Amazon Q is unable to upload workspace artifacts to S3 for feature development. For more information, see the [Amazon Q documentation](${manageAccessGuideURL}) or contact your network or organization administrator.`

// Utils for logging and showing customer facing conversation id text
export const messageWithConversationId = (conversationId?: string) =>
    conversationId ? `\n\nConversation ID: **${conversationId}**` : ''
export const logWithConversationId = (conversationId: string) => `${featureName} Conversation ID: ${conversationId}`
