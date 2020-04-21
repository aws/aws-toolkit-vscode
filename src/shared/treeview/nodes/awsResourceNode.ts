/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AWSResourceNode {
    /**
     * Returns the ARN of the AWS resource. All nodes should return an ARN or throw an Error if not found.
     */
    getArn(): string
}
