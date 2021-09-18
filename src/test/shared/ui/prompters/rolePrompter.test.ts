/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as assert from 'assert'
import * as picker from '../../../../shared/ui/pickerPrompter'
import * as vscode from 'vscode'
import { IAM } from 'aws-sdk'
import { IamClient } from '../../../../shared/clients/iamClient'
import { RolePrompter } from '../../../../shared/ui/common/rolePrompter'
import { instance, mock, when } from 'ts-mockito'
import { exposeEmitters, ExposeEmitters } from '../../vscode/testUtils'

describe('RolePrompter', function () {
    let roleResponse: IAM.ListRolesResponse
    let newRole: IAM.Role
    let mockIamClient: IamClient
    let prompterProvider: RolePrompter
    let prompter: picker.QuickPickPrompter<IAM.Role>
    let picker: ExposeEmitters<vscode.QuickPick<picker.DataQuickPickItem<IAM.Role>>, 'onDidTriggerButton'>

    beforeEach(function () {
        roleResponse = {
            Roles: [
                {
                    RoleName: 'test-role1',
                    Arn: 'test-arn1',
                } as any,
            ],
        }

        newRole = {
            RoleName: 'new-role',
            Arn: 'new-arn',
        } as any

        mockIamClient = mock()
        when(mockIamClient.listRoles()).thenResolve(roleResponse)
        prompterProvider = new RolePrompter(instance(mockIamClient), { createRole: () => Promise.resolve(newRole) })
        prompter = prompterProvider({ stepCache: {} } as any) as picker.QuickPickPrompter<IAM.Role>
        picker = exposeEmitters(prompter.quickPick, ['onDidTriggerButton'])
    })

    it('prompts for role', async function () {
        picker.onDidChangeActive(items => {
            if (items.length > 0) {
                picker.selectedItems = [items[0]]
            }
        })

        assert.strictEqual(await prompter.prompt(), roleResponse.Roles[0])
    })

    it('can refresh', async function () {
        picker.onDidChangeActive(() => {
            if (picker.items.length === 2) {
                picker.selectedItems = [picker.items[1]]
            }
        })

        prompter.onDidShow(() => {
            if (picker.items.length === 0) {
                picker.onDidChangeActive(() => {
                    if (picker.items.length === 1) {
                        roleResponse.Roles.push({ RoleName: 'test-role2', Arn: 'test-arn2' } as any)
                        picker.fireOnDidTriggerButton(picker.buttons.filter(b => b.tooltip === 'Refresh')[0])
                    }
                })
            } else {
                roleResponse.Roles.push({ RoleName: 'test-role2', Arn: 'test-arn2' } as any)
                picker.fireOnDidTriggerButton(picker.buttons.filter(b => b.tooltip === 'Refresh')[0])
            }
        })

        assert.strictEqual(await prompter.prompt(), roleResponse.Roles[1])
    })

    it('can create a new role', async function () {
        picker.onDidChangeActive(() => {
            if (picker.items.length === 2) {
                picker.selectedItems = [picker.items[1]]
            }
        })

        prompter.onDidShow(() => {
            if (picker.items.length === 0) {
                picker.onDidChangeActive(() => {
                    if (picker.items.length === 1) {
                        picker.fireOnDidTriggerButton(picker.buttons.filter(b => b.tooltip === 'Create Role...')[0])
                    }
                })
            } else {
                picker.fireOnDidTriggerButton(picker.buttons.filter(b => b.tooltip === 'Create Role...')[0])
            }
        })

        assert.strictEqual(await prompter.prompt(), newRole)
    })
})
