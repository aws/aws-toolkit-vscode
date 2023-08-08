/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { TreeShim } from '../../shared/treeview/utils'

export type copyableText = 'ARN' | 'name' | 'id'

export async function copyTextCommand(
    node: AWSResourceNode | TreeShim<AWSResourceNode>,
    text: copyableText,
    env = Env.vscode()
): Promise<void> {
    node = node instanceof TreeShim ? node.node.resource : node
    switch (text) {
        case 'ARN':
            await copyToClipboard(node.arn, text, env)
            break
        case 'name':
            await copyToClipboard(node.name, text, env)
            break
        case 'id':
            await copyToClipboard(node.id!, text, env)
            break
    }
}
