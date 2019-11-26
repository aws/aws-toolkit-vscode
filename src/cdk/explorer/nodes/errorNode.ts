/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'

/**
 * Simple Node Used to convey error messages related to the CDK
 * //TODO reuse ErrorNode or PlaceholderNode when they no longer require a parent
 */
export class CdkErrorNode extends AWSTreeNodeBase {
    public constructor(label: string, tooltip?: string) {
        super(label)
        this.tooltip = tooltip

        this.contextValue = 'awsCdkErrorNode'
    }
}
