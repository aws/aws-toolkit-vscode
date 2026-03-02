/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable aws-toolkits/no-console-log */
/* eslint-disable no-restricted-imports */
import { IncomingMessage, ServerResponse } from 'http'
import url from 'url'
import { parse } from '@aws-sdk/util-arn-parser'
import { getHyperpodConnection, storeHyperpodConnection } from '../hyperpodMappingUtils'
import { KubectlClient, HyperpodDevSpace, HyperpodCluster } from '../kubectlClientStub'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

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

        // Validate required fields
        if (!connectionInfo.clusterArn || !connectionInfo.clusterName || !connectionInfo.namespace) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ status: 'error', message: 'Incomplete connection info: missing required fields' }))
            return
        }

        const keyParts = lookupKey.split(':')
        const actualDevspaceName = keyParts.length === 3 ? keyParts[2] : String(devspaceName || lookupKey)

        // Check if we have EKS cluster details for kubectl-based reconnection
        const hasKubectlDetails = !!(connectionInfo.endpoint && connectionInfo.certificateAuthorityData)

        // If this is a presigned URL connection without kubectl details,
        // try to fetch EKS cluster details and generate fresh credentials
        if (connectionInfo.wsUrl && !hasKubectlDetails) {
            try {
                // Attempt to fetch EKS cluster details using AWS CLI
                const region = connectionInfo.region || parse(connectionInfo.clusterArn).region
                const { stdout } = await execFileAsync('aws', [
                    'eks',
                    'describe-cluster',
                    '--name',
                    connectionInfo.eksClusterName,
                    '--region',
                    region,
                    '--output',
                    'json',
                ])

                const clusterData = JSON.parse(stdout)
                const endpoint = clusterData.cluster?.endpoint
                const certData = clusterData.cluster?.certificateAuthority?.data

                if (endpoint && certData) {
                    // Update stored connection with EKS details for future use
                    await storeHyperpodConnection(
                        actualDevspaceName,
                        connectionInfo.namespace,
                        connectionInfo.clusterArn,
                        connectionInfo.clusterName,
                        connectionInfo.eksClusterName,
                        endpoint,
                        certData,
                        region,
                        connectionInfo.wsUrl,
                        connectionInfo.token
                    )

                    // Now proceed with kubectl-based fresh credential generation
                    connectionInfo.endpoint = endpoint
                    connectionInfo.certificateAuthorityData = certData
                } else {
                    throw new Error('EKS cluster details incomplete')
                }
            } catch (error) {
                // If fetching EKS details fails, return stored URL as fallback
                // This will fail if the presigned URL has expired
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(
                    JSON.stringify({
                        status: 'success',
                        connection: {
                            type: 'vscode-remote',
                            url: connectionInfo.wsUrl,
                        },
                        devspace: actualDevspaceName,
                        timestamp: Date.now(),
                        warning: `Using cached presigned URL. Fresh credential generation failed: ${error instanceof Error ? error.message : String(error)}`,
                    })
                )
                return
            }
        }

        // For kubectl-based connections (left panel), always generate fresh credentials

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

        // Validate EKS cluster has required fields for kubectl connection
        if (!eksCluster.endpoint || !eksCluster.certificateAuthority.data) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(
                JSON.stringify({
                    status: 'error',
                    message:
                        'Cannot generate fresh credentials: EKS cluster endpoint and certificate are missing. This connection was established via presigned URL. The presigned URL may have expired. Please reconnect from AWS Explorer or the console.',
                })
            )
            return
        }

        const kubectlClient = new KubectlClient(eksCluster, hyperpodCluster)

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
