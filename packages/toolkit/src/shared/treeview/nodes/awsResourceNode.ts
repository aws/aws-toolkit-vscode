/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AWSResourceNode {
    /**
     * Returns the ARN of the AWS resource. All nodes should return an ARN or throw an Error if not found.
     */
    readonly arn: string

    /**
     * Returns the name of the AWS resource.
     */
    readonly name: string

    /** Service-defined idenifier, e.g. for EC2 this is the "Instance Id". */
    readonly id?: string
}
