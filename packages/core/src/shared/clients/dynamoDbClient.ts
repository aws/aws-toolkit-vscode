/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DynamoDB } from 'aws-sdk'
import globals from '../extensionGlobals'

/**
 * A client for interacting with AWS DynamoDB.
 * This class provides methods to list tables, retrieve information about a specific table, and scan a table.
 */
export class DynamoDbClient {
    public constructor(public readonly regionCode: string) {}

    protected async createSdkClient(): Promise<DynamoDB> {
        return await globals.sdkClientBuilder.createAwsService(DynamoDB, undefined, this.regionCode)
    }

    /**
     * Asynchronously retrieves a list of table names in DynamoDB.
     * This is a generator function that yields table names one by one.
     */
    public async *getTables(request: DynamoDB.Types.ListTablesInput = {}) {
        const sdkClient = await this.createSdkClient()
        const response = await sdkClient.listTables(request).promise()
        if (response.TableNames) {
            yield* response.TableNames
        }
    }

    /**
     * Retrieves information about a specific table in DynamoDB.
     * @param request - The parameters to describe the table.
     * @returns A promise that resolves to the table description.
     * @throws Will throw an error if the table is not found.
     */
    public async getTableInformation(
        request: DynamoDB.Types.DescribeTableInput
    ): Promise<DynamoDB.Types.TableDescription> {
        const sdkClient = await this.createSdkClient()
        const response = await sdkClient.describeTable(request).promise()
        if (response.Table) {
            return response.Table
        } else {
            throw new Error('Table not found.')
        }
    }

    /**
     * Scans a table in DynamoDB and retrieves the results.
     */
    public async scanTable(request: DynamoDB.Types.ScanInput) {
        const sdkClient = await this.createSdkClient()
        return sdkClient.scan(request).promise()
    }
}
