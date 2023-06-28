/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { contextValueEc2 } from './ec2ParentNode'
import { Instance } from '@aws-sdk/client-ec2'

export class Ec2InstanceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(public override readonly regionCode: string, private instance: Instance) {
        super('I am an instance')
        this.contextValue = contextValueEc2
    }

    public setInstance(newInstance: Instance) {
        this.instance = newInstance
    }

    public get name(): string {
        return 'testName'
    }

    public get arn(): string {
        return 'testArn'
    }
}
