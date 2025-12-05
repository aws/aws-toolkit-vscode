/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getIcon } from '../../shared/icons'

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import globals from '../../shared/extensionGlobals'

export const contextValueLambdaCapacityProvider = 'awsCapacityProviderNode'

export class LambdaCapacityProviderNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public override readonly regionCode: string,
        public readonly deployedResource: any,
        public override readonly contextValue?: string
    ) {
        super(
            deployedResource.LogicalResourceId,
            contextValue === contextValueLambdaCapacityProvider
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        )
        this.iconPath = getIcon('vscode-gear')
        this.contextValue = contextValueLambdaCapacityProvider
    }

    public get name() {
        return this.deployedResource.LogicalResourceId
    }
    private get accountId(): string {
        const accountId = globals.awsContext.getCredentialAccountId()
        if (!accountId) {
            throw new Error('Aws account ID not found')
        }
        return accountId
    }

    public get arn() {
        return `arn:aws:lambda:${this.regionCode}:${this.accountId}:capacity-provider:${this.deployedResource.PhysicalResourceId}`
    }
}
