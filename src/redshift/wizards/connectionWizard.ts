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
import { DefaultRedshiftClient, SecretsManagerClient } from '../../shared/clients/redshiftClient'
import { Region } from '../../shared/regions/endpoints'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { ClustersMessage } from 'aws-sdk/clients/redshift'
import { Prompter } from '../../shared/ui/prompter'
import { ListSecretsResponse } from 'aws-sdk/clients/secretsmanager'

export class RedshiftNodeConnectionWizard extends Wizard<ConnectionParams> {
    public constructor(
        node: RedshiftWarehouseNode,
        connectionType?: ConnectionType,
        database?: string,
        username?: string,
        password?: string,
        secret?: string
    ) {
        super({
            initState: {
                connectionType: connectionType ? connectionType : undefined,
                database: database ? database : undefined,
                username: username ? username : undefined,
                password: password ? password : undefined,
                secret: secret ? secret : undefined,
                warehouseIdentifier: node.name,
                warehouseType: node.warehouseType,
            },
        })
        this.form.connectionType.bindPrompter(
            state => {
                if (state?.warehouseType === 1) {
                    return getConnectionTypePrompterServerless()
                } else {
                    return getConnectionTypePrompter()
                }
            },
            {
                relativeOrder: 1,
            }
        )

        this.form.database.bindPrompter(getDatabasePrompter, {
            relativeOrder: 3,
        })
        this.form.username.bindPrompter(getUsernamePrompter, {
            showWhen: state =>
                (state.database !== undefined && state.connectionType === ConnectionType.TempCreds) ||
                state.connectionType === ConnectionType.DatabaseUser,
            relativeOrder: 2,
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

        this.form.connectionType.bindPrompter(
            state => {
                if (state.warehouseIdentifier?.startsWith('serverless'.toLowerCase())) {
                    return getConnectionTypePrompterServerless()
                } else {
                    return getConnectionTypePrompter()
                }
            },
            {
                relativeOrder: 3,
            }
        )

        this.form.database.bindPrompter(getDatabasePrompter, { relativeOrder: 4 })
        this.form.username.bindPrompter(getUsernamePrompter, {
            showWhen: state =>
                (state.database !== undefined && state.connectionType === ConnectionType.TempCreds) ||
                state.connectionType === ConnectionType.DatabaseUser,
            relativeOrder: 5,
        })
        this.form.password.bindPrompter(getPasswordPrompter, {
            showWhen: state => state.username !== undefined && state.connectionType === ConnectionType.DatabaseUser,
            relativeOrder: 5,
        })

        this.form.secret.bindPrompter(state => getSecretPrompter(state.region!.id), {
            showWhen: state => state.database !== undefined && state.connectionType === ConnectionType.SecretsManager,
            relativeOrder: 6,
        })
    }
}

function getUsernamePrompter(): Prompter<string> {
    return createInputBox({
        value: '',
        title: localize('AWS.redshift.username', 'Enter username'),
        buttons: createCommonButtons(),
        placeholder: 'Enter Username',
        validateInput: value => {
            return value.trim() ? undefined : localize('AWS.redshift.usernameValidation', 'Username cannot be empty')
        },
    })
}

function getPasswordPrompter(): Prompter<string> {
    return createInputBox({
        value: '',
        title: localize('AWS.redshift.password', 'Enter password'),
        buttons: createCommonButtons(),
        placeholder: 'Enter Password',
        validateInput: value => {
            return value.trim() ? undefined : localize('AWS.redshift.passwordValidation', 'Password cannot be empty')
        },
        password: true,
    })
}

function getDatabasePrompter(): Prompter<string> {
    return createInputBox({
        value: '',
        title: localize('AWS.redshift.database', 'Enter a database'),
        buttons: createCommonButtons(),
        placeholder: 'Enter Database Name',
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
        placeholder: 'Select Connection Type',
    })
}
function getConnectionTypePrompterServerless(): Prompter<ConnectionType> {
    const items: DataQuickPickItem<ConnectionType>[] = Object.values(ConnectionType).map(type => ({
        label: type,
        data: type,
    }))
    return createQuickPick([items[0], items[1]], {
        title: localize('AWS.redshift.connectionType', 'Select Connection Type'),
        buttons: createCommonButtons(),
        placeholder: 'Select Connection Type',
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
        buttons: createCommonButtons(),
        placeholder: 'Choose a warehouse to connect to',
    })
}

function getSecretPrompter(region: string): QuickPickPrompter<string> {
    const secretsManagerClient = new SecretsManagerClient(region)
    return createQuickPick(fetchSecretList(secretsManagerClient), {
        title: localize('AWS.redshift.chooseSecretPrompt', 'Choose a secret'),
        buttons: createCommonButtons(),
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
