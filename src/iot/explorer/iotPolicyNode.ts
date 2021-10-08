/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Iot } from 'aws-sdk'
import { IotClient, IotPolicy } from '../../shared/clients/iotClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { Workspace } from '../../shared/vscode/workspace'
import { inspect } from 'util'
import { IotPolicyFolderNode } from './iotPolicyFolderNode'
import { IotCertWithPoliciesNode } from './iotCertificateNode'
import { IotPolicyVersionNode } from './iotPolicyVersionNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { toArrayAsync, toMap, updateInPlace } from '../../shared/utilities/collectionUtils'
import { localize } from '../../shared/utilities/vsCodeUtils'

/**
 * Represents an IoT Policy that may have either a Certificate Node or the
 * Policy Folder Node as a parent.
 */
export class IotPolicyNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly policy: IotPolicy,
        public readonly parent: IotPolicyFolderNode | IotCertWithPoliciesNode,
        public readonly iot: IotClient,
        collapsibleState: vscode.TreeItemCollapsibleState,
        protected readonly workspace = Workspace.vscode()
    ) {
        super(policy.name, collapsibleState)
        this.tooltip = policy.name
        this.iconPath = {
            dark: vscode.Uri.file(ext.iconPaths.dark.policy),
            light: vscode.Uri.file(ext.iconPaths.light.policy),
        }
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
        public readonly policy: IotPolicy,
        public readonly parent: IotCertWithPoliciesNode,
        public readonly iot: IotClient,
        protected readonly workspace = Workspace.vscode()
    ) {
        super(policy, parent, iot, vscode.TreeItemCollapsibleState.None, workspace)
        this.contextValue = 'awsIotPolicyNode.Certificates'
    }
}

export class IotPolicyWithVersionsNode extends IotPolicyNode {
    private readonly versionNodes: Map<string, IotPolicyVersionNode>

    public constructor(
        public readonly policy: IotPolicy,
        public readonly parent: IotPolicyFolderNode,
        public readonly iot: IotClient,
        protected readonly workspace = Workspace.vscode()
    ) {
        super(policy, parent, iot, vscode.TreeItemCollapsibleState.Collapsed, workspace)
        this.contextValue = 'awsIotPolicyNode.WithVersions'
        this.versionNodes = new Map<string, IotPolicyVersionNode>()
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.versionNodes.values()]
            },
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
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
}
