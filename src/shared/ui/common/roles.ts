/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IAM } from 'aws-sdk'
import { IamClient } from '../../clients/iamClient'
import { createCommonButtons, createPlusButton, createRefreshButton } from '../buttons'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../pickerPrompter'
import * as nls from 'vscode-nls'
import * as vscode from 'vscode'
import { getLogger } from '../../logger/logger'
import { showViewLogsMessage } from '../../utilities/messages'
import { WIZARD_BACK } from '../../wizards/wizard'

const localize = nls.loadMessageBundle()

const createRoleTooltip = localize('AWS.generic.createRole', 'Create Role...')

interface RolePrompterOptions {
    readonly title?: string
    readonly helpUrl?: string | vscode.Uri
    readonly noRoleDetail?: string
    readonly roleFilter?: (role: IAM.Role) => boolean
    readonly createRole?: () => Promise<IAM.Role>
}

export function createRolePrompter(client: IamClient, options: RolePrompterOptions = {}): QuickPickPrompter<IAM.Role> {
    const placeholderItem: DataQuickPickItem<IAM.Role> = {
        label: localize('AWS.rolePrompter.noRoles.title', 'No valid roles found'),
        data: WIZARD_BACK,
        detail: options.noRoleDetail,
    }

    const loadItems = () => {
        const filterRoles = (roles: IAM.Role[]) => (options.roleFilter ? roles.filter(options.roleFilter) : roles)

        return client
            .getRoles()
            .map(filterRoles)
            .map(roles =>
                roles.map(r => ({
                    label: r.RoleName,
                    data: r,
                }))
            )
    }

    const buttons = [
        { ...createRefreshButton(), onClick: () => void prompter.clearAndLoadItems(loadItems()) },
        ...createCommonButtons(options.helpUrl),
    ]

    const prompter = createQuickPick(loadItems(), {
        buttons,
        title: options.title,
        noItemsFoundItem: placeholderItem,
        placeholder: localize('AWS.rolePrompter.placeholder', 'Select an IAM role'),
    })

    return addCreateRoleButton(prompter, options.createRole)
}

function addCreateRoleButton(
    prompter: QuickPickPrompter<IAM.Role>,
    createRole: RolePrompterOptions['createRole']
): typeof prompter {
    if (!createRole) {
        return prompter
    }

    const makeRole = () => {
        const items = createRole()
            .then(role => [{ label: role.RoleName, data: role }])
            .catch(err => {
                getLogger().error('role prompter: Failed to create new role: %s', err)
                void showViewLogsMessage(localize('AWS.rolePrompter.createRole.failed', 'Failed to create new role'))
                return []
            })

        return prompter.loadItems(items)
    }

    prompter.quickPick.buttons = [
        {
            ...createPlusButton(createRoleTooltip),
            onClick: makeRole,
        },
        ...prompter.quickPick.buttons,
    ]

    return prompter
}
