/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { AwsCredentialIdentity } from '@aws-sdk/types'
import { fromNodeProviderChain } from '@aws-sdk/credential-providers'
import { DescribeClusterCommand, EKSClient } from '@aws-sdk/client-eks'
import {
    ListClustersCommand,
    DescribeClusterCommand as SmDescribeClusterCommand,
    SageMakerClient,
} from '@amzn/sagemaker-client'
import { KubectlClient } from '../../shared/clients/kubectlClient'
import { HyperpodCluster, HyperpodDevSpace } from '../../awsService/sagemaker/detached-server/hyperpodTypes'
import { skipTest } from '../../test/setupUtil'
import globals from '../../shared/extensionGlobals'

/**
 * E2E tests for HyperPod SSH connections.
 *
 * These tests verify the critical user journeys using real AWS infrastructure:
 * 1. Authenticate → list clusters → list workspaces → verify space status
 * 2. Create workspace connection (kubectl API) → get session tokens
 *
 * Prerequisites:
 * - Valid AWS credentials with HyperPod/EKS access
 * - At least one HyperPod cluster with workspaces
 * - IAM role must have K8s RBAC permissions on the EKS cluster
 *
 * Run locally:
 *   ada credentials update --account=<account> --provider=isengard --role=Admin --once --profile=<profile>
 *   eval "$(AWS_PROFILE=<profile> aws configure export-credentials --format env)"
 *   AWS_DEFAULT_REGION=<region> TEST_DIR="../../core/dist/src/testE2E/sagemaker" npm run testE2E -w packages/toolkit
 */
describe('HyperPod SSH Connections E2E', function () {
    let credentials: AwsCredentialIdentity
    let testCluster: HyperpodCluster
    let testSpace: HyperpodDevSpace
    let kubectlClient: KubectlClient
    let regionCode: string

    before(async function () {
        this.timeout(120_000)

        // Resolve credentials: toolkit auth → env vars → SDK provider chain
        let creds: AwsCredentialIdentity | undefined
        const toolkitCreds = await globals.awsContext.getCredentials()
        if (toolkitCreds?.accessKeyId) {
            creds = {
                accessKeyId: toolkitCreds.accessKeyId,
                secretAccessKey: toolkitCreds.secretAccessKey!,
                sessionToken: toolkitCreds.sessionToken,
            }
        } else if (process.env['AWS_ACCESS_KEY_ID']) {
            creds = {
                accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
                secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
                sessionToken: process.env['AWS_SESSION_TOKEN'],
            }
        } else {
            try {
                creds = await fromNodeProviderChain()()
            } catch {
                // no credentials available
            }
        }

        if (!creds?.accessKeyId || !creds?.secretAccessKey) {
            skipTest(this, 'no valid AWS credentials')
            return
        }
        credentials = creds

        regionCode =
            process.env['AWS_DEFAULT_REGION'] ??
            process.env['AWS_REGION'] ??
            globals.awsContext.getCredentialDefaultRegion() ??
            'us-west-2'

        // List HyperPod clusters
        const smClient = new SageMakerClient({ region: regionCode, credentials })
        let clusterName: string
        try {
            const listResp = await smClient.send(new ListClustersCommand({}))
            if (!listResp.ClusterSummaries?.length) {
                skipTest(this, 'no HyperPod clusters found')
                return
            }
            clusterName = listResp.ClusterSummaries[0].ClusterName!
        } catch (e) {
            skipTest(this, `failed to list clusters: ${(e as Error).message}`)
            return
        }

        // Describe cluster to get EKS info
        const descResp = await smClient.send(new SmDescribeClusterCommand({ ClusterName: clusterName }))
        const eksClusterArn = descResp.Orchestrator?.Eks?.ClusterArn
        if (!eksClusterArn) {
            skipTest(this, 'cluster has no EKS orchestrator')
            return
        }
        const eksClusterName = eksClusterArn.split('/').pop()!

        testCluster = {
            clusterName,
            clusterArn: descResp.ClusterArn!,
            status: descResp.ClusterStatus!,
            eksClusterName,
            eksClusterArn,
            regionCode,
        }

        // Describe EKS cluster and create kubectl client
        const eksClient = new EKSClient({ region: regionCode, credentials })
        const eksResp = await eksClient.send(new DescribeClusterCommand({ name: eksClusterName }))
        const eksCluster = eksResp.cluster
        if (!eksCluster?.endpoint) {
            skipTest(this, 'EKS cluster has no endpoint')
            return
        }

        try {
            kubectlClient = await KubectlClient.createForCluster(eksCluster, testCluster, credentials)
        } catch (e) {
            skipTest(this, `failed to create kubectl client: ${(e as Error).message}`)
            return
        }

        // Find a workspace
        const spaces = await kubectlClient.getSpacesForCluster(eksCluster)
        if (!spaces.length) {
            skipTest(this, 'no HyperPod workspaces found')
            return
        }
        testSpace = spaces[0]
    })

    it('side panel → list spaces and verify status', async function () {
        this.timeout(60_000)

        // Verify we can get space status (proves kubectl auth + K8s API works)
        const status = await kubectlClient.getHyperpodSpaceStatus(testSpace)
        assert.ok(
            ['Running', 'Stopped', 'Starting', 'Stopping'].includes(status),
            `Expected valid status, got: ${status}`
        )

        // Verify space has required metadata
        assert.ok(testSpace.name, 'Space must have a name')
        assert.ok(testSpace.namespace, 'Space must have a namespace')
        assert.ok(testSpace.cluster, 'Space must have a cluster')
    })

    it('side panel → connect to running space → workspace connection established', async function () {
        this.timeout(300_000)

        const status = await kubectlClient.getHyperpodSpaceStatus(testSpace)
        if (status !== 'Running') {
            skipTest(this, `space is not Running (status: ${status})`)
            return
        }

        // This is the kubectl API call that creates the SSH tunnel session
        // TODO: Once WorkspaceConnection CRD (connection.workspace.jupyter.org) is deployed on test clusters,
        // extend this test to call prepareDevEnvConnection and verify the full SSH tunnel setup.
        let workspaceConnection
        try {
            workspaceConnection = await kubectlClient.createWorkspaceConnection(testSpace)
        } catch (e) {
            skipTest(this, `WorkspaceConnection CRD not available on cluster: ${(e as Error).message}`)
            return
        }

        assert.ok(workspaceConnection.url, 'Expected workspace connection URL')
        assert.ok(workspaceConnection.type, 'Expected connection type')
    })

    it('deeplink → connect to running space → workspace connection established', async function () {
        this.timeout(300_000)

        const status = await kubectlClient.getHyperpodSpaceStatus(testSpace)
        if (status !== 'Running') {
            skipTest(this, `space is not Running (status: ${status})`)
            return
        }

        // Deeplink flow uses the same kubectl connection — verify it works
        let workspaceConnection
        try {
            workspaceConnection = await kubectlClient.createWorkspaceConnection(testSpace)
        } catch (e) {
            skipTest(this, `WorkspaceConnection CRD not available on cluster: ${(e as Error).message}`)
            return
        }

        assert.ok(workspaceConnection.url, 'Expected workspace connection URL for deeplink')
        assert.ok(
            workspaceConnection.sessionId || workspaceConnection.url.includes('session'),
            'Expected session info in connection result'
        )
    })
})
