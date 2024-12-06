/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { getTestWindow } from '../../shared/vscode/window'
import { DocumentDBClient, DBInstance } from '../../../shared/clients/docdbClient'
import { DBClusterNode } from '../../../docdb/explorer/dbClusterNode'
import { DBInstanceNode } from '../../../docdb/explorer/dbInstanceNode'
import { DocumentDBNode } from '../../../docdb/explorer/docdbNode'
import { rebootInstance } from '../../../docdb/commands/rebootInstance'
import { assertTelemetry } from '../../testUtil'

describe('rebootInstanceCommand', function () {
    const instanceName = 'test-instance'
    let docdb: DocumentDBClient
    let instance: DBInstance
    let node: DBInstanceNode
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        getTestWindow().onDidShowMessage((m) => m.items.find((i) => i.title === 'Yes')?.select())

        docdb = { regionCode: 'us-east-1' } as DocumentDBClient
        const clusterName = 'docdb-1234'
        const cluster = { DBClusterIdentifier: clusterName, Status: 'available' }
        const parentNode = new DBClusterNode(new DocumentDBNode(docdb), cluster, docdb)
        instance = {
            DBInstanceIdentifier: instanceName,
            DBClusterIdentifier: clusterName,
            DBInstanceStatus: 'available',
        }
        node = new DBInstanceNode(parentNode, instance)
    })

    afterEach(function () {
        sandbox.restore()
        getTestWindow().dispose()
    })

    it('reboots instance, and refreshes parent node', async function () {
        // arrange
        const stub = sinon.stub().resolves(true)
        docdb.rebootInstance = stub

        // act
        await rebootInstance(node)

        // assert
        getTestWindow().getFirstMessage().assertWarn('Are you sure you want to reboot instance test-instance?')

        getTestWindow()
            .getSecondMessage()
            .assertInfo(/Rebooting instance: test-instance/)

        assert(stub.calledOnceWithExactly(instanceName))
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node.parent)

        assertTelemetry('docdb_rebootInstance', {
            result: 'Succeeded',
        })
    })

    it('shows an error when api returns failure', async function () {
        // arrange
        const stub = sinon.stub().rejects()
        docdb.rebootInstance = stub

        // act
        await assert.rejects(rebootInstance(node))

        // assert
        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to reboot instance: test-instance/)

        assertTelemetry('docdb_rebootInstance', {
            result: 'Failed',
        })
    })

    it('shows a warning when the instance is not available', async function () {
        // arrange
        instance.DBInstanceStatus = 'stopped'
        const stub = sinon.stub()
        docdb.rebootInstance = stub

        // act
        await assert.rejects(rebootInstance(node))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertMessage(/Instance must be running/)

        assertTelemetry('docdb_rebootInstance', {
            result: 'Cancelled',
        })
    })
})
