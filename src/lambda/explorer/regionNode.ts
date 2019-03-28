/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { RegionInfo } from '../../shared/regions/regionInfo'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'

// This interface and its implementation are in separate files to prevent circular imports.
export interface RegionNode extends AWSTreeNodeBase {
    readonly regionCode: string

    readonly regionName: string

    update(info: RegionInfo): void
}
