/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { deferredCached } from '../../utilities/collectionUtils'
import { parse } from '@aws-sdk/util-arn-parser'

const localize = nls.loadMessageBundle()

const createRoleTooltip = localize('AWS.generic.createRole', 'Create Role...')

interface RolePrompterOptions {
    title?: string
    helpUri?: vscode.Uri
    filter?: (role: IAM.Role) => boolean
    createRole?: () => Promise<IAM.Role>
    noRoleDetail?: string
}

async function* loadRoles(
    client: IamClient,
    filter?: RolePrompterOptions['filter']
): AsyncIterable<DataQuickPickItem<IAM.Role>> {
    for await (const role of client.getRoles()) {
        if (!filter || filter(role)) {
            yield { data: role, label: role.RoleName }
        }
    }
}

export function createRolePrompter(client: IamClient, options: RolePrompterOptions = {}): QuickPickPrompter<IAM.Role> {
    const placeholderItem: DataQuickPickItem<IAM.Role> = {
        label: localize('AWS.rolePrompter.noRoles.title', 'No valid roles found'),
        data: WIZARD_BACK,
        detail: options.noRoleDetail,
    }

    const prompter = createQuickPick(
        deferredCached(() => loadRoles(client, options.filter)),
        {
            buttons: createCommonButtons(options.helpUri),
            title: options.title,
            noItemsFoundItem: placeholderItem,
            placeholder: localize('AWS.rolePrompter.placeholder', 'Select or enter a role ARN'),
            filterBoxInput: {
                // TODO: need to define some 'base' interfaces for prompt options as well as logic to merge with defaults
                label: localize('AWS.rolePrompter.enterArn', 'Enter Role ARN'),
                transform: resp => ({ Arn: resp, RoleName: 'Unknown' } as IAM.Role), // callers would not expect this to be incomplete
                validator: value => {
                    try {
                        parse(value)
                    } catch (err) {
                        return `Invalid: ${(err as any).message}`
                    }
                },
            },
        }
    )

    const createRole = options.createRole
    if (createRole !== undefined) {
        const createRoleItem = async () => {
            try {
                const role = await createRole()
                prompter.clearCache()
                return [{ label: role.RoleName, data: role }]
            } catch (err) {
                getLogger().error('role prompter: Failed to create new role: %O', err)
                showViewLogsMessage(localize('AWS.rolePrompter.createRole.failed', 'Failed to create new role'))
                return []
            }
        }

        prompter.addButton(createPlusButton(createRoleTooltip), function () {
            this.loadItems(createRoleItem())
        })

        placeholderItem.detail = localize('AWS.rolePrompter.noRoles.detail', 'Create a new role')
        placeholderItem.invalidSelection = true
        placeholderItem.onClick = () => prompter.loadItems(createRoleItem())
    }

    prompter.addButton(createRefreshButton(), function () {
        this.refreshItems()
    })

    return prompter
}
