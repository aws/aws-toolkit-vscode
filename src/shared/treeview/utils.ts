/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { isCloud9 } from '../extensionUtilities'
import { getLogger } from '../logger'
import { AWSTreeNodeBase } from './nodes/awsTreeNodeBase'
import { UnknownError } from '../toolkitError'
import { Logging } from '../logger/commands'

/**
 * Produces a list of child nodes using handlers to consistently populate the
 * list when errors occur or if the list would otherwise be empty.
 */
export async function makeChildrenNodes<T extends AWSTreeNodeBase, P extends AWSTreeNodeBase>(parameters: {
    getChildNodes(): Promise<T[]>
    getNoChildrenPlaceholderNode?(): Promise<P>
    sort?: (a: T, b: T) => number
    getErrorNode?: (error: Error) => AWSTreeNodeBase
}): Promise<T[] | [P] | [AWSTreeNodeBase]> {
    try {
        const nodes = await parameters.getChildNodes()

        if (nodes.length === 0 && parameters.getNoChildrenPlaceholderNode) {
            return [await parameters.getNoChildrenPlaceholderNode()]
        }

        if (parameters.sort) {
            nodes.sort((a, b) => parameters.sort!(a, b))
        }

        return nodes
    } catch (error) {
        const converted = UnknownError.cast(error)

        return [parameters.getErrorNode?.(converted) ?? createErrorItem(converted)]
    }
}

/**
 * Creates a new {@link vscode.ThemeIcon} with an optional theme color.
 * Only used to maintain backwards compatability with C9.
 *
 * Refer to https://code.visualstudio.com/api/references/theme-color for a list of theme colors.
 */
export function createThemeIcon(id: string, color?: string) {
    if (!color || isCloud9()) {
        return new vscode.ThemeIcon(id)
    } else {
        const themeColor = new vscode.ThemeColor(color)
        const ThemeIcon = vscode.ThemeIcon as new (id: string, theme: typeof themeColor) => vscode.ThemeIcon

        return new ThemeIcon(id, themeColor)
    }
}

export function createErrorItem(error: Error, message?: string): AWSTreeNodeBase {
    const command = Logging.declared.viewLogsAtMessage
    const logId = message ? getLogger().error(message) : getLogger().error(error)

    return command.build(logId).asTreeNode({
        label: localize('AWS.explorerNode.error.label', 'Failed to load resources (click for logs)'),
        tooltip: `${error.name}: ${error.message}`,
        iconPath: createThemeIcon('error', 'testing.iconErrored'),
        contextValue: 'awsErrorNode',
    })
}
