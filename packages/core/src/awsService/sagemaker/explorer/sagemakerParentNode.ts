/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SagemakerClient } from '../../../shared/clients/sagemaker'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { SagemakerStudioNode } from './sagemakerStudioNode'
import { SagemakerHyperpodNode } from './sagemakerHyperpodNode'

export const parentContextValue = 'awsSagemakerParentNode'

export class SagemakerParentNode extends AWSTreeNodeBase {
    public override readonly contextValue: string = parentContextValue
    private studioNode: SagemakerStudioNode
    private hyperpodNode: SagemakerHyperpodNode

    public constructor(
        public override readonly regionCode: string,
        protected readonly sagemakerClient: SagemakerClient
    ) {
        super('SageMaker AI', vscode.TreeItemCollapsibleState.Collapsed)
        this.studioNode = new SagemakerStudioNode(regionCode, sagemakerClient)
        this.hyperpodNode = new SagemakerHyperpodNode(regionCode, sagemakerClient)
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return [this.studioNode, this.hyperpodNode]
    }

    public getStudioNode(): SagemakerStudioNode {
        return this.studioNode
    }
}
