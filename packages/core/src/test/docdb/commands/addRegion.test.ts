/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { assertTelemetry } from '../../testUtil'
import { getTestWindow } from '../../shared/vscode/window'
import { globals } from '../../../shared'
import { DBStorageType, DefaultDocumentDBClient, DocumentDBClient } from '../../../shared/clients/docdbClient'
import { addRegion } from '../../../docdb/commands/addRegion'
import { DBClusterNode } from '../../../docdb/explorer/dbClusterNode'
import { DBGlobalClusterNode } from '../../../docdb/explorer/dbGlobalClusterNode'
import { DocumentDBNode } from '../../../docdb/explorer/docdbNode'
import { GlobalCluster } from '@aws-sdk/client-docdb'

describe('addRegionCommand', function () {
    const globalClusterName = 'docdb-global'
    const clusterName = 'docdb-1234'
    const cluster = {
        DBClusterArn: 'arn:docdb-1234',
        Status: 'available',
        DBClusterMembers: [{ IsClusterWriter: true }],
    }
    let docdb: DocumentDBClient
    let testNode: DBClusterNode | DBGlobalClusterNode
    let sinonSandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sinonSandbox = sinon.createSandbox()
        spyExecuteCommand = sinonSandbox.spy(vscode.commands, 'executeCommand')
        sinonSandbox.stub(globals.regionProvider, 'isServiceInRegion').returns(true)
        sinonSandbox.stub(globals.regionProvider, 'getRegions').returns([
            { id: 'us-test-1', name: 'Test Region 1' },
            { id: 'us-test-2', name: 'Test Region 2' },
        ])

        docdb = { regionCode: 'us-test-1' } as DocumentDBClient
        docdb.listEngineVersions = sinon.stub().resolves([{ EngineVersion: 'test-version' }])
        docdb.listInstanceClassOptions = sinon
            .stub()
            .resolves([{ DBInstanceClass: 'db.r5.large', StorageType: DBStorageType.Standard }])

        sinonSandbox.stub(DefaultDocumentDBClient, 'create').returns(docdb)

        cluster.DBClusterMembers = [{ IsClusterWriter: true }]
        const parentNode = new DocumentDBNode(docdb)

        testNode = new DBClusterNode(parentNode, cluster, docdb)
    })
    afterEach(function () {
        sinonSandbox.restore()
        getTestWindow().dispose()
    })
    function setupWizard() {
        getTestWindow().onDidShowInputBox((input) => {
            let val: string

            if (input.prompt?.includes('global')) {
                val = globalClusterName
            } else if (input.prompt?.includes('cluster name')) {
                val = clusterName
            } else {
                val = ''
            }
            input.acceptValue(val)
        })

        getTestWindow().onDidShowQuickPick(async (testQuickPicker) => {
            await testQuickPicker.untilReady()
            testQuickPicker.acceptItem(testQuickPicker.items[0])
        })
    }

    it('prompts for new region and cluster params, creates global cluster, creates secondary cluster, and refreshes node', async function () {
        // arrange
        const createGlobalClusterStub = sinon.stub().resolves({
            GlobalClusterIdentifier: globalClusterName,
        })
        const createClusterStub = sinon.stub().resolves({
            DBClusterIdentifier: clusterName,
        })
        const createInstanceSinonStub = sinon.stub().resolves()
        docdb.createGlobalCluster = createGlobalClusterStub
        docdb.createCluster = createClusterStub
        docdb.createInstance = createInstanceSinonStub

        setupWizard()

        // act
        await addRegion(testNode)

        // assert
        getTestWindow().getFirstMessage().assertInfo('Region added')

        assert(
            createGlobalClusterStub.calledOnceWithExactly({
                GlobalClusterIdentifier: globalClusterName,
                SourceDBClusterIdentifier: cluster.DBClusterArn,
            })
        )

        assert(
            createClusterStub.calledOnceWith(
                sinon.match({
                    DBClusterIdentifier: clusterName,
                    GlobalClusterIdentifier: globalClusterName,
                })
            )
        )
        assert(
            createInstanceSinonStub.calledOnceWith(
                sinon.match({
                    Engine: 'docdb',
                    DBClusterIdentifier: clusterName,
                    DBInstanceIdentifier: clusterName,
                    DBInstanceClass: 'db.r5.large',
                })
            )
        )

        sinonSandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', testNode.parent)

        assertTelemetry('docdb_addRegion', { result: 'Succeeded' })
    })

    it('creates a secondary cluster, and refreshes node when adding to a global cluster', async function () {
        // arrange
        const createGlobalClusterStub = sinon.stub().resolves({
            GlobalClusterIdentifier: globalClusterName,
        })
        const createClusterSinonStub = sinon.stub().resolves({
            DBClusterIdentifier: clusterName,
        })
        const createInstanceStub = sinon.stub().resolves()
        docdb.createGlobalCluster = createGlobalClusterStub
        docdb.createCluster = createClusterSinonStub
        docdb.createInstance = createInstanceStub
        setupWizard()

        const globalCluster: GlobalCluster = {
            GlobalClusterIdentifier: globalClusterName,
            GlobalClusterMembers: [],
            Status: 'available',
        }
        testNode = new DBGlobalClusterNode(new DocumentDBNode(docdb), globalCluster, new Map(), docdb)

        // act
        await addRegion(testNode)

        // assert
        getTestWindow().getFirstMessage().assertInfo('Region added')

        assert(createGlobalClusterStub.notCalled)

        assert(
            createClusterSinonStub.calledOnceWith(
                sinon.match({
                    DBClusterIdentifier: clusterName,
                    GlobalClusterIdentifier: globalClusterName,
                })
            )
        )

        assert(
            createInstanceStub.calledOnceWith(
                sinon.match({
                    Engine: 'docdb',
                    DBClusterIdentifier: clusterName,
                    DBInstanceIdentifier: clusterName,
                    DBInstanceClass: 'db.r5.large',
                })
            )
        )
        sinonSandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', testNode)

        assertTelemetry('docdb_addRegion', { result: 'Succeeded' })
    })

    it('does nothing when prompt is cancelled', async function () {
        // arrange
        const stub = sinon.stub()
        docdb.createGlobalCluster = stub
        getTestWindow().onDidShowQuickPick((input) => input.hide())

        // act
        await assert.rejects(addRegion(testNode))

        // assert
        assert(stub.notCalled)

        assertTelemetry('docdb_addRegion', { result: 'Cancelled' })
    })

    it('shows an error when cluster creation fails', async function () {
        // arrange
        docdb.createGlobalCluster = sinon.stub().resolves({
            GlobalClusterIdentifier: globalClusterName,
        })
        docdb.createCluster = sinon.stub().rejects()
        setupWizard()

        // act
        await assert.rejects(addRegion(testNode))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create cluster: docdb-1234/)

        assertTelemetry('docdb_addRegion', { result: 'Failed' })
    })

    it('shows a warning when the cluster has no instances', async function () {
        // arrange
        const clusterNode = testNode as DBClusterNode
        clusterNode.cluster.DBClusterMembers = []
        setupWizard()

        // act
        await assert.rejects(addRegion(testNode))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertError(/Cluster must have at least one instance to add a region/)

        assertTelemetry('docdb_addRegion', { result: 'Cancelled' })
    })

    it('shows a warning when the cluster has an unsupported instance class', async function () {
        // arrange
        const clusterNode = testNode as DBClusterNode
        clusterNode.instances = [{ DBInstanceClass: 'db.t3.medium' }]
        setupWizard()

        // act
        await assert.rejects(addRegion(testNode))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertError(/Instance class db.t3.medium not supported/)

        assertTelemetry('docdb_addRegion', { result: 'Cancelled' })
    })
})
