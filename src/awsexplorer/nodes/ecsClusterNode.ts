/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSTreeErrorHandlerNode } from '../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { RegionNode } from '../../shared/treeview/nodes/regionNode'

export interface EcsClusterNode extends AWSTreeErrorHandlerNode {
    readonly regionCode: string

    readonly parent: RegionNode
}
