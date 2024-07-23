/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { assertTelemetry } from '../../testUtil'
import { getTestWindow } from '../../shared/vscode/window'
import { DocumentDBClient } from '../../../shared/clients/docdbClient'
import { DBClusterNode } from '../../../docdb/explorer/dbClusterNode'
import { DBCluster, DBInstance } from '@aws-sdk/client-docdb'
import { deleteCluster } from '../../../docdb/commands/deleteCluster'
import { DocumentDBNode } from '../../../docdb/explorer/docdbNode'

describe('deleteClusterCommand', function () {
    const clusterName = 'test-cluster'
    let docdb: DocumentDBClient
    let cluster: DBCluster
    let instances: DBInstance[]
    let node: DBClusterNode
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy
    let deleteInstanceStub: sinon.SinonStub

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

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

    afterEach(function () {
        sandbox.restore()
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
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node.parent)

        assertTelemetry('docdb_deleteCluster', {
            result: 'Succeeded',
        })
    })

    it('does nothing when prompt is cancelled', async function () {
        // arrange
        const deleteClusterStub = sinon.stub()
        docdb.deleteCluster = deleteClusterStub
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
        cluster.Status = 'stopped'
        const deleteClusterStub = sinon.stub()
        docdb.deleteCluster = deleteClusterStub
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
        const deleteClusterStub = sinon.stub().rejects()
        docdb.deleteCluster = deleteClusterStub
        setupWizard()

        // act
        await assert.rejects(deleteCluster(node))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to delete cluster: test-cluster/)

        assertTelemetry('docdb_deleteCluster', {
            result: 'Failed',
        })
    })
})
