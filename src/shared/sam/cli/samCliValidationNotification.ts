/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { openUrl, showExtensionPage } from '../../../shared/utilities/vsCodeUtils'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { samInstallUrl } from '../../constants'
import { getIdeProperties } from '../../extensionUtilities'
import {
    InvalidSamCliError,
    InvalidSamCliVersionError,
    maxSamCliVersionExclusive,
    minSamCliVersion,
    SamCliNotFoundError,
    SamCliVersionValidation,
    SamCliVersionValidatorResult,
} from './samCliValidator'
import { VSCODE_EXTENSION_ID } from '../../extensions'

const localize = nls.loadMessageBundle()

// Notification Actions
export interface SamCliValidationNotificationAction {
    label(): string
    invoke(): Promise<void>
}

const actionGoToSamCli: SamCliValidationNotificationAction = {
    label: () => localize('AWS.samcli.userChoice.visit.install.url', 'Install latest SAM CLI'),
    invoke: async () => {
        void openUrl(samInstallUrl)
    },
}

const actionGoToVsCodeMarketplace: SamCliValidationNotificationAction = {
    label: () =>
        localize(
            'AWS.samcli.userChoice.update.awstoolkit.url',
            'Install latest {0} Toolkit',
            getIdeProperties().company
        ),
    invoke: async () => {
        void showExtensionPage(VSCODE_EXTENSION_ID.awstoolkit)
    },
}

// Notifications
export interface SamCliValidationNotification {
    show(): Promise<void>
}

class DefaultSamCliValidationNotification implements SamCliValidationNotification {
    public constructor(
        private readonly message: string,
        private readonly actions: SamCliValidationNotificationAction[]
    ) {}

    public async show(): Promise<void> {
        const userResponse: string | undefined = await vscode.window.showErrorMessage(
            this.message,
            ...this.actions.map(action => action.label())
        )

        if (userResponse) {
            const responseActions: Promise<void>[] = this.actions
                .filter(action => action.label() === userResponse)
                .map(async action => action.invoke())

            await Promise.all(responseActions)
        }
    }
}

export async function notifySamCliValidation(samCliValidationError: InvalidSamCliError): Promise<void> {
    if (!samCliValidationError) {
        return
    }

    const notification = getInvalidSamMsg(samCliValidationError)
    await notification.show()
}

export function getInvalidSamMsg(
    samCliValidationError: InvalidSamCliError,
    onCreateNotification: (
        message: string,
        actions: SamCliValidationNotificationAction[]
    ) => SamCliValidationNotification = (message, actions): SamCliValidationNotification =>
        new DefaultSamCliValidationNotification(message, actions)
): SamCliValidationNotification {
    if (samCliValidationError instanceof SamCliNotFoundError) {
        return onCreateNotification(
            localize(
                'AWS.samcli.notification.not.found',
                'Cannot find SAM CLI. It is required in order to work with Serverless Applications locally.'
            ),
            [actionGoToSamCli]
        )
    } else if (samCliValidationError instanceof InvalidSamCliVersionError) {
        return onCreateNotification(
            getInvalidVersionMsg(samCliValidationError.versionValidation),
            getActions(samCliValidationError.versionValidation.validation)
        )
    } else {
        return onCreateNotification(
            localize(
                'AWS.samcli.notification.unexpected.validation.issue',
                'Unexpected error while validating SAM CLI: {0}',
                samCliValidationError.message
            ),
            []
        )
    }
}

function getInvalidVersionMsg(validationResult: SamCliVersionValidatorResult): string {
    const win185msg = localize(
        'AWS.sam.updateSamWindows',
        'SAM CLI 1.85-1.86 has [known issues](https://github.com/aws/aws-sam-cli/issues/5243) on Windows. Update SAM CLI.'
    )
    let recommendation: string

    switch (validationResult.validation) {
        case SamCliVersionValidation.VersionTooHigh:
            recommendation = localize('AWS.sam.updateToolkit', 'Update {0} Toolkit.', getIdeProperties().company)
            break
        case SamCliVersionValidation.Version185Win:
            return win185msg
        case SamCliVersionValidation.VersionNotParseable: {
            if (process.platform === 'win32') {
                return win185msg
            }
            return localize('AWS.sam.installSam', 'SAM CLI failed to run.')
        }
        default:
            recommendation = localize('AWS.sam.updateSam', 'Update SAM CLI.')
            break
    }

    return localize(
        'AWS.sam.invalid',
        'SAM CLI {0} is not in required range ({1} ≤ version < {2}). {3}',
        validationResult.version,
        minSamCliVersion,
        maxSamCliVersionExclusive,
        recommendation
    )
}

function getActions(validation: SamCliVersionValidation): SamCliValidationNotificationAction[] {
    const actions: SamCliValidationNotificationAction[] = []

    if (validation === SamCliVersionValidation.VersionTooHigh) {
        actions.push(actionGoToVsCodeMarketplace)
    } else {
        actions.push(actionGoToSamCli)
    }

    return actions
}
