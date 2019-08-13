/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSTreeErrorHandlerNode } from '../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { RegionNode } from '../../shared/treeview/nodes/regionNode'

export interface EcsNode extends AWSTreeNodeBase {
    readonly regionCode: string

    readonly parent: RegionNode

    getChildren(): Thenable<(EcsTaskDefinitionsNode | EcsClustersNode | ErrorNode)[]>

    update(): void
}

export interface EcsTaskDefinitionsNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: EcsNode

    getChildren(): Thenable<(EcsTaskDefinitionNode | ErrorNode)[]>

    updateChildren(): Thenable<void>
}

export interface EcsTaskDefinitionNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: EcsTaskDefinitionsNode
}

export interface EcsClustersNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: EcsNode

    getChildren(): Thenable<(EcsClusterNode | ErrorNode)[]>

    updateChildren(): Thenable<void>
}

export interface EcsClusterNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: EcsClustersNode

    getChildren(): Thenable<(EcsServicesNode | ErrorNode)[]>
}

export interface EcsServicesNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: EcsClusterNode

    getChildren(): Thenable<(EcsServiceNode | ErrorNode)[]>

    updateChildren(): Thenable<void>
}

export interface EcsServiceNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: EcsServicesNode
}
