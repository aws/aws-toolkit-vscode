/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'

import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { ResourceTypeNode } from './resourceTypeNode'
import { parse, validate } from '@aws-sdk/util-arn-parser'

const localize = nls.loadMessageBundle()

export class ResourceNode extends AWSTreeNodeBase {
    public constructor(
        public readonly parent: ResourceTypeNode,
        public readonly identifier: string,
        public override contextValue?: string
    ) {
        super('')
        this.contextValue = contextValue ?? 'ResourceNode'
        const friendlyName = this.getFriendlyName(identifier)
        this.label = friendlyName
        this.tooltip = identifier
        this.command = {
            title: localize('AWS.generic.preview', 'Preview'),
            command: 'aws.resources.openResourcePreview',
            arguments: [this],
        }
    }

    private getFriendlyName(identifier: string): string {
        return validate(identifier) ? parse(identifier).resource : identifier
    }
}
