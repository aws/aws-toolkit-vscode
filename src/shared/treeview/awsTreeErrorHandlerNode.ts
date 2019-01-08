/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { TreeItemCollapsibleState } from 'vscode'
import { ErrorNode } from '../../lambda/explorer/errorNode'
import { AWSTreeNodeBase } from './awsTreeNodeBase'

export abstract class AwsTreeErrorHandlerNode extends AWSTreeNodeBase {
    protected errorNode?: ErrorNode

    protected constructor(
        label: string,
        collapsibleState?: TreeItemCollapsibleState
    ) {
        super(label, collapsibleState)
    }

    protected handleError(parent: AWSTreeNodeBase, error: Error) {
        this.errorNode = new ErrorNode(this, error)

        // TODO: Make the option to ErrorNode attempt to retry the operation
        console.error(error.message)
    }
}
