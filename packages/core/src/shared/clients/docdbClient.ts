/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'
import { getLogger } from '../logger'
import { getUserAgent } from '../telemetry/util'
import { ToolkitError } from '../errors'
import { InterfaceNoSymbol } from '../utilities/tsUtils'
import * as DocDB from '@aws-sdk/client-docdb'

export interface DBInstance extends DocDB.DBInstance {
    IsClusterWriter?: boolean
}

export type DocumentDBClient = InterfaceNoSymbol<DefaultDocumentDBClient>

export class DefaultDocumentDBClient {
    public constructor(public readonly regionCode: string) {}

    public async getClient(): Promise<DocDB.DocDBClient> {
        const credentials = await globals.awsContext.getCredentials()
        const config: DocDB.DocDBClientConfig = {
            customUserAgent: await getUserAgent({ includePlatform: true, includeClientId: true }),
            credentials: credentials,
            region: this.regionCode,
        }
        return new DocDB.DocDBClient(config)
    }

    public async listClusters(): Promise<DocDB.DBCluster[]> {
        getLogger().debug('ListClusters called')
        const client = await this.getClient()

        try {
            const input = {
                Filters: [{ Name: 'engine', Values: ['docdb'] }],
            }
            const command = new DocDB.DescribeDBClustersCommand(input)
            const response = await client.send(command)
            return response.DBClusters ?? []
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to get DocumentDB clusters')
        }
    }

    public async listInstances(clusters: string[] = []): Promise<DBInstance[]> {
        getLogger().debug('ListInstances called')
        const client = await this.getClient()

        try {
            const input: DocDB.DescribeDBInstancesCommandInput = {}
            if (clusters?.length > 0) {
                input.Filters = [{ Name: 'db-cluster-id', Values: clusters }]
            }
            const command = new DocDB.DescribeDBInstancesCommand(input)
            const response = await client.send(command)
            return response.DBInstances ?? []
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to get DocumentDB instances')
        }
    }
}
