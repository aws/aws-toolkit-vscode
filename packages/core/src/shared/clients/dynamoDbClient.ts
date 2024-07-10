/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DynamoDB } from 'aws-sdk'
import globals from '../extensionGlobals'

export class DynamoDbClient {
    public constructor(public readonly regionCode: string) {}

    protected async createSdkClient(): Promise<DynamoDB> {
        return await globals.sdkClientBuilder.createAwsService(DynamoDB, undefined, this.regionCode)
    }

    public async getTables(request: DynamoDB.Types.ListTablesInput = {}) {
        const sdkClient = await this.createSdkClient()
        const response = await sdkClient.listTables(request).promise()
        if (response.TableNames) {
            return response.TableNames
        } else {
            throw new Error('No tables found')
        }
    }

    public async getTableInformation(
        request: DynamoDB.Types.DescribeTableInput
    ): Promise<DynamoDB.Types.DescribeTableOutput> {
        const sdkClient = await this.createSdkClient()
        return sdkClient.describeTable(request).promise()
    }

    public async scanTable(request: DynamoDB.Types.ScanInput) {
        const sdkClient = await this.createSdkClient()
        return sdkClient.scan(request).promise()
    }
}
