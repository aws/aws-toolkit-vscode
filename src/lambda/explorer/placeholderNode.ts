/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'

// Can be used to add a child node in an explorer when a region has no resources
// relevant to the explorer type.
export class PlaceholderNode extends AWSTreeNodeBase {
    public constructor(
        public readonly parent: AWSTreeNodeBase,
        label: string,
        tooltip?: string
    ) {
        super(label)
        this.tooltip = tooltip
    }
}
