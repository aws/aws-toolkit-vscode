/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSTreeErrorHandlerNode } from '../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { RegionNode } from '../../shared/treeview/nodes/regionNode'
import { EcsClustersNode } from './ecsClustersNode'
import { EcsTaskDefinitionsNode } from './ecsTaskDefinitionsNode'

export interface EcsNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: RegionNode

    getChildren(): Thenable<(EcsClustersNode | EcsTaskDefinitionsNode | ErrorNode)[]>

    updateChildren(): Thenable<void>
}
