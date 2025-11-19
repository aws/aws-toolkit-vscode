/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { ResourcesManager } from '../../resources/resourcesManager'
import { ResourceTypeNode } from './resourceTypeNode'

export class ResourcesNode extends AWSTreeNodeBase {
    public constructor(private readonly resourcesManager: ResourcesManager) {
        super('Resources', TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'resourceSection'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const selectedTypes = this.resourcesManager.getSelectedResourceTypes()
        const loadedResources = this.resourcesManager.get()

        return selectedTypes.map((typeName) => {
            const resourceList = loadedResources.find((r) => r.typeName === typeName)
            return new ResourceTypeNode(typeName, this.resourcesManager, resourceList)
        })
    }
}
