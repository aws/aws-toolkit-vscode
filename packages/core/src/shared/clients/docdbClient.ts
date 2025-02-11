/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'
import { getLogger } from '../logger/logger'
import { getUserAgent } from '../telemetry/util'
import { ToolkitError } from '../errors'
import { InterfaceNoSymbol } from '../utilities/tsUtils'
import * as DocDB from '@aws-sdk/client-docdb'
import * as DocDBElastic from '@aws-sdk/client-docdb-elastic'

function isElasticCluster(clusterId: string | undefined): boolean | undefined {
    return clusterId?.includes(':docdb-elastic:')
}

export const DocDBEngine = 'docdb'
export const DBStorageType = { Standard: 'standard', IOpt1: 'iopt1' } as const
export const MaxInstanceCount = 16

/** A list of Amazon DocumentDB clusters. */
export type DBElasticCluster = DocDBElastic.Cluster & DocDBElastic.ClusterInList

export interface DBInstance extends DocDB.DBInstance {
    IsClusterWriter?: boolean
}

export type DocumentDBClient = InterfaceNoSymbol<DefaultDocumentDBClient>

export class DefaultDocumentDBClient {
    static create(regionCode: string): DocumentDBClient {
        return new DefaultDocumentDBClient(regionCode)
    }

    private constructor(public readonly regionCode: string) {}

    private async getSdkConfig() {
        const credentials = await globals.awsContext.getCredentials()
        return {
            customUserAgent: getUserAgent({ includePlatform: true, includeClientId: true }),
            credentials: credentials,
            region: this.regionCode,
        }
    }

    public async getClient(): Promise<DocDB.DocDBClient> {
        const config = await this.getSdkConfig()
        return new DocDB.DocDBClient(config)
    }

    public async getElasticClient(): Promise<DocDBElastic.DocDBElasticClient> {
        const config = await this.getSdkConfig()
        return new DocDBElastic.DocDBElasticClient(config)
    }

    private async executeCommand<TOutput extends DocDB.ServiceOutputTypes>(command: any): Promise<TOutput> {
        getLogger().debug(`docdbClient: ${command.constructor.name} called`)
        const client = await this.getClient()
        try {
            return await client.send(command)
        } finally {
            client.destroy()
        }
    }

    private async executeElasticCommand<TOutput extends DocDBElastic.ServiceOutputTypes>(
        command: any
    ): Promise<TOutput> {
        getLogger().debug(`docdbClient: ${command.constructor.name} called`)
        const client = await this.getElasticClient()
        try {
            return await client.send(command)
        } finally {
            client.destroy()
        }
    }

    // Ideally, we would return AsyncCollection or iterator
    public async listInstanceClassOptions(
        engineVersion: string | undefined,
        storageType: string | undefined
    ): Promise<DocDB.OrderableDBInstanceOption[]> {
        getLogger().debug('docdbClient: ListInstanceClassOptions called')
        const client = await this.getClient()

        try {
            const instanceClasses: DocDB.OrderableDBInstanceOption[] = []
            const input = {
                Engine: DocDBEngine,
                EngineVersion: engineVersion,
            }
            const paginator = DocDB.paginateDescribeOrderableDBInstanceOptions({ client }, input)
            for await (const page of paginator) {
                instanceClasses.push(...(page.OrderableDBInstanceOptions ?? []))
            }

            return instanceClasses.filter((ic) => storageType === ic.StorageType || storageType === undefined)
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to get instance classes')
        } finally {
            client.destroy()
        }
    }

    public async listEngineVersions(): Promise<DocDB.DBEngineVersion[]> {
        const command = new DocDB.DescribeDBEngineVersionsCommand({ Engine: DocDBEngine })
        const response = await this.executeCommand<DocDB.DescribeDBEngineVersionsCommandOutput>(command)
        return response.DBEngineVersions ?? []
    }

    public async listGlobalClusters(clusterId: string | undefined = undefined): Promise<DocDB.GlobalCluster[]> {
        const input: DocDB.DescribeGlobalClustersCommandInput = {
            Filters: [],
            GlobalClusterIdentifier: clusterId,
        }
        const command = new DocDB.DescribeGlobalClustersCommand(input)
        const response = await this.executeCommand<DocDB.DescribeGlobalClustersCommandOutput>(command)
        return response.GlobalClusters ?? []
    }

