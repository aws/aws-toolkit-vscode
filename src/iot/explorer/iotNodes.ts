/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { IotClient } from '../../shared/clients/iotClient'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { inspect } from 'util'
import { IotThingFolderNode } from './iotThingFolderNode'
import { IotCertsFolderNode } from './iotCertFolderNode'
import { IotPolicyFolderNode } from './iotPolicyFolderNode'

/**
 * An AWS Explorer node representing IoT.
 *
 * Contains folders for Things, Certificates, and Policies as child nodes.
 */
export class IotNode extends AWSTreeNodeBase {
    /* These nodes are declared here to be used when refreshing resources that
     * occur multiple times in the tree (e.g. certificates that are under both
     * Things and the Certificates folder). However, they cannot be assinged in
     * the constructor due to a circular dependency with this node, so they are
     * initially undefined. */
    public thingFolderNode: IotThingFolderNode | undefined
    public certFolderNode: IotCertsFolderNode | undefined
    public policyFolderNode: IotPolicyFolderNode | undefined

    public constructor(private readonly iot: IotClient) {
        super('IoT', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsIotNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const thingFolderNode = new IotThingFolderNode(this.iot, this)
                this.thingFolderNode = thingFolderNode
                const certFolderNode = new IotCertsFolderNode(this.iot, this)
                this.certFolderNode = certFolderNode
                const policyFolderNode = new IotPolicyFolderNode(this.iot, this)
                this.policyFolderNode = policyFolderNode
                const categories: AWSTreeNodeBase[] = [thingFolderNode, certFolderNode, policyFolderNode]
                return categories
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.iot.noThings', '[No Things found]')),
        })
    }

    public async getEndpoint(): Promise<string> {
        return await this.iot.getEndpoint()
    }

    public [inspect.custom](): string {
        return 'IotNode'
    }
}
