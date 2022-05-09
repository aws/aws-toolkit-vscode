/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../../shared/treeview/utils'
import { toArrayAsync, toMap, updateInPlace } from '../../../shared/utilities/collectionUtils'
import { ResourceTypeNode } from './resourceTypeNode'
import { CloudFormation } from 'aws-sdk'
import { CloudControlClient } from '../../../shared/clients/cloudControlClient'
import { memoizedGetResourceTypes, ResourceTypeMetadata } from '../../model/resources'
import { isCloud9 } from '../../../shared/extensionUtilities'
import globals from '../../../shared/extensionGlobals'
import { ResourcesSettings } from '../../commands/configure'

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
        ),
        private readonly settings = new ResourcesSettings()
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
        const defaultResources = isCloud9() ? Array.from(resourceTypes.keys()) : []
        const enabledResources = this.settings.get('enabledResources', defaultResources)

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
