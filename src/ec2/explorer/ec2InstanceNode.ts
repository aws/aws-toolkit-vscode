/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { Ec2Client, getNameOfInstance } from '../../shared/clients/ec2Client'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { Ec2Instance } from '../../shared/clients/ec2Client'
import globals from '../../shared/extensionGlobals'
import { getIconCode } from '../utils'
import { Ec2Selection } from '../prompter'
import { Ec2ParentNode } from './ec2ParentNode'

export const Ec2InstanceRunningContext = 'awsEc2RunningNode'
export const Ec2InstanceStoppedContext = 'awsEc2StoppedNode'
export const Ec2InstancePendingContext = 'awsEc2PendingNode'

type Ec2InstanceNodeContext = 'awsEc2RunningNode' | 'awsEc2StoppedNode' | 'awsEc2PendingNode'

export class Ec2InstanceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly parent: Ec2ParentNode,
        public readonly client: Ec2Client,
        public override readonly regionCode: string,
        private readonly partitionId: string,
        protected instance: Ec2Instance
    ) {
        super('')
        this.updateInstance(instance)
        this.id = this.InstanceId
    }

    public updateInstance(newInstance: Ec2Instance) {
        this.setInstance(newInstance)
        this.label = `${this.name} (${this.InstanceId})`
        this.contextValue = this.getContext()
        this.iconPath = new vscode.ThemeIcon(getIconCode(this.instance))
        this.tooltip = `${this.name}\n${this.InstanceId}\n${this.instance.status}\n${this.arn}`
    }

    public async updateStatus() {
        const newStatus = await this.client.getInstanceStatus(this.InstanceId)
        this.updateInstance({ ...this.instance, status: newStatus })
    }

    private getContext(): Ec2InstanceNodeContext {
        if (this.instance.status === 'running') {
            return Ec2InstanceRunningContext
        }

        if (this.instance.status === 'stopped') {
            return Ec2InstanceStoppedContext
        }

        return Ec2InstancePendingContext
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
        return getNameOfInstance(this.instance) ?? `(no name)`
    }

    public get InstanceId(): string {
        return this.instance.InstanceId!
    }

    public get arn(): string {
        return `arn:${this.partitionId}:ec2:${
            this.regionCode
        }:${globals.awsContext.getCredentialAccountId()}:instance/${this.InstanceId}`
    }
}
