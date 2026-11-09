/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { getTestWindow } from '../../shared/vscode/window'
import { DocumentDBClient } from '../../../shared/clients/docdbClient'
import { DBClusterNode } from '../../../docdb/explorer/dbClusterNode'
import { DocumentDBNode } from '../../../docdb/explorer/docdbNode'
import { renameCluster } from '../../../docdb/commands/renameCluster'
import { DBCluster } from '@aws-sdk/client-docdb'
import { assertTelemetry } from '../../testUtil'

describe('renameClusterCommand', function () {
    const clusterName = 'test-cluster'
    const newClusterName = 'new-cluster-name'
    let docdb: DocumentDBClient
    let spyExecuteCommand: sinon.SinonSpy
    let cluster: DBCluster
    let node: DBClusterNode
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        docdb = { regionCode: 'us-east-1' } as DocumentDBClient
        cluster = { DBClusterIdentifier: clusterName, Status: 'available' }
        node = new DBClusterNode(new DocumentDBNode(docdb), cluster, docdb)
    })

    afterEach(function () {
        sandbox.restore()
        getTestWindow().dispose()
    })

    function setupWizard() {
        getTestWindow().onDidShowInputBox((input) => {
            input.acceptValue(newClusterName)
        })
    }

    it('prompts for new cluster name, modifies cluster, shows success, and refreshes parent node', async function () {
        // arrange
        const stub = sinon.stub().resolves({
            DBClusterIdentifier: clusterName,
        })
        docdb.modifyCluster = stub
        setupWizard()

        // act
        await renameCluster(node)

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Updated cluster: test-cluster/)

        const expectedArgs = {
            DBClusterIdentifier: clusterName,
            NewDBClusterIdentifier: newClusterName,
            ApplyImmediately: true,
        }

        assert(stub.calledOnceWithExactly(expectedArgs))
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node.parent)

        assertTelemetry('docdb_renameCluster', {
            result: 'Succeeded',
        })
    })

    it('does nothing when prompt is cancelled', async function () {
        // arrange
        const stub = sinon.stub()
        docdb.modifyCluster = stub
        getTestWindow().onDidShowInputBox((input) => input.hide())

        // act
        await assert.rejects(renameCluster(node))

        // assert
        assert(stub.notCalled)

        assertTelemetry('docdb_renameCluster', {
            result: 'Cancelled',
        })
    })

    it('shows a warning when the cluster is not available', async function () {
        // arrange
        cluster.Status = 'stopped'
        const stub = sinon.stub()
        docdb.modifyCluster = stub
        setupWizard()

        // act
        await assert.rejects(renameCluster(node))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertMessage(/Cluster must be running/)

        assertTelemetry('docdb_renameCluster', {
            result: 'Cancelled',
        })
    })

    it('shows an error when cluster creation fails', async function () {
        // arrange
        const stub = sinon.stub().rejects()
        docdb.modifyCluster = stub
        setupWizard()

        // act
        await assert.rejects(renameCluster(node))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to rename cluster: test-cluster/)

        assertTelemetry('docdb_renameCluster', {
            result: 'Failed',
        })
    })
})