    public async listElasticClusters(): Promise<DocDBElastic.ClusterInList[]> {
        const command = new DocDBElastic.ListClustersCommand()
        const response = await this.executeElasticCommand<DocDBElastic.ListClustersCommandOutput>(command)
        return response.clusters ?? []
    }

    public async listClusters(clusterId: string | undefined = undefined): Promise<DocDB.DBCluster[]> {
        const input: DocDB.DescribeDBClustersCommandInput = {
            Filters: [{ Name: 'engine', Values: [DocDBEngine] }],
            DBClusterIdentifier: clusterId,
        }
        const command = new DocDB.DescribeDBClustersCommand(input)
        const response = await this.executeCommand<DocDB.DescribeDBClustersCommandOutput>(command)
        return response.DBClusters ?? []
    }

    public async listInstances(clusters: string[] = []): Promise<DBInstance[]> {
        const input: DocDB.DescribeDBInstancesCommandInput = {}
        if (clusters?.length > 0) {
            input.Filters = [{ Name: 'db-cluster-id', Values: clusters }]
        }
        const command = new DocDB.DescribeDBInstancesCommand(input)
        const response = await this.executeCommand<DocDB.DescribeDBInstancesCommandOutput>(command)
        return response.DBInstances ?? []
    }

    public async getElasticCluster(clusterArn: string): Promise<DBElasticCluster | undefined> {
        const command = new DocDBElastic.GetClusterCommand({ clusterArn })
        const response = await this.executeElasticCommand<DocDBElastic.GetClusterCommandOutput>(command)
        return response.cluster
    }

    public async createCluster(input: DocDB.CreateDBClusterMessage): Promise<DocDB.DBCluster | undefined> {
        const command = new DocDB.CreateDBClusterCommand(input)
        const response = await this.executeCommand<DocDB.CreateDBClusterCommandOutput>(command)
        return response.DBCluster
    }

    public async createElasticCluster(
        input: DocDBElastic.CreateClusterInput
    ): Promise<DocDBElastic.Cluster | undefined> {
        const command = new DocDBElastic.CreateClusterCommand(input)
        const response = await this.executeElasticCommand<DocDBElastic.CreateClusterCommandOutput>(command)
        return response.cluster
    }

    public async createGlobalCluster(
        input: DocDB.CreateGlobalClusterCommandInput
    ): Promise<DocDB.GlobalCluster | undefined> {
        const command = new DocDB.CreateGlobalClusterCommand(input)
        const response = await this.executeCommand<DocDB.CreateGlobalClusterCommandOutput>(command)
        return response.GlobalCluster
    }

    public async modifyGlobalCluster(
        input: DocDB.ModifyGlobalClusterCommandInput
    ): Promise<DocDB.GlobalCluster | undefined> {
        const command = new DocDB.ModifyGlobalClusterCommand(input)
        const response = await this.executeCommand<DocDB.ModifyGlobalClusterCommandOutput>(command)
        return response.GlobalCluster
    }

    public async createClusterSnapshot(
        input: DocDBElastic.CreateClusterSnapshotInput
    ): Promise<DocDBElastic.ClusterSnapshot | undefined> {
        const command = new DocDBElastic.CreateClusterSnapshotCommand(input)
        const response = await this.executeElasticCommand<DocDBElastic.CreateClusterSnapshotCommandOutput>(command)
        return response.snapshot
    }

    public async modifyCluster(input: DocDB.ModifyDBClusterMessage): Promise<DocDB.DBCluster | undefined> {
        const command = new DocDB.ModifyDBClusterCommand(input)
        const response = await this.executeCommand<DocDB.ModifyDBClusterCommandOutput>(command)
        return response.DBCluster
    }

    public async deleteCluster(input: DocDB.DeleteDBClusterMessage): Promise<DocDB.DBCluster | undefined> {
        const command = new DocDB.DeleteDBClusterCommand(input)
        const response = await this.executeCommand<DocDB.DeleteDBClusterCommandOutput>(command)
        return response.DBCluster
    }

    public async deleteElasticCluster(clusterArn: string): Promise<DocDBElastic.Cluster | undefined> {
        const command = new DocDBElastic.DeleteClusterCommand({ clusterArn })
        const response = await this.executeElasticCommand<DocDBElastic.DeleteClusterCommandOutput>(command)
        return response.cluster
    }

