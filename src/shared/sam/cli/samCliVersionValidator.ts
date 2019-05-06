/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as semver from 'semver'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { samAboutInstallUrl, vscodeMarketplaceUrl } from '../../constants'

const localize = nls.loadMessageBundle()

const ACTION_GO_TO_SAM_CLI_PAGE: string = localize(
    'AWS.samcli.userChoice.visit.install.url',
    'Get SAM CLI'
)

const ACTION_GO_TO_AWS_TOOLKIT_PAGE: string = localize(
    'AWS.samcli.userChoice.update.awstoolkit.url',
    'Update AWS Toolkit'
)

const RECOMMENDATION_UPDATE_TOOLKIT: string = localize(
    'AWS.samcli.recommend.update.toolkit',
    'Please update your AWS Toolkit.'
)

const RECOMMENDATION_UPDATE_SAM_CLI: string = localize(
    'AWS.samcli.recommend.update.samcli',
    'Please update your SAM CLI.'
)

export enum SamCliVersionValidation {
    Valid = 'Valid',
    VersionTooLow = 'VersionTooLow',
    VersionTooHigh = 'VersionTooHigh',
    VersionNotParseable = 'VersionNotParseable',
}

export const MINIMUM_SAM_CLI_VERSION_INCLUSIVE = '0.11.0'
export const MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE = '0.16.0'

export interface SamCliVersionValidatorResult {
    version?: string,
    validation: SamCliVersionValidation
}

export function validateSamCliVersion(version?: string): SamCliVersionValidation {
    if (!version) {
        return SamCliVersionValidation.VersionNotParseable
    }

    if (!semver.valid(version)) {
        return SamCliVersionValidation.VersionNotParseable
    }

    if (semver.lt(version, MINIMUM_SAM_CLI_VERSION_INCLUSIVE)) {
        return SamCliVersionValidation.VersionTooLow
    }

    if (semver.gte(version, MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE)) {
        return SamCliVersionValidation.VersionTooHigh
    }

    return SamCliVersionValidation.Valid
}

// todo : CC : Some sort of notifyIfError method. How to bridge version validation and samclivalidation?
// I think it moves to the sam cli validation file

// todo : test
function makeVersionValidationNotificationText(validationResult: SamCliVersionValidatorResult): string {
    return localize(
        'AWS.samcli.notification.version.invalid',
        // tslint:disable-next-line:max-line-length
        'Your SAM CLI version {0} does not meet requirements ({1}\u00a0\u2264\u00a0version\u00a0<\u00a0{2}). {3}',
        validationResult.version,
        MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
        MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE,
        getVersionValidationRecommendationText(validationResult.validation)
    )
}

// todo : test
function getVersionValidationRecommendationText(validation: SamCliVersionValidation): string {
    let recommendation: string

    switch (validation) {
        case SamCliVersionValidation.VersionTooHigh:
            recommendation = RECOMMENDATION_UPDATE_TOOLKIT
            break
        case SamCliVersionValidation.VersionTooLow:
        case SamCliVersionValidation.VersionNotParseable:
        default:
            recommendation = RECOMMENDATION_UPDATE_SAM_CLI
            break
    }

    return recommendation
}

// todo : test
function getNotificationActions(validation: SamCliVersionValidation): string[] {
    const actions: string[] = []

    switch (validation) {
        case SamCliVersionValidation.VersionTooHigh:
            actions.push(ACTION_GO_TO_AWS_TOOLKIT_PAGE)
            break
        case SamCliVersionValidation.VersionTooLow:
        case SamCliVersionValidation.VersionNotParseable:
        default:
            actions.push(ACTION_GO_TO_SAM_CLI_PAGE)
            break
    }

    return actions
}

// todo : CC : Phase out, replace with exported method
export class DefaultSamCliVersionValidator { // implements SamCliVersionValidator {

    public async notifyVersionIsNotValid(validationResult: SamCliVersionValidatorResult): Promise<void> {
        const actions = getNotificationActions(validationResult.validation)

        const userResponse = await vscode.window.showErrorMessage(
            makeVersionValidationNotificationText(validationResult),
            ...actions
        )

        if (!!userResponse) {
            await this.handleUserResponse(userResponse)
        }
    }

    private async handleUserResponse(userResponse: string): Promise<void> {
        if (userResponse === ACTION_GO_TO_SAM_CLI_PAGE) {
            await vscode.env.openExternal(vscode.Uri.parse(samAboutInstallUrl))
        } else if (userResponse === ACTION_GO_TO_AWS_TOOLKIT_PAGE) {
            await vscode.env.openExternal(vscode.Uri.parse(vscodeMarketplaceUrl))
        }
    }
}
