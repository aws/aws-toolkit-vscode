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

    public async getTables() {
        const client = await this.createSdkClient()

        client.listTables((err, data) => {
            if (err) {
                console.error(err)
            } else {
                console.log(data)
            }
        })
    }
}
