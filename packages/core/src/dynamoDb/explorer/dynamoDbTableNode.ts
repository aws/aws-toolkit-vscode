/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DynamoDB } from 'aws-sdk'
import { getIcon } from '../../shared/icons'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'

export class DynamoDbTableNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public override readonly regionCode: string,
        public dynamoDbtable: DynamoDB.Types.TableDescription
    ) {
        super('')
        this.update(dynamoDbtable)
    }

    public update(dynamoDbtable: DynamoDB.Types.TableDescription): void {
        this.dynamoDbtable = dynamoDbtable
        this.tooltip = `${this.dynamoDbtable.TableName}`
        this.contextValue = 'awsDynamoDbTableNode'
        this.iconPath = getIcon('aws-dynamoDb-table')
        const label = this.dynamoDbtable.TableName! + '        ' + this.dynamoDbtable.TableStatus
        this.label = label || 'Failed to fetch table details'
    }

    public get name(): string {
        return this.dynamoDbtable.TableName!
    }

    public get arn(): string {
        return this.dynamoDbtable.TableArn!
    }
}
