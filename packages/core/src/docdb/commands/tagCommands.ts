/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { telemetry } from '../../shared/telemetry/telemetry'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { DBResourceNode } from '../explorer/dbResourceNode'
import { DataQuickPickItem, showQuickPick } from '../../shared/ui/pickerPrompter'
import { ToolkitError } from '../../shared/errors'

export async function listTags(node: DBResourceNode): Promise<void> {
    return telemetry.docdb_listTags.run(async () => {
        const tagMap = await node.listTags()
        const tags = Object.entries(tagMap ?? {}).map(([key, value]) => `• ${key} = ${value}`)
        const detail = tags.length ? tags.join('\r\n') : '[No tags assigned]'

        const addCommandText = localize('AWS.docdb.tags.add', 'Add tag...')
        const removeCommandText = tags.length ? localize('AWS.docdb.tags.remove', 'Remove...') : ''
        const commands = tags.length ? [addCommandText, removeCommandText] : [addCommandText]

        const response = await vscode.window.showInformationMessage(
            `Tags for ${node.name}:`,
            { modal: true, detail },
            ...commands
        )

        switch (response) {
            case addCommandText:
                await addTag(node)
                break
            case removeCommandText:
                await removeTag(node)
                break
        }
    })
}

export async function addTag(node: DBResourceNode): Promise<void> {
    return telemetry.docdb_addTag.run(async () => {
        const key = await vscode.window.showInputBox({
            title: 'Add Tag',
            prompt: localize('AWS.docdb.tags.add.keyPrompt', 'Enter a key for the new tag'),
            validateInput: (input) => validateTag(input, 1, 'key'),
        })
        if (key === undefined) {
            getLogger().info('docdb: AddTag cancelled')
            throw new ToolkitError('User cancelled', { cancelled: true })
        }

        const value = await vscode.window.showInputBox({
            title: 'Add Tag',
            prompt: localize('AWS.docdb.tags.add.valuePrompt', 'Enter the value for the new tag (optional)'),
            validateInput: (input) => validateTag(input, 0, 'value'),
        })
        if (value === undefined) {
            getLogger().info('docdb: AddTag cancelled')
            throw new ToolkitError('User cancelled', { cancelled: true })
        }

        const tag = { [key.trim()]: value.trim() }
        await node.client.addResourceTags({ resourceArn: node.arn, tags: tag })
        getLogger().info('docdb: Added resource tag for: %O', node.name)
        void vscode.window.showInformationMessage(localize('AWS.docdb.tags.add.success', 'Tag added'))
    })
}

export async function removeTag(node: DBResourceNode): Promise<void> {
    return telemetry.docdb_removeTag.run(async () => {
        const tagMap = await node.listTags()
        const items = Object.entries(tagMap ?? {}).map<DataQuickPickItem<string>>(([key, value]) => {
            return {
                data: key,
                label: key,
                description: value,
            }
        })
        if (items.length === 0) {
            return
        }

        const resp = await showQuickPick(items, {
            title: localize('AWS.docdb.tags.remove.title', 'Remove a tag from {0}', node.name),
        })

        if (resp === undefined) {
            getLogger().info('docdb: RemoveTag cancelled')
            throw new ToolkitError('User cancelled', { cancelled: true })
        }

        await node.client.removeResourceTags({ resourceArn: node.arn, tagKeys: [resp] })
        getLogger().info('docdb: Removed resource tag for: %O', node.name)
        void vscode.window.showInformationMessage(localize('AWS.docdb.tags.remove.success', 'Tag removed'))
    })
}

export function validateTag(input: string, minLength: number, name: string): string | undefined {
    if (input.trim().length < minLength) {
        return localize('AWS.docdb.validateTag.error.invalidLength', `Tag ${name} cannot be blank`)
    }

    if (!/^([\p{L}\p{Z}\p{N}\._:/=+\-@]*)$/u.test(input)) {
        return localize(
            'AWS.docdb.validateTag.error.invalidCharacters',
            `Tag ${name} may only contain unicode letters, digits, whitespace, or one of these symbols: _ . : / = + - @`
        )
    }

    return undefined
}
