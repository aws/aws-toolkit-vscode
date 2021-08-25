/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { getIdeProperties } from './extensionUtilities'
const localize = nls.loadMessageBundle()

export const yes: string = localize('AWS.generic.response.yes', 'Yes')
export const no: string = localize('AWS.generic.response.no', 'No')
export const localizedDelete: string = localize('AWS.generic.delete', 'Delete')
export const cancel: string = localize('AWS.generic.cancel', 'Cancel')
export const help: string = localize('AWS.generic.help', 'Help')
export const invalidNumberWarning: string = localize(
    'AWS.validateTime.error.invalidNumber',
    'Input must be a positive number'
)
export const viewDocs: string = localize('AWS.generic.viewDocs', 'View Documentation')

export function checklogs(): string {
    const message = localize(
        'AWS.error.check.logs',
        'Check the logs by running the "View {0} Toolkit Logs" command from the {1}.',
        getIdeProperties().company,
        getIdeProperties().commandPalette
    )

    return message
}
