/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IAM } from 'aws-sdk'
import { IamClient } from '../../clients/iamClient'
import { createBackButton, createExitButton, createHelpButton, createPlusButton, createRefreshButton } from '../buttons'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../pickerPrompter'
import * as nls from 'vscode-nls'
import * as vscode from 'vscode'
import { getLogger } from '../../logger/logger'
import { showViewLogsMessage } from '../../utilities/messages'
import { WIZARD_BACK } from '../../wizards/wizard'
import { partialCached } from '../../utilities/collectionUtils'

const localize = nls.loadMessageBundle()

const createRoleTooltip = localize('AWS.generic.createRole', 'Create Role...')

interface RolePrompterOptions {
    title?: string
    helpUri?: vscode.Uri
    filter?: (role: IAM.Role) => boolean
    createRole?: () => Promise<IAM.Role>
    noRoleDetail?: string
}

function loadRoles(client: IamClient, filter: RolePrompterOptions['filter']): Promise<DataQuickPickItem<IAM.Role>[]> {
    return client.listRoles().then(resp => {
        const roles = resp.Roles.filter(filter ?? (() => true)).map(role => ({
            label: role.RoleName,
            data: role,
        }))

        return roles
    })
}

export function createRolePrompter(client: IamClient, options: RolePrompterOptions = {}): QuickPickPrompter<IAM.Role> {
    const refreshButton = createRefreshButton()
    const buttons = [refreshButton]

    const placeholderItem: DataQuickPickItem<IAM.Role> = {
        label: localize('AWS.rolePrompter.noRoles.title', 'No valid roles found'),
        data: WIZARD_BACK,
        detail: options.noRoleDetail,
    }

    if (options.createRole !== undefined) {
        const createRoleButton = createPlusButton(createRoleTooltip)

        const makeRole = () => {
            const items = options.createRole!()
                .then(role => [{ label: role.RoleName, data: role }])
                .catch(err => {
                    getLogger().error('role prompter: Failed to create new role: %O', err)
                    showViewLogsMessage(localize('AWS.rolePrompter.createRole.failed', 'Failed to create new role'))
                    return []
                })
            prompter.appendItems(items)
        }

        placeholderItem.detail = localize('AWS.rolePrompter.noRoles.detail', 'Create a new role')
        placeholderItem.invalidSelection = true
        placeholderItem.onClick = makeRole
        createRoleButton!.onClick = makeRole
        buttons.push(createRoleButton)
    }

    buttons.push(createHelpButton(options.helpUri), createExitButton(), createBackButton())

    // Note: prompter gets hoisted
    const prompter = createQuickPick([], {
        buttons,
        title: options.title,
        itemLoader: partialCached(() => loadRoles(client, options.filter)),
        noItemsFoundItem: placeholderItem,
        placeholder: localize('AWS.rolePrompter.placeholder', 'Select or enter a role ARN'),
        filterBoxInputSettings: {
            label: localize('AWS.rolePrompter.enterArn', 'Enter Role ARN'),
            transform: resp => ({ Arn: resp, RoleName: 'Unknown' } as IAM.Role), // callers would not expect this to be incomplete
            // validator
        },
    })

    refreshButton.onClick = () => {
        prompter.refreshItems()
    }

    return prompter
}
