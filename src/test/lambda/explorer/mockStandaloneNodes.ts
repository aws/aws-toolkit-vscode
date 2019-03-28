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
import { AWSTreeErrorHandlerNode } from '../../../shared/treeview/awsTreeErrorHandlerNode'
import { AWSTreeNodeBase } from '../../../shared/treeview/awsTreeNodeBase'

export class MockStandaloneFunctionGroupNode extends AWSTreeErrorHandlerNode implements StandaloneFunctionGroupNode {
    public constructor(
        public readonly regionCode: string = '',
        public readonly parent: RegionNode = {} as any as RegionNode,
        public readonly getChildren: () => Thenable<StandaloneFunctionNode[]> = async () => [],
        public readonly updateChildren: () => Thenable<void> = async () => { },
        public readonly doErrorProneOperation: () => Promise<void> = async () => { },
    ) {
        super('')
    }
}

export class MockStandaloneFunctionNode implements StandaloneFunctionNode {

    public constructor(
        public readonly regionCode: string = '',
        public readonly functionName: string = '',
        public readonly parent: StandaloneFunctionGroupNode = {} as any as StandaloneFunctionGroupNode,
        public readonly configuration: Lambda.FunctionConfiguration = {},
        public readonly getChildren: () => Thenable<AWSTreeNodeBase[]> = async () => [],
        public readonly update: (configuration: Lambda.FunctionConfiguration) => void = config => { },
        public readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string =
            (relativeExtensionPath) => 'MockStandaloneFunctionNode'
    ) {
    }
}
