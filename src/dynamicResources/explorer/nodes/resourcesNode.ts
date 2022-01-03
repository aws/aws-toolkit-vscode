/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../../shared/treeview/treeNodeUtilities'
import { toArrayAsync, toMap, updateInPlace } from '../../../shared/utilities/collectionUtils'
import { ResourceTypeNode } from './resourceTypeNode'
import { CloudFormation } from 'aws-sdk'
import { CloudControlClient } from '../../../shared/clients/cloudControlClient'
import { isCloud9 } from '../../../shared/extensionUtilities'
import { memoizedGetResourceTypes, ResourceTypeMetadata } from '../../model/resources'
import globals from '../../../shared/extensionGlobals'

const localize = nls.loadMessageBundle()

export class ResourcesNode extends AWSTreeNodeBase {
    private readonly resourceTypeNodes: Map<string, ResourceTypeNode>

    public constructor(
        public readonly region: string,
        public readonly cloudFormation: CloudFormationClient = globals.toolkitClientBuilder.createCloudFormationClient(
            region
        ),
        private readonly cloudControl: CloudControlClient = globals.toolkitClientBuilder.createCloudControlClient(
            region
        )
    ) {
        super(localize('AWS.explorerNode.resources.label', 'Resources'), vscode.TreeItemCollapsibleState.Collapsed)
        this.resourceTypeNodes = new Map<string, ResourceTypeNode>()
        this.contextValue = 'resourcesRootNode'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()
                return [...this.resourceTypeNodes.values()]
            },
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () => {
                const placeholder = new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.resources.noResourceTypes', '[Enable resource types...]')
                )
                placeholder.command = {
                    title: localize('AWS.command.resources.configure', 'Show Resources....'),
                    command: 'aws.resources.configure',
                    arguments: [this],
                }
                return placeholder
            },
            sort: (nodeA: ResourceTypeNode, nodeB: ResourceTypeNode) => nodeA.typeName.localeCompare(nodeB.typeName),
        })
    }

    public async updateChildren(): Promise<void> {
        const resourceTypes = memoizedGetResourceTypes()
        const enabledResources = !isCloud9()
            ? vscode.workspace.getConfiguration('aws').get<string[]>('resources.enabledResources')
            : resourceTypes.keys()

        if (enabledResources) {
            const availableTypes: Map<string, CloudFormation.TypeSummary> = toMap(
                await toArrayAsync(this.cloudFormation.listTypes()),
                type => type.TypeName
            )
            updateInPlace(
                this.resourceTypeNodes,
                enabledResources,
                key => this.resourceTypeNodes.get(key)!.clearChildren(),
                key => {
                    const metadata = resourceTypes.get(key) ?? ({} as ResourceTypeMetadata)
                    metadata.available = availableTypes.has(key)
                    return new ResourceTypeNode(this, key, this.cloudControl, metadata)
                }
            )
        }
    }
}
