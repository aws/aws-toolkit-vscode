/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Iot } from 'aws-sdk'
import { IotClient, IotPolicy } from '../../shared/clients/iotClient'

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { inspect } from 'util'
import { IotPolicyFolderNode } from './iotPolicyFolderNode'
import { IotCertificateNode } from './iotCertificateNode'
import { IotPolicyVersionNode } from './iotPolicyVersionNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { toArrayAsync, toMap, updateInPlace } from '../../shared/utilities/collectionUtils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { getIcon } from '../../shared/icons'
import { Settings } from '../../shared/settings'
import { ClassToInterfaceType } from '../../shared/utilities/tsUtils'

/**
 * Represents an IoT Policy that may have either a Certificate Node or the
 * Policy Folder Node as a parent.
 */
export class IotPolicyNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly policy: IotPolicy,
        public readonly parent: IotPolicyFolderNode | IotCertificateNode,
        public readonly iot: IotClient,
        collapsibleState: vscode.TreeItemCollapsibleState,
        certs?: string[],
        protected readonly settings: ClassToInterfaceType<Settings> = Settings.instance
    ) {
        super(policy.name, collapsibleState)
        this.tooltip = localize(
            'AWS.explorerNode.iot.policyToolTip',
            '{0}{1}',
            policy.name,
            certs?.length ?? 0 > 0 ? `\nAttached to: ${certs?.join(', ')}` : ''
        )
        this.iconPath = getIcon('aws-iot-policy')
        this.contextValue = 'awsIotPolicyNode.Certificates'
    }

    public get arn(): string {
        return this.policy.arn
    }

    public get name(): string {
        return this.policy.name
    }

    public [inspect.custom](): string {
        return `IotPolicyNode (policy=${this.policy.name})`
    }
}

export class IotPolicyCertNode extends IotPolicyNode {
    public constructor(
        public override readonly policy: IotPolicy,
        public override readonly parent: IotCertificateNode,
        public override readonly iot: IotClient,
        protected override readonly settings: ClassToInterfaceType<Settings> = Settings.instance
    ) {
        super(policy, parent, iot, vscode.TreeItemCollapsibleState.None, undefined, settings)
        this.contextValue = 'awsIotPolicyNode.Certificates'
    }
}

export class IotPolicyWithVersionsNode extends IotPolicyNode {
    private readonly versionNodes: Map<string, IotPolicyVersionNode>

    public constructor(
        public override readonly policy: IotPolicy,
        public override readonly parent: IotPolicyFolderNode,
        public override readonly iot: IotClient,
        certs?: string[],
        protected override readonly settings: ClassToInterfaceType<Settings> = Settings.instance
    ) {
        super(policy, parent, iot, vscode.TreeItemCollapsibleState.Collapsed, certs, settings)
        this.contextValue = 'awsIotPolicyNode.WithVersions'
        this.versionNodes = new Map<string, IotPolicyVersionNode>()
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.versionNodes.values()]
            },
            sort: (a: IotPolicyVersionNode, b: IotPolicyVersionNode) => {
                return b.version.createDate!.getTime() - a.version.createDate!.getTime()
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.iot.noVersions', '[No Policy Versions found]')),
        })
    }

    public async updateChildren(): Promise<void> {
        const versions: Map<string, Iot.PolicyVersion> = toMap(
            await toArrayAsync(this.iot.listPolicyVersions({ policyName: this.policy.name })),
            version => version.versionId
        )

        updateInPlace(
            this.versionNodes,
            versions.keys(),
            key => this.versionNodes.get(key)!.update(versions.get(key)!),
            key => new IotPolicyVersionNode(this.policy, versions.get(key)!, false, this, this.iot)
        )
    }

    public async refreshNode(): Promise<void> {
        return vscode.commands.executeCommand('aws.refreshAwsExplorerNode', this)
    }
}
