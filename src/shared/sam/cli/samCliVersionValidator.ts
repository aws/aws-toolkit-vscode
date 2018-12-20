/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { samAboutInstallUrl } from '../../constants'
import {
    DefaultSamCliVersionProvider,
    SamCliVersion,
    SamCliVersionProvider,
    SamCliVersionValidation
} from './samCliVersion'

const localize = nls.loadMessageBundle()

export interface SamCliVersionValidatorResult {
    version: string | undefined,
    validation: SamCliVersionValidation
}

export class SamCliVersionValidator {
    private static readonly ACTION_GO_TO_SAM_CLI_PAGE = localize(
        'AWS.samcli.userChoice.visit.install.url',
        'Get SAM CLI'
    )

    private static readonly ACTION_GO_TO_AWS_TOOLKIT_PAGE = localize(
        'AWS.samcli.userChoice.visit.awstoolkit.url',
        'Get AWS Toolkit'
    )

    private readonly _versionProvider: SamCliVersionProvider

    public constructor(versionProvider?: SamCliVersionProvider) {
        this._versionProvider = versionProvider || new DefaultSamCliVersionProvider()
    }

    public async validate(): Promise<SamCliVersionValidatorResult> {
        const version = await this._versionProvider.getSamCliVersion()

        return {
            version: version,
            validation: SamCliVersion.validate(version)
        }
    }

    /**
     * Call this to determine the SAM CLI version, and inform the user whether or not the version is acceptable
     */
    public async validateAndNotify(): Promise<void> {
        const validationResult = await this.validate()

        if (validationResult.validation === SamCliVersionValidation.Valid) {
            await this.notifyVersionIsValid(validationResult.version!)
        } else {
            await this.notifyVersionIsNotValid(validationResult)
        }
    }

    private async notifyVersionIsValid(version: string): Promise<void> {
        vscode.window.setStatusBarMessage(
            localize(
                'AWS.samcli.notification.version.valid',
                'Your SAM CLI version {0} is valid.',
                version
            ),
            3333
        )
    }

    private async notifyVersionIsNotValid(validationResult: SamCliVersionValidatorResult): Promise<void> {
        const actions = this.getNotificationActions(validationResult.validation)

        const userResponse = await vscode.window.showErrorMessage(
            localize(
                'AWS.samcli.notification.version.invalid',
                'Your SAM CLI version {0} does not meet requirements ({1} - {2}). {3}',
                validationResult.version,
                SamCliVersion.MINIMUM_SAM_CLI_VERSION,
                SamCliVersion.MAXIMUM_SAM_CLI_VERSION,
                this.getNotificationRecommendation(validationResult.validation)
            ),
            ...actions
        )

        if (!!userResponse) {
            await this.handleUserResponse(userResponse)
        }
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
                actions.push(SamCliVersionValidator.ACTION_GO_TO_SAM_CLI_PAGE)
                break
        }

        return actions
    }

    private async handleUserResponse(userResponse: string): Promise<void> {
        if (userResponse === SamCliVersionValidator.ACTION_GO_TO_SAM_CLI_PAGE) {
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(samAboutInstallUrl))
        } else if (userResponse === SamCliVersionValidator.ACTION_GO_TO_AWS_TOOLKIT_PAGE) {
            // TODO : direct to AWS Toolkit page when there is one
        }
    }
}
