/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { CloudFormation, Lambda } from 'aws-sdk'
import {
    CloudFormationFunctionNode,
    CloudFormationNode,
    CloudFormationStackNode
} from '../../../lambda/explorer/cloudFormationNodes'
import { PlaceholderNode } from '../../../lambda/explorer/placeholderNode'
import { RegionNode } from '../../../lambda/explorer/regionNode'
import { AWSTreeNodeBase } from '../../../shared/treeview/awsTreeNodeBase'

export class MockCloudFormationNode implements CloudFormationNode {
    public constructor(
        public readonly regionCode: string = '',
        public readonly parent: RegionNode = {} as any as RegionNode,
        public readonly getChildren: () => Thenable<CloudFormationStackNode[]> = async () => [],
        public readonly updateChildren: () => Thenable<void> = async () => {},
    ) {

    }
}

export class MockCloudFormationStackNode implements CloudFormationStackNode {
    public constructor(
        public readonly regionCode: string = '',
        public readonly parent: CloudFormationNode = {} as any as CloudFormationNode,
        public readonly getChildren: () => Thenable<(CloudFormationNode | PlaceholderNode)[]> = async () => [],
        public readonly update: (stackSummary: CloudFormation.StackSummary) => void = stackSummary => {}
    ) {
    }
}

export class MockCloudFormationFunctionNode implements CloudFormationFunctionNode {
    public constructor(
        public readonly regionCode: string = '',
        public readonly parent: CloudFormationStackNode = {} as any as CloudFormationStackNode,
        public readonly getChildren: () => Thenable<AWSTreeNodeBase[]> = async () => [],
        public readonly updateChildren: () => Thenable<void> = async () => {},
        public readonly configuration: Lambda.FunctionConfiguration = {},
        public readonly update: (configuration: Lambda.FunctionConfiguration) => void = config => {}

    ) {
    }
}
