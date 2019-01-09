/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { Lambda } from 'aws-sdk'
import { RegionNode } from '../../../lambda/explorer/regionNode'
import {
    StandaloneFunctionGroupNode,
    StandaloneFunctionNode
} from '../../../lambda/explorer/standaloneNodes'
import { AWSTreeNodeBase } from '../../../shared/treeview/awsTreeNodeBase'

export class MockStandaloneFunctionGroupNode implements StandaloneFunctionGroupNode {
    public constructor(
        public readonly regionCode: string = '',
        public readonly parent: RegionNode = {} as any as RegionNode,
        public readonly getChildren: () => Thenable<StandaloneFunctionNode[]> = async () => [],
        public readonly updateChildren: () => Thenable<void> = async () => {}
   ) {
    }
}

export class MockStandaloneFunctionNode implements StandaloneFunctionNode {
    public constructor(
        public readonly regionCode: string = '',
        public readonly parent: StandaloneFunctionGroupNode = {} as any as StandaloneFunctionGroupNode,
        public readonly configuration: Lambda.FunctionConfiguration = {},
        public readonly getChildren: () => Thenable<AWSTreeNodeBase[]> = async () => [],
        public readonly update: (configuration: Lambda.FunctionConfiguration) => void = config => {}
    ) {
    }
}
