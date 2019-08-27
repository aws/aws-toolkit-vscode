/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSTreeErrorHandlerNode } from '../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { RegionNode } from '../../shared/treeview/nodes/regionNode'

export interface EcsNode extends AWSTreeNodeBase {
    readonly regionCode: string

    readonly parent: RegionNode

    getChildren(): Thenable<AWSTreeErrorHandlerNode[]>

    update(): void
}

export interface EcsTaskDefinitionsNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: EcsNode

    getChildren(): Thenable<(EcsTaskDefinitionNode | ErrorNode | PlaceholderNode)[]>
}

export interface EcsTaskDefinitionNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: EcsTaskDefinitionsNode

    readonly name: string

    update(name: string): void
}

export interface EcsClustersNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: EcsNode

    getChildren(): Thenable<(EcsClusterNode | ErrorNode | PlaceholderNode)[]>
}

export interface EcsClusterNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: EcsClustersNode

    readonly arn: string

    getChildren(): Thenable<(EcsClusterServicesNode | ErrorNode | PlaceholderNode)[]>

    update(arn: string): void
}

export interface EcsClusterServicesNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: EcsClusterNode

    getChildren(): Thenable<(EcsClusterServiceNode | ErrorNode | PlaceholderNode)[]>
}

export interface EcsClusterServiceNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: EcsClusterServicesNode

    readonly arn: string

    update(arn: string): void
}
