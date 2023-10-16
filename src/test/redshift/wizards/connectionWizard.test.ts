/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RedshiftNode } from '../../../redshift/explorer/redshiftNode'
import { DefaultRedshiftClient } from '../../../shared/clients/redshiftClient'
import { createWizardTester } from '../../shared/wizards/wizardTestUtils'
import { RedshiftWarehouseType, ConnectionType } from '../../../redshift/models/models'
import { RedshiftWarehouseNode } from '../../../redshift/explorer/redshiftWarehouseNode'
import { AWSResourceNode } from '../../../shared/treeview/nodes/awsResourceNode'
import { NotebookConnectionWizard, RedshiftNodeConnectionWizard } from '../../../redshift/wizards/connectionWizard'
import { RegionProvider } from '../../../shared/regions/regionProvider'

describe('redshiftNodeConnectionWizard', async function () {
    let mockRedshiftClient: DefaultRedshiftClient
    let provisionedNode: RedshiftWarehouseNode
    let serverlessNode: RedshiftWarehouseNode
    const clusterName = 'testCluster'
    const workgroupName = 'testWorkgroup'
    const clusterArn = 'testClusterARN'
    const workgroupArn = 'testWorkgroupARN'

    beforeEach(function () {
        mockRedshiftClient = <DefaultRedshiftClient>{}
        const redshiftNode = new RedshiftNode(mockRedshiftClient)
        provisionedNode = new RedshiftWarehouseNode(
            redshiftNode,
            { arn: clusterArn, name: clusterName } as AWSResourceNode,
            RedshiftWarehouseType.PROVISIONED
        )
        serverlessNode = new RedshiftWarehouseNode(
            redshiftNode,
            { arn: workgroupArn, name: workgroupName } as AWSResourceNode,
            RedshiftWarehouseType.SERVERLESS
        )
    })

    it('shows all steps for provisionedNode and database username connection type', function () {
        const testWizard = createWizardTester(new RedshiftNodeConnectionWizard(provisionedNode))
        testWizard.connectionType.assertShowFirst()
        testWizard.connectionType.applyInput(ConnectionType.TempCreds)
        testWizard.database.assertShowFirst()
        testWizard.database.applyInput('testDB')
        testWizard.username.assertShowFirst()
    })

    it('shows only database as input for serverlessNode and database username connection type', function () {
        const testWizard = createWizardTester(new RedshiftNodeConnectionWizard(serverlessNode))
        testWizard.connectionType.assertShowFirst()
        testWizard.connectionType.applyInput(ConnectionType.TempCreds)
        testWizard.database.assertShowFirst()
        testWizard.username.assertDoesNotShow()
    })

    it('shows all steps for provisionedNode and secrets manager connection type', function () {
        const testWizard = createWizardTester(new RedshiftNodeConnectionWizard(provisionedNode))
        testWizard.connectionType.assertShowFirst()
        testWizard.connectionType.applyInput(ConnectionType.SecretsManager)
        testWizard.database.assertShowFirst()
        testWizard.database.applyInput('testDB')
        testWizard.secret.assertShowFirst()
        testWizard.secret.applyInput('SecretTest')
    })

    it('shows all steps for serverlessNode and secrets manager connection type', function () {
        const testWizard = createWizardTester(new RedshiftNodeConnectionWizard(serverlessNode))
        testWizard.connectionType.assertShowFirst()
        testWizard.connectionType.applyInput(ConnectionType.SecretsManager)
        testWizard.database.assertShowFirst()
        testWizard.database.applyInput('testDB')
        testWizard.secret.assertShowFirst()
        testWizard.secret.applyInput('SecretTest')
    })
})

describe('NotebookConnectionWizard', async () => {
    const mockRegionProvider: RegionProvider = <RegionProvider>{}

    it('shows all steps for database username connection type', function () {
        const testWizard = createWizardTester(new NotebookConnectionWizard(mockRegionProvider))
        testWizard.region.assertShowFirst()
        testWizard.region.applyInput({ id: 'US East - 1', name: 'us-east-1' })
        testWizard.warehouseIdentifier.assertShowFirst()
        testWizard.warehouseIdentifier.applyInput('testCluster')
        testWizard.connectionType.assertShowFirst()
        testWizard.connectionType.applyInput(ConnectionType.TempCreds)
        testWizard.database.assertShowFirst()
        testWizard.database.applyInput('testDB')
        testWizard.username.assertShowFirst()
        testWizard.username.applyInput('testUser')
        testWizard.warehouseType.assertDoesNotShow()
    })

    it('shows all steps for secrets manager connection type', function () {
        const testWizard = createWizardTester(new NotebookConnectionWizard(mockRegionProvider))
        testWizard.region.assertShowFirst()
        testWizard.region.applyInput({ id: 'US East - 1', name: 'us-east-1' })
        testWizard.warehouseIdentifier.assertShowFirst()
        testWizard.warehouseIdentifier.applyInput('testCluster')
        testWizard.connectionType.assertShowFirst()
        testWizard.connectionType.applyInput(ConnectionType.SecretsManager)
        testWizard.database.assertShowFirst()
        testWizard.database.applyInput('testDB')
        testWizard.secret.applyInput('SecretTest')
        testWizard.warehouseType.assertDoesNotShow()
    })
})
