/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'

export class SagemakerHyperpodNode extends AWSTreeNodeBase {
    public constructor(public override readonly regionCode: string) {
        super('HyperPod', vscode.TreeItemCollapsibleState.Collapsed)
    }

    public getKubectlClient(clusterName: string) {
        // TODO: Baseline
    }
}
