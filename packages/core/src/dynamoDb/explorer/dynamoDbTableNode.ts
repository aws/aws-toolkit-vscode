/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DynamoDbClient } from '../../shared/clients/dynamoDbClient'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { DynamoDbInstanceNode } from './dynamoDbInstanceNode'

export class DynamoDbTableNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly parent: DynamoDbInstanceNode,
        public readonly client: DynamoDbClient,
        public override readonly regionCode: string
    ) {
        super('')
    }

    public get name(): string {
        return `(no name)`
    }

    public get arn(): string {
        return `arn`
    }
}
