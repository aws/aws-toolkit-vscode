/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { getIcon, codicon } from '../../shared/icons'
import { telemetry } from '../../shared/telemetry/telemetry'
import { createRefreshButton, createExitButton } from '../../shared/ui/buttons'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { Auth, Connection, isIamConnection, reauthCommand } from '../auth'
import { getDependentAuths } from '../secondaryAuth'

export const getConnectionIcon = (conn: Connection) =>
    conn.type === 'sso' ? getIcon('vscode-account') : getIcon('vscode-key')

export function createConnectionPrompter(auth: Auth, type?: 'iam' | 'sso') {
    const placeholder =
        type === 'iam'
            ? localize('aws.auth.promptConnection.iam.placeholder', 'Select an IAM credential')
            : localize('aws.auth.promptConnection.all.placeholder', 'Select a connection')

    const refreshButton = createRefreshButton()
    refreshButton.onClick = () => void prompter.clearAndLoadItems(loadItems())

    const prompter = createQuickPick(loadItems(), {
        placeholder,
        title: localize('aws.auth.promptConnection.title', 'Switch Connection'),
        buttons: [refreshButton, createExitButton()],
    })

    return prompter

    async function loadItems(): Promise<DataQuickPickItem<Connection | 'addNewConnection' | 'editCredentials'>[]> {
        const addNewConnection = {
            label: codicon`${getIcon('vscode-plus')} Add New Connection`,
            data: 'addNewConnection' as const,
        }
        const editCredentials = {
            label: codicon`${getIcon('vscode-pencil')} Edit Credentials`,
            data: 'editCredentials' as const,
        }

        // TODO: list linked connections
        const connections = await auth.listConnections()
        connections.sort((a, b) => (a.type === 'sso' ? -1 : b.type === 'sso' ? 1 : a.label.localeCompare(b.label)))
        const filtered = type !== undefined ? connections.filter(c => c.type === type) : connections
        const items = [...filtered.map(toPickerItem), addNewConnection]
        const canShowEdit = connections.filter(isIamConnection).filter(c => c.label.startsWith('profile')).length > 0

        return canShowEdit ? [...items, editCredentials] : items
    }

    function toPickerItem(conn: Connection): DataQuickPickItem<Connection> {
        const state = auth.getConnectionState(conn)
        if (state !== 'valid') {
            return {
                data: conn,
                invalidSelection: true,
                label: codicon`${getIcon('vscode-error')} ${conn.label}`,
                description:
                    state === 'authenticating'
                        ? 'authenticating...'
                        : localize(
                              'aws.auth.promptConnection.expired.description',
                              'Expired or Invalid, select to authenticate'
                          ),
                onClick:
                    state !== 'authenticating'
                        ? async () => {
                              telemetry.updateAttributes({ source: 'QuickPick' })
                              await reauthCommand.execute(auth, conn)
                              await prompter.clearAndLoadItems(loadItems())
                          }
                        : undefined,
            }
        }

        return {
            data: conn,
            label: codicon`${getConnectionIcon(conn)} ${conn.label}`,
            description: getConnectionDescription(conn),
        }
    }

    function getConnectionDescription(conn: Connection) {
        if (conn.type === 'iam') {
            const descSuffix = conn.id.startsWith('profile:')
                ? 'configured locally (~/.aws/config)'
                : 'sourced from the environment'

            return `IAM Credential, ${descSuffix}`
        }

        const toolAuths = getDependentAuths(conn)
        if (toolAuths.length === 0) {
            return undefined
        } else if (toolAuths.length === 1) {
            return `Connected to ${toolAuths[0].toolLabel}`
        } else {
            return `Connected to Dev Tools`
        }
    }
}
