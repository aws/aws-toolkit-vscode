/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegionInfo } from '../../regions/regionInfo'
import { AWSTreeNodeBase } from './awsTreeNodeBase'

// This interface and its implementation are in separate files to prevent circular imports.
export interface RegionNode extends AWSTreeNodeBase {
    readonly regionCode: string

    readonly regionName: string

    update(info: RegionInfo): void
}
