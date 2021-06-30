/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ECS } from "aws-sdk";
import { AWSResourceNode } from "../../shared/treeview/nodes/awsResourceNode";
import { AWSTreeNodeBase } from "../../shared/treeview/nodes/awsTreeNodeBase";
import { EcsClusterNode } from "./ecsClusterNode";


export class EcsServiceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly service: ECS.Service,
        public readonly parent: EcsClusterNode,
    ) {
        super(service.serviceName!)
        this.tooltip = `(Service) ${service.serviceArn}`
        this.contextValue = 'awsEcsService'
    }

    public get arn(): string {
        return this.service.serviceArn!
    }

    public get name(): string {
        return this.service.serviceArn!
    }
}