    public async getInstance(instanceId: string): Promise<DBInstance | undefined> {
        const input: DocDB.DescribeDBInstancesCommandInput = {
            DBInstanceIdentifier: instanceId,
        }
        const command = new DocDB.DescribeDBInstancesCommand(input)
        const response = await this.executeCommand<DocDB.DescribeDBInstancesCommandOutput>(command)
        return response.DBInstances ? response.DBInstances[0] : undefined
    }

    public async createInstance(input: DocDB.CreateDBInstanceMessage): Promise<DocDB.DBInstance | undefined> {
        const command = new DocDB.CreateDBInstanceCommand(input)
        const response = await this.executeCommand<DocDB.CreateDBInstanceCommandOutput>(command)
        return response.DBInstance
    }

    public async modifyInstance(input: DocDB.ModifyDBInstanceMessage): Promise<DocDB.DBInstance | undefined> {
        const command = new DocDB.ModifyDBInstanceCommand(input)
        const response = await this.executeCommand<DocDB.ModifyDBInstanceCommandOutput>(command)
        return response.DBInstance
    }

    public async deleteInstance(input: DocDB.DeleteDBInstanceMessage): Promise<DocDB.DBInstance | undefined> {
        const command = new DocDB.DeleteDBInstanceCommand(input)
        const response = await this.executeCommand<DocDB.DeleteDBInstanceCommandOutput>(command)
        return response.DBInstance
    }

    public async rebootInstance(instanceId: string): Promise<boolean> {
        const command = new DocDB.RebootDBInstanceCommand({ DBInstanceIdentifier: instanceId })
        const response = await this.executeCommand<DocDB.RebootDBInstanceCommandOutput>(command)
        return !!response.DBInstance
    }

    public async listResourceTags(arn: string): Promise<Record<string, string | undefined> | undefined> {
        if (isElasticCluster(arn)) {
            const command = new DocDBElastic.ListTagsForResourceCommand({ resourceArn: arn })
            const response = await this.executeElasticCommand<DocDBElastic.ListTagsForResourceCommandOutput>(command)
            return response.tags
        } else {
            const command = new DocDB.ListTagsForResourceCommand({ ResourceName: arn })
            const response = await this.executeCommand<DocDB.ListTagsForResourceCommandOutput>(command)
            const tagMap = response.TagList?.reduce(
                (map, tag) => {
                    map[tag.Key!] = tag.Value
                    return map
                },
                {} as Record<string, string | undefined>
            )
            return tagMap
        }
    }

    public async addResourceTags(input: DocDBElastic.TagResourceCommandInput): Promise<void> {
        if (isElasticCluster(input.resourceArn)) {
            const command = new DocDBElastic.TagResourceCommand(input)
            await this.executeElasticCommand(command)
        } else {
            const command = new DocDB.AddTagsToResourceCommand({
                ResourceName: input.resourceArn,
                Tags: Object.entries(input.tags ?? {}).map(([Key, Value]) => ({ Key, Value })),
            })
            await this.executeCommand(command)
        }
    }

    public async removeResourceTags(input: DocDBElastic.UntagResourceCommandInput): Promise<void> {
        if (isElasticCluster(input.resourceArn)) {
            const command = new DocDBElastic.UntagResourceCommand(input)
            await this.executeElasticCommand(command)
        } else {
            const command = new DocDB.RemoveTagsFromResourceCommand({
                ResourceName: input.resourceArn,
                TagKeys: input.tagKeys,
            })
            await this.executeCommand(command)
        }
    }

    public async startCluster(clusterId: string) {
        if (isElasticCluster(clusterId)) {
            const command = new DocDBElastic.StartClusterCommand({ clusterArn: clusterId })
            await this.executeElasticCommand(command)
        } else {
            const command = new DocDB.StartDBClusterCommand({ DBClusterIdentifier: clusterId })
            await this.executeCommand(command)
        }
    }

    public async stopCluster(clusterId: string) {
        if (isElasticCluster(clusterId)) {
            const command = new DocDBElastic.StopClusterCommand({ clusterArn: clusterId })
            await this.executeElasticCommand(command)
        } else {
            const command = new DocDB.StopDBClusterCommand({ DBClusterIdentifier: clusterId })
            await this.executeCommand(command)
        }
    }
}
