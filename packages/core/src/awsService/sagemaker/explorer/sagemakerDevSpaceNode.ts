/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { HyperpodCluster } from '../../../shared/clients/kubectlClient'

export class SagemakerDevSpaceNode extends AWSTreeNodeBase {
    public hyperpodCluster?: HyperpodCluster

    public constructor() {
        // TODO: Baseline
        super('DevSpace', vscode.TreeItemCollapsibleState.None)
    }

    public getParent() {
        // TODO: Baseline
    }
}
