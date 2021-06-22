/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { samAboutInstallUrl, vscodeMarketplaceUrl } from '../../constants'
import { getIdeProperties } from '../../extensionUtilities'
import {
    InvalidSamCliError,
    InvalidSamCliVersionError,
    MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE,
    MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
    SamCliNotFoundError,
    SamCliVersionValidation,
    SamCliVersionValidatorResult,
} from './samCliValidator'

const localize = nls.loadMessageBundle()

// Notification Actions
export interface SamCliValidationNotificationAction {
    label: string
    invoke(): Promise<void>
}

const actionGoToSamCli: SamCliValidationNotificationAction = {
    label: localize('AWS.samcli.userChoice.visit.install.url', 'Get SAM CLI'),
    invoke: async () => {
        await vscode.env.openExternal(vscode.Uri.parse(samAboutInstallUrl))
    },
}

const actionGoToVsCodeMarketplace: SamCliValidationNotificationAction = {
    label: localize('AWS.samcli.userChoice.update.awstoolkit.url', 'Visit Marketplace'),
    invoke: async () => {
        // TODO : Switch to the Extension panel in VS Code instead
        await vscode.env.openExternal(vscode.Uri.parse(vscodeMarketplaceUrl))
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
            ...this.actions.map(action => action.label)
        )

        if (userResponse) {
            const responseActions: Promise<void>[] = this.actions
                .filter(action => action.label === userResponse)
                .map(async action => action.invoke())

            await Promise.all(responseActions)
        }
    }
}

export async function notifySamCliValidation(samCliValidationError: InvalidSamCliError): Promise<void> {
    if (!samCliValidationError) {
        return
    }

    const notification: SamCliValidationNotification = makeSamCliValidationNotification(samCliValidationError)

    await notification.show()
}

export function makeSamCliValidationNotification(
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
            makeVersionValidationNotificationMessage(samCliValidationError.versionValidation),
            makeVersionValidationActions(samCliValidationError.versionValidation.validation)
        )
    } else {
        return onCreateNotification(
            localize(
                'AWS.samcli.notification.unexpected.validation.issue',
                'An unexpected issue occured while validating SAM CLI: {0}',
                samCliValidationError.message
            ),
            []
        )
    }
}

function makeVersionValidationNotificationMessage(validationResult: SamCliVersionValidatorResult): string {
    const RECOMMENDATION_UPDATE_TOOLKIT: string = localize(
        'AWS.samcli.recommend.update.toolkit',
        'Check the Marketplace for an updated {0} Toolkit.',
        getIdeProperties().company
    )

    const RECOMMENDATION_UPDATE_SAM_CLI: string = localize('AWS.samcli.recommend.update.samcli', 'Update your SAM CLI.')

    const recommendation: string =
        validationResult.validation === SamCliVersionValidation.VersionTooHigh
            ? RECOMMENDATION_UPDATE_TOOLKIT
            : RECOMMENDATION_UPDATE_SAM_CLI

    return localize(
        'AWS.samcli.notification.version.invalid',
        'Your SAM CLI version {0} does not meet requirements ({1} ≤ version < {2}). {3}',
        validationResult.version,
        MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
        MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE,
        recommendation
    )
}

function makeVersionValidationActions(validation: SamCliVersionValidation): SamCliValidationNotificationAction[] {
    const actions: SamCliValidationNotificationAction[] = []

    if (validation === SamCliVersionValidation.VersionTooHigh) {
        actions.push(actionGoToVsCodeMarketplace)
    } else {
        actions.push(actionGoToSamCli)
    }

    return actions
}
