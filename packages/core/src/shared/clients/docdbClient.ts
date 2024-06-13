/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
    private readonly config: DocDBClientConfig

    public constructor(public readonly regionCode: string) {
        this.config = {
            region: regionCode,
        }
    }

    public async listClusters(): Promise<DBCluster[]> {
        const client = new DocDBClient(this.config)
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
