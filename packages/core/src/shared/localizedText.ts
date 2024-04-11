/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
export const confirm = localize('AWS.generic.confirm', 'Confirm')
export const continueText = localize('AWS.generic.continue', 'Continue')
export const invalidArn = localize('AWS.error.invalidArn', 'Invalid ARN')
export const localizedDelete = localize('AWS.generic.delete', 'Delete')
export const cancel = localize('AWS.generic.cancel', 'Cancel')
export const help = localize('AWS.generic.help', 'Help')
export const invalidNumberWarning = localize('AWS.validateTime.error.invalidNumber', 'Input must be a positive number')
export const viewDocs = localize('AWS.generic.viewDocs', 'View Documentation')
export const recentlyUsed = localize('AWS.generic.recentlyUsed', 'recently used')
export const viewSettings = localize('AWS.generic.viewSettings', 'View Settings')
export const dontShow = localize('aws.generic.doNotShowAgain', "Don't Show Again")
export const loadMore = localize('AWS.generic.loadMore', 'Load More')
export const learnMore = localize('AWS.generic.learnMore', 'Learn More')
export const proceed = localize('AWS.generic.proceed', 'Proceed')
export const connect = localize('AWS.auth.connect', 'Connect with AWS')
export function connectionExpired(name: string) {
    return localize(
        'AWS.auth.expired',
        'Connection expired. To continue using {0}, connect with AWS Builder ID or AWS IAM Identity center.',
        name
    )
}

export const checklogs = () =>
    localize(
        'AWS.error.check.logs',
        'Check the logs by running the "View {0} Toolkit Logs" command from the {1}.',
        getIdeProperties().company,
        getIdeProperties().commandPalette
    )

export const builderId = () => localize('AWS.auth.names.builderId', '{0} Builder ID', getIdeProperties().company)

export const iamIdentityCenter = localize('AWS.auth.names.iamIdentityCenter', 'IAM Identity Center')
export const iamIdentityCenterFull = () =>
    localize(
        'AWS.auth.names.iamIdentityCenterFull',
        '{0} (Successor to {1} Single Sign-on)',
        iamIdentityCenter,
        getIdeProperties().company
    )
