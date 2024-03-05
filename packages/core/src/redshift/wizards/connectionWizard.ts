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
import { ListSecretsResponse } from 'aws-sdk/clients/secretsmanager'
import { SecretsManagerClient } from '../../shared/clients/secretsManagerClient'
import { redshiftHelpUrl } from '../../shared/constants'

export class RedshiftNodeConnectionWizard extends Wizard<ConnectionParams> {
    public constructor(node: RedshiftWarehouseNode) {
        super({
            initState: {
                warehouseIdentifier: node.name,
                warehouseType: node.warehouseType,
            },
        })
        this.form.connectionType.bindPrompter(
            state => getConnectionTypePrompter(node.connectionParams?.connectionType, state?.warehouseType),
            {
                relativeOrder: 1,
            }
        )

        this.form.database.bindPrompter(getDatabasePrompter, {
            relativeOrder: 2,
        })
        this.form.username.bindPrompter(getUsernamePrompter, {
            showWhen: state =>
                (state.database !== undefined && state.connectionType === ConnectionType.TempCreds) ||
                state.connectionType === ConnectionType.DatabaseUser,
            relativeOrder: 3,
        })
        this.form.password.bindPrompter(getPasswordPrompter, {
            showWhen: state => state.username !== undefined && state.connectionType === ConnectionType.DatabaseUser,
            relativeOrder: 4,
        })

        this.form.secret.bindPrompter(state => getSecretPrompter(node.redshiftClient.regionCode), {
            showWhen: state => state.database !== undefined && state.connectionType === ConnectionType.SecretsManager,
            relativeOrder: 4,
        })
    }
}

