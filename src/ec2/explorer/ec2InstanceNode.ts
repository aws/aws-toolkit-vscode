/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getNameOfInstance } from '../../shared/clients/ec2Client'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { Ec2Instance } from '../../shared/clients/ec2Client'
import globals from '../../shared/extensionGlobals'
export class Ec2InstanceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public override readonly regionCode: string,
        private instance: Ec2Instance,
        public override readonly contextValue: string
    ) {
        super('')
        this.update(instance)
    }

    public update(newInstance: Ec2Instance) {
        this.setInstance(newInstance)
        this.label = this.name
        this.tooltip = this.InstanceId
    }

    public setInstance(newInstance: Ec2Instance) {
        this.instance = newInstance
    }

    public get name(): string {
        return getNameOfInstance(this.instance) ?? 'Unnamed instance'
    }

    public get InstanceId(): string {
        return this.instance.InstanceId!
    }

    public get arn(): string {
        return `arn:aws:ec2:${this.regionCode}:${globals.awsContext.getCredentialAccountId()}:instance/${
            this.InstanceId
        }`
    }
}
