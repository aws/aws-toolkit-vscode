/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemAction } from '@aws/mynah-ui-chat'

export interface FollowUpsBlock {
    text?: string
    options?: ChatItemAction[]
}
