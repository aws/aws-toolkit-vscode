/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, MynahIcons } from '@aws/mynah-ui'

export const disclaimerAcknowledgeButtonId = 'amazonq-disclaimer-acknowledge-button-id'
export const disclaimerCard: Partial<ChatItem> = {
    messageId: 'amazonq-disclaimer-card',
    body: 'Amazon Q Developer uses generative AI. You may need to verify responses. See the [AWS Responsible AI Policy](https://aws.amazon.com/machine-learning/responsible-ai/policy/). Amazon Q Developer processes data across all US Regions. See [here](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/cross-region-inference.html) for more info. Amazon Q may retain chats to provide and maintain the service.',
    buttons: [
        {
            text: 'Acknowledge',
            id: disclaimerAcknowledgeButtonId,
            status: 'info',
            icon: MynahIcons.OK,
        },
    ],
}
