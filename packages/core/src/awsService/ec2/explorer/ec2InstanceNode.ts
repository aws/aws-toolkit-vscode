/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { Ec2Client, getNameOfInstance } from '../../../shared/clients/ec2Client'
import { AWSResourceNode } from '../../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { SafeEc2Instance } from '../../../shared/clients/ec2Client'
import globals from '../../../shared/extensionGlobals'
import { getIconCode } from '../utils'
import { Ec2Selection } from '../prompter'
import { Ec2Node, Ec2ParentNode } from './ec2ParentNode'
import { EC2 } from 'aws-sdk'
import { getLogger } from '../../../shared/logger/logger'

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
        // XXX: this variable is marked as readonly, but the 'status' attribute is updated when polling the nodes.
        public readonly instance: SafeEc2Instance
    ) {
        super('')
        this.parent.addChild(this)
        this.updateInstance(instance)
        this.id = this.InstanceId
    }

    public updateInstance(newInstance: SafeEc2Instance) {
        this.setInstanceStatus(newInstance.LastSeenStatus)
        this.label = `${this.name} (${this.InstanceId}) ${this.instance.LastSeenStatus.toUpperCase()}`
        this.contextValue = this.getContext()
        this.iconPath = new vscode.ThemeIcon(getIconCode(this.instance))
        this.tooltip = `${this.name}\n${this.InstanceId}\n${this.instance.LastSeenStatus}\n${this.arn}`

        if (this.isPending()) {
            this.parent.trackPendingNode(this.InstanceId)
        }
    }

    public isPending(): boolean {
        return this.getStatus() !== 'running' && this.getStatus() !== 'stopped'
    }

    public async updateStatus() {
        const newStatus = await this.client.getInstanceStatus(this.InstanceId)
        this.updateInstance({ ...this.instance, LastSeenStatus: newStatus })
    }

    private getContext(): Ec2InstanceNodeContext {
        if (this.instance.LastSeenStatus === 'running') {
            return Ec2InstanceRunningContext
        }

        if (this.instance.LastSeenStatus === 'stopped') {
            return Ec2InstanceStoppedContext
        }

        return Ec2InstancePendingContext
    }

    public setInstanceStatus(instanceStatus: string) {
        this.instance.LastSeenStatus = instanceStatus
    }

    public toSelection(): Ec2Selection {
        return {
            region: this.regionCode,
            instanceId: this.InstanceId,
        }
    }

    public getStatus(): EC2.InstanceStateName {
        return this.instance.LastSeenStatus
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

    public async refreshNode(): Promise<void> {
        await this.updateStatus()
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', this)
    }
}

export async function tryRefreshNode(node?: Ec2Node) {
    if (node) {
        const n = node instanceof Ec2InstanceNode ? node.parent : node
        try {
            await n.refreshNode()
        } catch (e) {
            getLogger().error('refreshNode failed: %s', (e as Error).message)
        }
    }
}
