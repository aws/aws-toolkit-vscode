/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DynamoDB } from 'aws-sdk'
import globals from '../extensionGlobals'
// import { cli } from "winston/lib/winston/config"

export class DynamoDbClient {
    public constructor(public readonly regionCode: string) {}

    protected async createSdkClient(): Promise<DynamoDB> {
        return await globals.sdkClientBuilder.createAwsService(DynamoDB, undefined, this.regionCode)
    }

    public async *getTables(request: DynamoDB.Types.ListTablesInput = {}) {
        const sdkClient = await this.createSdkClient()
        const respone = await this.invokeGetTables(sdkClient, request)
        if (respone.TableNames) {
            yield* respone.TableNames
        }
    }

    protected async invokeGetTables(
        sdkClient: DynamoDB,
        request: DynamoDB.Types.ListTablesInput
    ): Promise<DynamoDB.Types.ListTablesOutput> {
        return sdkClient.listTables(request).promise()
    }
}
