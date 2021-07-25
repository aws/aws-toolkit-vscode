/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSTreeNodeBase } from "../../shared/treeview/nodes/awsTreeNodeBase";

export class EcsContainerNode extends AWSTreeNodeBase {
    public constructor(
        public readonly continerName: string,
        public readonly serviceArn: string,
        public readonly clusterArn: string
    ) {
        super(continerName)
        this.tooltip = `(Container) ${continerName}`
        this.contextValue = 'awsEcsContainer'
    }
}