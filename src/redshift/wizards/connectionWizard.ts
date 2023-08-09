/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Wizard } from '../../shared/wizards/wizard'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { ConnectionParams, ConnectionType, RedshiftWarehouseType } from '../models/models'
import { RedshiftWarehouseNode } from '../explorer/redshiftWarehouseNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { DefaultRedshiftClient } from '../../shared/clients/redshiftClient'
import { Region } from '../../shared/regions/endpoints'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { ClustersMessage } from 'aws-sdk/clients/redshift'
import { Prompter } from '../../shared/ui/prompter'

export class RedshiftNodeConnectionWizard extends Wizard<ConnectionParams> {
    public constructor(
        node: RedshiftWarehouseNode,
        connectionType?: ConnectionType,
        database?: string,
        username?: string,
        password?: string
    ) {
        super({
            initState: {
                connectionType: connectionType ? connectionType : undefined,
                database: database ? database : undefined,
                username: username ? username : undefined,
                password: password ? password : undefined,
                warehouseIdentifier: node.name,
                warehouseType: node.warehouseType,
            },
        })
        this.form.connectionType.bindPrompter(getConnectionTypePrompter, {
            relativeOrder: 1,
        })
        this.form.database.bindPrompter(getDatabasePrompter, {
            relativeOrder: 2,
        })
        this.form.username.bindPrompter(getUsernamePrompter, {
            showWhen: state =>
                state.database !== undefined &&
                state.connectionType === ConnectionType.DatabaseUser &&
                node.warehouseType === RedshiftWarehouseType.PROVISIONED,
            relativeOrder: 3,
        })
    }
}

export class NotebookConnectionWizard extends Wizard<ConnectionParams> {
    public constructor(
        regionProvider: RegionProvider,
        region?: Region | undefined,
        warehouseIdentifier?: string | undefined,
        warehouseType?: RedshiftWarehouseType,
        connectionType?: ConnectionType | undefined,
        database?: string | undefined,
        username?: string | undefined
    ) {
        super({
            initState: {
                connectionType: connectionType,
                database: database,
                username: username,
                warehouseIdentifier: warehouseIdentifier,
                region: region,
                warehouseType: warehouseType,
            },
        })

        this.form.region.bindPrompter(
            () => {
                const regions = regionProvider
                    .getRegions()
                    .filter(r => regionProvider.isServiceInRegion('redshift', r.id))
                return createRegionPrompter(regions)
            },
            { relativeOrder: 1 }
        )

        this.form.warehouseIdentifier.bindPrompter(state => getWarehouseIdentifierPrompter(state.region!.id), {
            relativeOrder: 2,
        })

        this.form.warehouseType.setDefault(state => {
            return state.warehouseIdentifier?.toLowerCase().startsWith('serverless')
                ? RedshiftWarehouseType.SERVERLESS
                : RedshiftWarehouseType.PROVISIONED
        })

        this.form.connectionType.bindPrompter(getConnectionTypePrompter, { relativeOrder: 3 })
        this.form.database.bindPrompter(getDatabasePrompter, { relativeOrder: 4 })
        this.form.username.bindPrompter(getUsernamePrompter, {
            showWhen: state =>
                state.database !== undefined &&
                state.connectionType === ConnectionType.DatabaseUser &&
                state.warehouseType === RedshiftWarehouseType.PROVISIONED,
            relativeOrder: 5,
        })
    }
}

function getUsernamePrompter(): Prompter<string> {
    return createInputBox({
        value: '',
        title: localize('AWS.redshift.username', 'Enter a username'),
        buttons: createCommonButtons(),
        validateInput: value => {
            return value.trim() ? undefined : localize('AWS.redshift.usernameValidation', 'Username cannot be empty')
        },
    })
}

function getDatabasePrompter(): Prompter<string> {
    return createInputBox({
        value: '',
        title: localize('AWS.redshift.database', 'Enter a database'),
        buttons: createCommonButtons(),
        validateInput: value => {
            return value.trim() ? undefined : localize('AWS.redshift.databaseValidation', 'Database cannot be empty')
        },
    })
}

function getConnectionTypePrompter(): Prompter<ConnectionType> {
    const items: DataQuickPickItem<ConnectionType>[] = Object.values(ConnectionType).map(type => ({
        label: type,
        data: type,
    }))
    return createQuickPick(items, {
        title: localize('AWS.redshift.connectionType', 'Select Connection Type'),
        buttons: createCommonButtons(),
    })
}

async function* fetchWarehouses(redshiftClient: DefaultRedshiftClient) {
    let serverlessToken: string | undefined
    let provisionedToken: string | undefined
    let hasMoreServerless = true
    let hasMoreProvisioned = true
    while (hasMoreProvisioned || hasMoreServerless) {
        if (hasMoreProvisioned) {
            const provisionedResponse: ClustersMessage = await redshiftClient.describeProvisionedClusters(
                provisionedToken
            )
            provisionedToken = provisionedResponse.Marker
            hasMoreProvisioned = provisionedToken !== undefined
            if (provisionedResponse.Clusters) {
                for await (const cluster of provisionedResponse.Clusters) {
                    yield [
                        {
                            label: cluster.ClusterIdentifier || 'UnknownProvisionedCluster',
                            data: cluster.ClusterIdentifier || 'UnknownProvisionedCluster',
                        },
                    ]
                }
            }
        }
        if (hasMoreServerless) {
            const serverlessResponse = await redshiftClient.listServerlessWorkgroups(serverlessToken)
            serverlessToken = serverlessResponse.nextToken
            hasMoreServerless = serverlessToken !== undefined
            if (serverlessResponse.workgroups) {
                for await (const workgroup of serverlessResponse.workgroups) {
                    yield [
                        {
                            label: workgroup.workgroupName || 'UnknownServerlessWorkgroup',
                            data: workgroup.workgroupName || 'UnknownServerlessWorkgroup',
                        },
                    ]
                }
            }
        }
    }
}

function getWarehouseIdentifierPrompter(region: string): QuickPickPrompter<string> {
    const redshiftClient = new DefaultRedshiftClient(region)

    return createQuickPick(fetchWarehouses(redshiftClient), {
        title: localize('AWS.redshift.chooseAWarehousePrompt', 'Choose a warehouse to connect to'),
        buttons: createCommonButtons(),
    })
}
