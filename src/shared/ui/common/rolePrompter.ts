/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IAM } from 'aws-sdk'
import { IamClient } from '../../clients/iamClient'
import {
    createBackButton,
    createExitButton,
    createHelpButton,
    createPlusButton,
    createRefreshButton,
    PrompterButtons,
    QuickInputButton,
} from '../buttons'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../pickerPrompter'
import { CachedFunction, Prompter, CachedPrompter } from '../prompter'
import * as nls from 'vscode-nls'
import * as vscode from 'vscode'
import { getLogger } from '../../logger/logger'
import { showViewLogsMessage } from '../../utilities/messages'

const localize = nls.loadMessageBundle()

const createRoleTooltip = localize('AWS.generic.createRole', 'Create Role...')

interface RolePrompterOptions {
    title?: string
    helpUri?: vscode.Uri
    filter?: (role: IAM.Role) => boolean
    createRole?: () => Promise<IAM.Role>
}

export class RolePrompter extends CachedPrompter<IAM.Role> {
    private refreshButton: QuickInputButton<void>
    private createRoleButton?: QuickInputButton<void>
    private buttons: PrompterButtons<IAM.Role>

    public constructor(private readonly client: IamClient, private readonly options: RolePrompterOptions = {}) {
        super()

        this.refreshButton = createRefreshButton()
        const buttons = [this.refreshButton]

        if (this.options.createRole !== undefined) {
            this.createRoleButton = createPlusButton(createRoleTooltip)
            buttons.push(this.createRoleButton)
        }

        buttons.push(createHelpButton(this.options.helpUri), createExitButton(), createBackButton())

        this.buttons = buttons
    }

    protected load(): Promise<DataQuickPickItem<IAM.Role>[]> {
        return this.client.listRoles().then(resp => {
            const roles = resp.Roles.filter(this.options.filter ?? (() => true)).map(role => ({
                label: role.RoleName,
                data: role,
            }))

            return roles
        })
    }

    private addCreateRoleCallback(
        prompter: QuickPickPrompter<IAM.Role>,
        loader: CachedFunction<RolePrompter['load']>
    ): void {
        if (this.options.createRole === undefined) {
            return
        }

        const makeRole = () => {
            const temp = prompter.quickPick.items[0]?.invalidSelection ? [] : prompter.quickPick.items
            const appendedItems = this.options.createRole!()
                .then(role => [...temp, { label: role.RoleName, data: role }])
                .catch(err => {
                    getLogger().error('role prompter: Failed to create new role: %O', err)
                    showViewLogsMessage(localize('AWS.rolePrompter.createRole.failed', 'Failed to create new role'))
                    return [...temp]
                })
            appendedItems.then(items => loader.supplantLast(items))
            prompter.clearAndLoadItems(appendedItems)
        }

        this.createRoleButton!.onClick = makeRole
    }

    private checkNoRoles(roles: ReturnType<RolePrompter['load']>): ReturnType<RolePrompter['load']> {
        return roles.then(items => {
            const detail =
                this.options.createRole !== undefined
                    ? localize('AWS.rolePrompter.noRoles.detail', 'Click the "+" to generate a new role')
                    : undefined

            if (items.length === 0) {
                return [
                    {
                        label: localize('AWS.rolePrompter.noRoles.title', 'No valid roles found'),
                        data: {} as any,
                        invalidSelection: true, // TODO: if invalid is true then data can be any?
                        detail,
                    },
                ]
            }

            return items
        })
    }

    protected createPrompter(loader: CachedFunction<RolePrompter['load']>): Prompter<IAM.Role> {
        let roles = loader()

        if (roles instanceof Promise) {
            roles = this.checkNoRoles(roles)
        }

        const prompter = createQuickPick(roles, {
            title: this.options.title,
            buttons: this.buttons,
            placeholder: localize('AWS.rolePrompter.placeholder', 'Select a role'),
        })

        const refresh = () => {
            loader.clearCache()
            prompter.clearAndLoadItems(loader())
        }

        this.refreshButton.onClick = refresh
        this.addCreateRoleCallback(prompter, loader)

        return prompter
    }
}
