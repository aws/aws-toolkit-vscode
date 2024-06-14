/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'
import { InterfaceNoSymbol } from '../utilities/tsUtils'
import { DocDBClient, DocDBClientConfig, DBCluster, DescribeDBClustersCommand } from '@aws-sdk/client-docdb'

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
        const input = {
            Filters: [{ Name: 'engine', Values: ['docdb'] }],
        }

        const command = new DescribeDBClustersCommand(input)
        const response = await client.send(command)

        return response.DBClusters ?? []
    }
}
