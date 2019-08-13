/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lambda } from 'aws-sdk'
import {
    LambdaFunctionGroupNode,
    LambdaFunctionNode
} from '../../../lambda/explorer/lambdaNodes'
import { AWSTreeErrorHandlerNode } from '../../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { RegionNode } from '../../../shared/treeview/nodes/regionNode'

export class MockLambdaFunctionGroupNode extends AWSTreeErrorHandlerNode implements LambdaFunctionGroupNode {
    public constructor(
        public readonly regionCode: string = '',
        public readonly parent: RegionNode = {} as any as RegionNode,
        public readonly getChildren: () => Thenable<LambdaFunctionNode[]> = async () => [],
        public readonly updateChildren: () => Thenable<void> = async () => { },
        public readonly doErrorProneOperation: () => Promise<void> = async () => { },
    ) {
        super('')
    }
}

export class MockLambdaFunctionNode implements LambdaFunctionNode {

    public constructor(
        public readonly regionCode: string = '',
        public readonly functionName: string = '',
        public readonly parent: LambdaFunctionGroupNode = {} as any as LambdaFunctionGroupNode,
        public readonly configuration: Lambda.FunctionConfiguration = {},
        public readonly getChildren: () => Thenable<AWSTreeNodeBase[]> = async () => [],
        public readonly update: (configuration: Lambda.FunctionConfiguration) => void = config => { },
        public readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string =
            (relativeExtensionPath) => 'MockLambdaFunctionNode'
    ) {
    }
}
