/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { getIdeProperties } from './extensionUtilities'
const localize = nls.loadMessageBundle()

export const yes = localize('AWS.generic.response.yes', 'Yes')
export const no = localize('AWS.generic.response.no', 'No')
export const ok = localize('AWS.generic.response.ok', 'OK')
export const retry = localize('AWS.generic.response.retry', 'Retry')
export const skip = localize('AWS.generic.response.skip', 'Skip')
export const localizedDelete = localize('AWS.generic.delete', 'Delete')
export const cancel = localize('AWS.generic.cancel', 'Cancel')
export const help = localize('AWS.generic.help', 'Help')
export const invalidNumberWarning = localize('AWS.validateTime.error.invalidNumber', 'Input must be a positive number')
export const viewDocs = localize('AWS.generic.viewDocs', 'View Documentation')
export const recentlyUsed = localize('AWS.generic.recentlyUsed', 'recently used')
export const viewSettings = localize('AWS.generic.viewSettings', 'View Settings')
export const loadMore = localize('AWS.generic.loadMore', 'Load More')

export function checklogs(): string {
    const message = localize(
        'AWS.error.check.logs',
        'Check the logs by running the "View {0} Toolkit Logs" command from the {1}.',
        getIdeProperties().company,
        getIdeProperties().commandPalette
    )

    return message
}
