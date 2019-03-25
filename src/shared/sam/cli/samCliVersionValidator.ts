/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as semver from 'semver'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { samAboutInstallUrl } from '../../constants'

const localize = nls.loadMessageBundle()

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

export interface SamCliVersionValidator {
    getCliValidationStatus(version?: string): Promise<SamCliVersionValidatorResult>
    notifyVersionIsNotValid(validationResult: SamCliVersionValidatorResult): Promise<void>
}

export class DefaultSamCliVersionValidator implements SamCliVersionValidator {
    private static readonly ACTION_GO_TO_SAM_CLI_PAGE = localize(
        'AWS.samcli.userChoice.visit.install.url',
        'Get SAM CLI'
    )

    private static readonly ACTION_GO_TO_AWS_TOOLKIT_PAGE = localize(
        'AWS.samcli.userChoice.update.awstoolkit.url',
        'Update AWS Toolkit'
    )

    public async getCliValidationStatus(version?: string): Promise<SamCliVersionValidatorResult> {
        return {
            version: version,
            validation: this.getValidationStatus(version)
        }
    }

    public async notifyVersionIsNotValid(validationResult: SamCliVersionValidatorResult): Promise<void> {
        const actions = this.getNotificationActions(validationResult.validation)

        const userResponse = await vscode.window.showErrorMessage(
            localize(
                'AWS.samcli.notification.version.invalid',
                // tslint:disable-next-line:max-line-length
                'Your SAM CLI version {0} does not meet requirements ({1}\u00a0\u2264\u00a0version\u00a0<\u00a0{2}). {3}',
                validationResult.version,
                MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
                MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE,
                this.getNotificationRecommendation(validationResult.validation)
            ),
            ...actions
        )

        if (!!userResponse) {
            await this.handleUserResponse(userResponse)
        }
    }

    private getValidationStatus(version?: string): SamCliVersionValidation {
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

    private getNotificationRecommendation(validation: SamCliVersionValidation): string {
        let recommendation: string

        switch (validation) {
            case SamCliVersionValidation.VersionTooHigh:
                recommendation = localize(
                    'AWS.samcli.recommend.update.toolkit',
                    'Please update your AWS Toolkit.'
                )
                break
            case SamCliVersionValidation.VersionTooLow:
            case SamCliVersionValidation.VersionNotParseable:
            default:
                recommendation = localize(
                    'AWS.samcli.recommend.update.samcli',
                    'Please update your SAM CLI.'
                )
                break
        }

        return recommendation
    }

    private getNotificationActions(validation: SamCliVersionValidation): string[] {
        const actions: string[] = []

        switch (validation) {
            case SamCliVersionValidation.VersionTooHigh:
                // TODO : When an AWS Toolkit Page exists, uncomment next line:
                // actions.push(SamCliVersionValidator.ACTION_GO_TO_AWS_TOOLKIT_PAGE)
                break
            case SamCliVersionValidation.VersionTooLow:
            case SamCliVersionValidation.VersionNotParseable:
            default:
                actions.push(DefaultSamCliVersionValidator.ACTION_GO_TO_SAM_CLI_PAGE)
                break
        }

        return actions
    }

    private async handleUserResponse(userResponse: string): Promise<void> {
        if (userResponse === DefaultSamCliVersionValidator.ACTION_GO_TO_SAM_CLI_PAGE) {
            await vscode.env.openExternal(vscode.Uri.parse(samAboutInstallUrl))
        } else if (userResponse === DefaultSamCliVersionValidator.ACTION_GO_TO_AWS_TOOLKIT_PAGE) {
            // TODO : direct to AWS Toolkit page when there is one
        }
    }
}
