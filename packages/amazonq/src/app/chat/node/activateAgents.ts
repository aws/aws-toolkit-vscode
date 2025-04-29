/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as amazonqNode from 'aws-core-vscode/amazonq/node'
import { scanChatAppInit } from '../../amazonqScan'
import { DefaultAmazonQAppInitContext } from 'aws-core-vscode/amazonq'

export function activateAgents() {
    const appInitContext = DefaultAmazonQAppInitContext.instance

    amazonqNode.cwChatAppInit(appInitContext)
    amazonqNode.featureDevChatAppInit(appInitContext)
    amazonqNode.gumbyChatAppInit(appInitContext)
    amazonqNode.testChatAppInit(appInitContext)
    amazonqNode.docChatAppInit(appInitContext)
    scanChatAppInit(appInitContext)
}
