/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { assertTelemetry } from '../../testUtil'
import { getTestWindow } from '../../shared/vscode/window'
import { DBCluster, DBInstance } from '@aws-sdk/client-docdb'
import { DocumentDBClient } from '../../../shared/clients/docdbClient'
import { DocumentDBNode } from '../../../docdb/explorer/docdbNode'
import { DBElasticClusterNode } from '../../../docdb/explorer/dbElasticClusterNode'
import { DBClusterNode } from '../../../docdb/explorer/dbClusterNode'
import { deleteCluster } from '../../../docdb/commands/deleteCluster'

describe('deleteClusterCommand', function () {
    const clusterName = 'test-cluster'
    let docdb: DocumentDBClient
    let sinonSandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sinonSandbox = sinon.createSandbox()
        spyExecuteCommand = sinonSandbox.spy(vscode.commands, 'executeCommand')
    })
    afterEach(function () {
        sinonSandbox.restore()
        getTestWindow().dispose()
    })
    function setupWizard() {
        getTestWindow().onDidShowInputBox((input) => {
            input.acceptValue(input.placeholder!)
        })

        getTestWindow().onDidShowQuickPick(async (picker) => {
            await picker.untilReady()
            picker.acceptItem(picker.items[0])
        })
    }

    describe('regional cluster', function () {
        let cluster: DBCluster
        let instances: DBInstance[]
        let node: DBClusterNode
        let deleteInstanceStub: sinon.SinonStub

        beforeEach(function () {
            cluster = { DBClusterIdentifier: clusterName, Status: 'available' }
            instances = [
                { DBClusterIdentifier: clusterName, DBInstanceIdentifier: 'instance-1' },
                { DBClusterIdentifier: clusterName, DBInstanceIdentifier: 'instance-2' },
            ]

            docdb = { regionCode: 'us-east-1' } as DocumentDBClient
            docdb.listClusters = sinon.stub().resolves([cluster])
            docdb.listInstances = sinon.stub().resolves(instances)
            deleteInstanceStub = sinon.stub().onFirstCall().resolves(instances[0]).onSecondCall().resolves(instances[1])
            docdb.deleteInstance = deleteInstanceStub

            const parentNode = new DocumentDBNode(docdb)
            node = new DBClusterNode(parentNode, cluster, docdb)
            node.waitUntilStatusChanged = sinon.stub().resolves(true)
        })

        it('prompts for snapshot and confirmation, deletes all instances, deletes cluster, and refreshes node', async function () {
            // arrange
            const deleteClusterStub = sinon.stub().resolves({
                DBClusterIdentifier: clusterName,
                Status: 'backing up',
            })
            docdb.deleteCluster = deleteClusterStub
            setupWizard()

            // act
            await deleteCluster(node)

            // assert
            getTestWindow()
                .getFirstMessage()
                .assertInfo(/Deleting cluster: test-cluster/)

            assert(deleteClusterStub.calledOnceWithExactly(sinon.match({ DBClusterIdentifier: clusterName })))
            assert(deleteInstanceStub.calledTwice)
            sinonSandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node.parent)

            assertTelemetry('docdb_deleteCluster', {
                result: 'Succeeded',
            })
        })

        it('does nothing when prompt is cancelled', async function () {
            const deleteClusterStub = sinon.stub()
            docdb.deleteCluster = deleteClusterStub
            getTestWindow().onDidShowQuickPick((picker) => picker.hide())
            getTestWindow().onDidShowInputBox((input) => input.hide())

            await assert.rejects(deleteCluster(node))
            assert(deleteClusterStub.notCalled)
            assertTelemetry('docdb_deleteCluster', {
                result: 'Cancelled',
            })
        })

        it('shows a warning when the cluster is stopped', async function () {
            cluster.Status = 'stopped'
            const deleteClusterStub = sinon.stub()
            docdb.deleteCluster = deleteClusterStub
            setupWizard()

            await assert.rejects(deleteCluster(node))
            getTestWindow()
                .getFirstMessage()
                .assertMessage(/Cluster must be running/)

            assertTelemetry('docdb_deleteCluster', {
                result: 'Cancelled',
            })
        })

        it('shows an error when cluster deletion fails', async function () {
            const deleteClusterStub = sinon.stub().rejects()
            docdb.deleteCluster = deleteClusterStub
            setupWizard()

            await assert.rejects(deleteCluster(node))

            getTestWindow()
                .getFirstMessage()
                .assertError(/Failed to delete cluster: test-cluster/)

            assertTelemetry('docdb_deleteCluster', {
                result: 'Failed',
            })
        })
    })

    describe('elastic cluster', function () {
        let cluster: any
        let node: DBElasticClusterNode

        beforeEach(function () {
            cluster = { clusterName, clusterArn: 'arn:test-cluster', status: 'ACTIVE' }
            docdb = { regionCode: 'us-east-1' } as DocumentDBClient
            docdb.listElasticClusters = sinon.stub().resolves([cluster])

            const parentNode = new DocumentDBNode(docdb)
            node = new DBElasticClusterNode(parentNode, cluster, docdb)
            node.waitUntilStatusChanged = sinon.stub().resolves(true)
        })

        it('prompts for snapshot and confirmation, creates snapshot, deletes cluster, and refreshes node', async function () {
            // arrange
            const createSnapshotStub = sinon.stub().resolves()
            const deleteClusterStub = sinon.stub().resolves()
            docdb.createClusterSnapshot = createSnapshotStub
            docdb.deleteElasticCluster = deleteClusterStub
            setupWizard()

            // act
            await deleteCluster(node)

            // assert
            getTestWindow()
                .getFirstMessage()
                .assertInfo(/Taking snapshot of cluster: test-cluster/)

            getTestWindow()
                .getSecondMessage()
                .assertInfo(/Deleting cluster: test-cluster/)

            assert(createSnapshotStub.calledOnceWithExactly(sinon.match({ clusterArn: cluster.clusterArn })))
            assert(deleteClusterStub.calledOnceWithExactly(cluster.clusterArn))
            sinonSandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node.parent)

            assertTelemetry('docdb_deleteCluster', {
                result: 'Succeeded',
            })
        })

        it('does nothing when prompt is cancelled', async function () {
            // arrange
            const deleteClusterStub = sinon.stub()
            docdb.deleteElasticCluster = deleteClusterStub
            getTestWindow().onDidShowQuickPick((picker) => picker.hide())
            getTestWindow().onDidShowInputBox((input) => input.hide())

            // act
            await assert.rejects(deleteCluster(node))

            // assert
            assert(deleteClusterStub.notCalled)

            assertTelemetry('docdb_deleteCluster', {
                result: 'Cancelled',
            })
        })

        it('shows a warning when the cluster is stopped', async function () {
            // arrange
            cluster.status = 'STOPPED'
            const deleteClusterStub = sinon.stub()
            docdb.deleteElasticCluster = deleteClusterStub
            setupWizard()

            // act
            await assert.rejects(deleteCluster(node))

            // assert
            getTestWindow()
                .getFirstMessage()
                .assertMessage(/Cluster must be running/)

            assertTelemetry('docdb_deleteCluster', {
                result: 'Cancelled',
            })
        })

        it('shows an error when cluster deletion fails', async function () {
            // arrange
            docdb.createClusterSnapshot = sinon.stub().resolves()
            docdb.deleteElasticCluster = sinon.stub().rejects()
            setupWizard()

            // act
            await assert.rejects(deleteCluster(node))

            // assert
            getTestWindow()
                .getSecondMessage()
                .assertError(/Failed to delete cluster: test-cluster/)

            assertTelemetry('docdb_deleteCluster', {
                result: 'Failed',
            })
        })
    })
})
