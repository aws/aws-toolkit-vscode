/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'
import { InterfaceNoSymbol } from '../utilities/tsUtils'
import {
    DocDBClient,
    DescribeDBClustersCommand,
    DBCluster,
    DocDBClientConfig,
    DescribeGlobalClustersCommand,
} from '@aws-sdk/client-docdb'

export type DocumentDBClient = InterfaceNoSymbol<DefaultDocumentDBClient>

export class DefaultDocumentDBClient {
    public constructor(public readonly regionCode: string) {}

    public async getClient(): Promise<DocDBClient> {
        const credentials = await globals.awsContext.getCredentials()
        const config: DocDBClientConfig = {
            credentials: credentials,
            region: this.regionCode,
        }
        return new DocDBClient(config)
    }

    public async listClusters(): Promise<DBCluster[]> {
        const client = await this.getClient()
        let results: DBCluster[] = []

        const input = {
            Filters: [{ Name: 'engine', Values: ['docdb'] }],
        }

        let command = new DescribeDBClustersCommand(input)
        const response = await client.send(command)
        results = response.DBClusters ?? []

        command = new DescribeGlobalClustersCommand(input)
        const response2 = await client.send(command)

        return results.concat(response2.DBClusters ?? [])
    }
}
