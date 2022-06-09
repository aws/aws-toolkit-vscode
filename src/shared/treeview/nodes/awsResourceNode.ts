/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSTreeNodeBase } from './awsTreeNodeBase'

export interface AWSResourceNode {
    /**
     * Returns the ARN of the AWS resource. All nodes should return an ARN or throw an Error if not found.
     */
    readonly arn: string

    /**
     * Returns the name of the AWS resource.
     */
    readonly name: string
}

export function isAwsResourceNode(node: AWSTreeNodeBase): node is AWSTreeNodeBase & AWSResourceNode {
    return (
        typeof (node as unknown as AWSResourceNode).arn === 'string' &&
        typeof (node as unknown as AWSResourceNode).name === 'string'
    )
}
