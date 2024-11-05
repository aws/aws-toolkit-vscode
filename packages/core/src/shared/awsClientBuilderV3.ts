/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AwsContext } from './awsContext'

interface AwsClient {}
interface AwsClientOptions {}

export interface AWSClientBuilderV3 {
    createAwsService<T extends AwsClient>(
        type: new (o: AwsClientOptions) => T,
        options?: AwsClientOptions,
        region?: string,
        userAgent?: string
    ): Promise<T>
}

export class DefaultAWSClientBuilderV3 implements AWSClientBuilderV3 {
    public constructor(private readonly context: AwsContext) {}

    public async createAwsService<T extends AwsClient>(
        type: new (o: AwsClientOptions) => T,
        options?: AwsClientOptions,
        region?: string,
        userAgent?: string
    ): Promise<T> {
        const opt = { ...options }
        const service = new type(opt)
        return service
    }
}
