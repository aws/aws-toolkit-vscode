/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EcsClient } from '../../shared/clients/ecsClient'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'

export class EcsContainerNode extends AWSTreeNodeBase {
    public constructor(
        public readonly continerName: string,
        public readonly serviceName: string,
        public readonly clusterArn: string,
        public readonly ecs: EcsClient
    ) {
        super(continerName)
        this.tooltip = continerName
        this.contextValue = 'awsEcsContainerNode'
    }

    public listTasks() {
        return this.ecs.listTasks(this.clusterArn, this.serviceName)
    }

    public desribeTasks(tasks: string[]) {
        return this.ecs.describeTasks(this.clusterArn, tasks)
    }
}
