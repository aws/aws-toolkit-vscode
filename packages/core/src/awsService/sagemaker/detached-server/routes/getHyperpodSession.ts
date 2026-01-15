/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable aws-toolkits/no-console-log */
import { IncomingMessage, ServerResponse } from 'http'
import url from 'url'
import { parse } from '@aws-sdk/util-arn-parser'
import { getHyperpodConnection } from '../hyperpodMappingUtils'
import { KubectlClient, HyperpodDevSpace, HyperpodCluster } from '../kubectlClientStub'

export async function handleGetHyperpodSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '', true)
    const connectionKey = parsedUrl.query.connection_key
    const devspaceName = parsedUrl.query.devspace_name
    const namespace = parsedUrl.query.namespace
    const clusterName = parsedUrl.query.cluster_name

    try {
        let lookupKey: string

        if (connectionKey) {
            lookupKey = Array.isArray(connectionKey) ? connectionKey[0] : connectionKey
        } else if (devspaceName && namespace && clusterName) {
            const devspaceStr = Array.isArray(devspaceName) ? devspaceName[0] : devspaceName
            const namespaceStr = Array.isArray(namespace) ? namespace[0] : namespace
            const clusterStr = Array.isArray(clusterName) ? clusterName[0] : clusterName
            lookupKey = `${clusterStr}:${namespaceStr}:${devspaceStr}`
        } else if (devspaceName) {
            lookupKey = Array.isArray(devspaceName) ? devspaceName[0] : devspaceName
        } else {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(
                JSON.stringify({
                    status: 'error',
                    message: 'connection_key or (devspace_name + namespace + cluster_name) required',
                })
            )
            return
        }

        const connectionInfo = await getHyperpodConnection(lookupKey)
        if (!connectionInfo) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ status: 'error', message: 'Connection info not found' }))
            return
        }

        // Parse region from ARN - handle both standard and cluster ARN formats
        let region: string
        try {
            region = parse(connectionInfo.clusterArn).region
        } catch (error) {
            // Fallback: extract region from ARN string directly
            // ARN format: arn:aws:sagemaker:region:account:cluster/cluster-id
            const arnParts = connectionInfo.clusterArn.split(':')
            if (arnParts.length >= 4) {
                region = arnParts[3]
            } else {
                throw new Error(`Invalid SageMaker ARN format: "${connectionInfo.clusterArn}"`)
            }
        }
        const hyperpodCluster: HyperpodCluster = {
            clusterName: connectionInfo.clusterName,
            clusterArn: connectionInfo.clusterArn,
            status: 'Active',
            regionCode: region,
        }

        const eksCluster = {
            name: connectionInfo.eksClusterName,
            arn: connectionInfo.clusterArn,
            endpoint: connectionInfo.endpoint,
            certificateAuthority: {
                data: connectionInfo.certificateAuthorityData,
            },
        }

        const kubectlClient = new KubectlClient(eksCluster, hyperpodCluster)

        const keyParts = lookupKey.split(':')
        const actualDevspaceName = keyParts.length === 3 ? keyParts[2] : String(devspaceName || lookupKey)

        const devSpace: HyperpodDevSpace = {
            name: actualDevspaceName,
            namespace: connectionInfo.namespace,
            cluster: connectionInfo.clusterName,
            group: 'workspace.jupyter.org',
            version: 'v1alpha1',
            plural: 'workspaces',
            status: 'Running',
            appType: '',
            creator: '',
            accessType: '',
        }

        const workspaceConnection = await kubectlClient.createWorkspaceConnection(devSpace)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
            JSON.stringify({
                status: 'success',
                connection: workspaceConnection,
                devspace: actualDevspaceName,
                timestamp: Date.now(),
            })
        )
    } catch (error: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'error', message: error.message }))
    }
}
