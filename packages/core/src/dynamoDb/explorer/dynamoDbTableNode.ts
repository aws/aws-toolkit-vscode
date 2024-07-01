/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DynamoDB } from 'aws-sdk'
import { getIcon } from '../../shared/icons'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'

export class DynamoDbTableNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(public override readonly regionCode: string, public dynamoDbtable: DynamoDB.Types.TableName) {
        super('')
        this.update(dynamoDbtable)
    }

    public update(dynamoDbtable: DynamoDB.Types.TableName): void {
        this.dynamoDbtable = dynamoDbtable
        this.tooltip = `${this.dynamoDbtable}`
        this.contextValue = 'awsDynamoDbTableNode'
        this.iconPath = getIcon('aws-redshift-table')
        this.label = this.dynamoDbtable || 'Failed to fetch table details'
    }

    public get name(): string {
        return this.dynamoDbtable!
    }

    public get arn(): string {
        return this.dynamoDbtable!
    }
}
