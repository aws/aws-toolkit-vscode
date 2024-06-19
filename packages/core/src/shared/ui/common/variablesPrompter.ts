/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import { showViewLogsMessage } from '../../utilities/messages'
import { WIZARD_RETRY } from '../../wizards/wizard'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../pickerPrompter'
import * as nls from 'vscode-nls'
import { PrompterButtons } from '../buttons'
import { promisifyThenable } from '../../utilities/vsCodeUtils'

const localize = nls.loadMessageBundle()

function isMatchArray(obj: any): obj is RegExpMatchArray {
    return obj !== undefined && (obj.groups !== undefined || Array.isArray(obj))
}

function unquote(str: string): string {
    const isSingleQuoted = str[0] === "'" && str[str.length - 1] === "'"
    const isDoubleQuoted = str[0] === '"' && str[str.length - 1] === '"'

    if (isSingleQuoted || isDoubleQuoted) {
        str = str.slice(1, -1)
    }

    if (isDoubleQuoted) {
        str = str.replace(/\\n/g, '\n')
    }

    return str
}

function parseEnvFile(contents: string): { [key: string]: string } {
    return contents
        .split(/\r?\n/)
        .map(line => line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/))
        .filter(isMatchArray)
        .map(match => ({ [match[1]]: unquote(match[2] ?? '').trim() }))
        .reduce((a, b) => Object.assign(a, b))
}

// TODO: create key/value pair prompter
// Format:
// [TITLE]       [+][-][?]
// + button calls new prompter to set key/value pair
// - button removes currently highlighted pair
// also add a 'load from file' button (always show)
// there will be a 'Done' button that returns the resulting list (always show)
// each input would be label: key description: value

/**
 * Creates a optional prompt for environment variables.
 *
 * Currently, the only accepted file format are `.env` files:
 * KEY1=VALUE2
 * KEY2=VALUE2
 * ...
 *
 * @param buttons Optional buttons to add
 * @returns A {@link QuickPickPrompter} that returns data in the shape of Node's process `env` variable
 */
export function createVariablesPrompter(
    buttons?: PrompterButtons<string>
): QuickPickPrompter<{ [name: string]: string }> {
    const openDialog = async () => {
        try {
            const resp = await promisifyThenable(vscode.window.showOpenDialog({ canSelectMany: false }))
            if (resp === undefined) {
                throw new Error('Closed dialog')
            }
            const path = resp[0].fsPath
            const contents = await fs.promises.readFile(path)
            return parseEnvFile(contents.toString())
        } catch (err) {
            if ((err as Error).message !== 'Closed dialog') {
                void showViewLogsMessage(
                    localize('AWS.environmentVariables.prompt.failed', 'Failed to read environment variables')
                )
            }
            return WIZARD_RETRY
        }
    }

    const items: DataQuickPickItem<{ [name: string]: string }>[] = [
        { label: localize('AWS.generic.skip', 'Skip'), data: {} },
        { label: localize('AWS.generic.useFile', 'Use file...'), data: openDialog, skipEstimate: true },
    ]

    return createQuickPick<{ [name: string]: string }>(items, {
        title: localize('AWS.environmentVariables.prompt.title', 'Configure environment variables'),
        buttons: buttons,
    })
}