export class NotebookConnectionWizard extends Wizard<ConnectionParams> {
    static readonly SERVERLESSPREFIX = 'Serverless:'
    public constructor(
        regionProvider: RegionProvider,
        region?: Region | undefined,
        warehouseIdentifier?: string | undefined,
        warehouseType?: RedshiftWarehouseType,
        connectionType?: ConnectionType | undefined,
        database?: string | undefined,
        username?: string | undefined,
        secret?: string | undefined
    ) {
        super({
            initState: {
                connectionType: connectionType,
                database: database,
                username: username,
                warehouseIdentifier: warehouseIdentifier,
                region: region,
                warehouseType: warehouseType,
                secret: secret,
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
            if (!state.warehouseType && state.warehouseIdentifier) {
                if (state.warehouseIdentifier?.startsWith(NotebookConnectionWizard.SERVERLESSPREFIX)) {
                    state.warehouseType = RedshiftWarehouseType.SERVERLESS
                    state.warehouseIdentifier = state.warehouseIdentifier.replace(
                        NotebookConnectionWizard.SERVERLESSPREFIX,
                        ''
                    )
                    return RedshiftWarehouseType.SERVERLESS
                } else {
                    state.warehouseType = RedshiftWarehouseType.PROVISIONED
                    return RedshiftWarehouseType.PROVISIONED
                }
            }
        })
        this.form.connectionType.bindPrompter(state => getConnectionTypePrompter(undefined, state?.warehouseType), {
            relativeOrder: 3,
        })

        this.form.database.bindPrompter(getDatabasePrompter, { relativeOrder: 4 })
        this.form.username.bindPrompter(getUsernamePrompter, {
            showWhen: state =>
                (state.database !== undefined && state.connectionType === ConnectionType.TempCreds) ||
                state.connectionType === ConnectionType.DatabaseUser,
            relativeOrder: 5,
        })
        this.form.password.bindPrompter(getPasswordPrompter, {
            showWhen: state => state.username !== undefined && state.connectionType === ConnectionType.DatabaseUser,
            relativeOrder: 6,
        })

        this.form.secret.bindPrompter(state => getSecretPrompter(state.region!.id), {
            showWhen: state => state.database !== undefined && state.connectionType === ConnectionType.SecretsManager,
            relativeOrder: 5,
        })
    }
}

function getUsernamePrompter(): Prompter<string> {
    return createInputBox({
        value: '',
        title: localize('AWS.redshift.username', 'Enter the username you want to use to connect to the database'),
        buttons: createCommonButtons(redshiftHelpUrl),
        placeholder: 'Enter username',
        validateInput: value => {
            return value.trim() ? undefined : localize('AWS.redshift.usernameValidation', 'Username cannot be empty')
        },
    })
}

function getPasswordPrompter(): Prompter<string> {
    return createInputBox({
        value: '',
        title: localize('AWS.redshift.password', 'Enter password'),
        buttons: createCommonButtons(redshiftHelpUrl),
        placeholder: 'Enter password',
        validateInput: value => {
            return value.trim() ? undefined : localize('AWS.redshift.passwordValidation', 'Password cannot be empty')
        },
        password: true,
    })
}

function getDatabasePrompter(): Prompter<string> {
    return createInputBox({
        value: '',
        title: localize('AWS.redshift.database', 'Enter the name of the database you want to connect to'),
        buttons: createCommonButtons(redshiftHelpUrl),
        placeholder: 'Enter database name',
        validateInput: value => {
            return value.trim() ? undefined : localize('AWS.redshift.databaseValidation', 'Database cannot be empty')
        },
    })
}

function createSelectConnectionQuickPick(items: DataQuickPickItem<ConnectionType>[]): Prompter<ConnectionType> {
    return createQuickPick(items, {
        title: localize('AWS.redshift.connectionType', 'Select Connection Type'),
        buttons: createCommonButtons(redshiftHelpUrl),
        placeholder: 'Select Connection Type',
    })
}

function getConnectionTypePrompter(
    existingConnectionType: ConnectionType | undefined,
    warehouseType?: RedshiftWarehouseType
): Prompter<ConnectionType> {
    const items: DataQuickPickItem<ConnectionType>[] = Object.values(ConnectionType).map(type => ({
        label: type,
        data: type,
    }))
    if (existingConnectionType) {
        const updatedItems = items.map(item => {
            if (item.data === existingConnectionType) {
                return {
                    ...item,
                    label: `${existingConnectionType} - current`,
                }
            }
            return item
        })
        const selectedUpdatedItems =
            warehouseType === RedshiftWarehouseType.SERVERLESS ? [updatedItems[0], updatedItems[1]] : updatedItems
        return createSelectConnectionQuickPick(selectedUpdatedItems)
    } else {
        // Determine which items to use based on warehouseType
        const selectedItems = warehouseType === RedshiftWarehouseType.SERVERLESS ? [items[0], items[1]] : items
        return createSelectConnectionQuickPick(selectedItems)
    }
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
                            label: `${NotebookConnectionWizard.SERVERLESSPREFIX} ${
                                workgroup.workgroupName ?? 'UnknownServerlessWorkgroup'
                            }`,
                            data: `${NotebookConnectionWizard.SERVERLESSPREFIX}${
                                workgroup.workgroupName ?? 'UnknownServerlessWorkgroup'
                            }`,
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
        buttons: createCommonButtons(redshiftHelpUrl),
        placeholder: 'Choose a warehouse to connect to',
    })
}

function getSecretPrompter(region: string): QuickPickPrompter<string> {
    const secretsManagerClient = new SecretsManagerClient(region)
    return createQuickPick(fetchSecretList(secretsManagerClient), {
        title: localize('AWS.redshift.chooseSecretPrompt', 'Choose a secret'),
        buttons: createCommonButtons(redshiftHelpUrl),
        placeholder: 'Choose a secret',
    })
}

async function* fetchSecretList(secretsManagerClient: SecretsManagerClient) {
    const secretFilter = 'Redshift'
    const listSecretsResponse: ListSecretsResponse = await secretsManagerClient.listSecrets(secretFilter)
    if (listSecretsResponse.SecretList) {
        for await (const secret of listSecretsResponse.SecretList) {
            yield [
                {
                    label: secret.Name || 'UnknownSecret',
                    data: secret.ARN || 'UnknownSecret',
                },
            ]
        }
    }
}
