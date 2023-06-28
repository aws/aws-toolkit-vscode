/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getNameOfInstance } from '../../shared/clients/ec2Client'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { Instance } from '@aws-sdk/client-ec2'

export class Ec2InstanceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public override readonly regionCode: string,
        private instance: Instance,
        public override readonly contextValue: string
    ) {
        super('')
        this.update(instance)
    }

    public update(newInstance: Instance) {
        this.setInstance(newInstance)
        this.label = this.name
        this.tooltip = this.instanceId
    }

    public setInstance(newInstance: Instance) {
        this.instance = newInstance
    }

    public get name(): string {
        return getNameOfInstance(this.instance) ?? 'Unnamed instance'
    }

    public get instanceId(): string {
        return this.instance.InstanceId!
    }

    public get arn(): string {
        return 'testArn'
    }
}
