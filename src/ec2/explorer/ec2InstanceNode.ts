/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getNameOfInstance } from '../../shared/clients/ec2Client'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { Ec2Instance } from '../../shared/clients/ec2Client'
import { build } from '@aws-sdk/util-arn-parser'
import globals from '../../shared/extensionGlobals'
import { Ec2Selection } from '../utils'

export class Ec2InstanceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public override readonly regionCode: string,
        private readonly partitionId: string,
        private instance: Ec2Instance,
        public override readonly contextValue: string
    ) {
        super('')
        this.update(instance)
    }

    public update(newInstance: Ec2Instance) {
        this.setInstance(newInstance)
        this.label = this.name
        this.tooltip = `${this.name}\n${this.InstanceId}\n${this.arn}`
    }

    public setInstance(newInstance: Ec2Instance) {
        this.instance = newInstance
    }

    public toSelection(): Ec2Selection {
        return {
            region: this.regionCode,
            instanceId: this.InstanceId,
        }
    }

    public get name(): string {
        return getNameOfInstance(this.instance) ?? `${this.InstanceId} (no name)`
    }

    public get InstanceId(): string {
        return this.instance.InstanceId!
    }

    public get arn(): string {
        return build({
            partition: this.partitionId,
            service: 'ec2',
            region: this.regionCode,
            accountId: globals.awsContext.getCredentialAccountId()!,
            resource: 'instance',
        })
    }
}
