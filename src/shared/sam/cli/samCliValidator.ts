/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { Stats } from 'fs'
import * as semver from 'semver'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { samAboutInstallUrl, vscodeMarketplaceUrl } from '../../constants'
import { stat } from '../../filesystem'
import { SamCliConfiguration } from './samCliConfiguration'
import { SamCliInfoInvocation, SamCliInfoResponse } from './samCliInfo'
import { SamCliProcessInvoker } from './samCliInvokerUtils'

const localize = nls.loadMessageBundle()

export const MINIMUM_SAM_CLI_VERSION_INCLUSIVE = '0.11.0'
export const MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE = '0.16.0'

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

export class InvalidSamCliError extends Error {
    public constructor(message?: string | undefined) {
        super(message)
    }
}

export class SamCliNotFoundError extends InvalidSamCliError {
    public constructor() {
        super('SAM CLI was not found')
    }
}

export class InvalidSamCliVersionError extends InvalidSamCliError {
    public constructor(public versionValidation: SamCliVersionValidatorResult) {
        super('SAM CLI has an invalid version')
    }
}

export enum SamCliVersionValidation {
    Valid = 'Valid',
    VersionTooLow = 'VersionTooLow',
    VersionTooHigh = 'VersionTooHigh',
    VersionNotParseable = 'VersionNotParseable',
}

export interface SamCliVersionValidatorResult {
    version?: string,
    validation: SamCliVersionValidation
}

export interface SamCliValidator {
    detectValidSamCli(): Promise<SamCliValidatorResult>
}

export interface SamCliValidatorResult {
    samCliFound: boolean
    versionValidation?: SamCliVersionValidatorResult
}

export abstract class BaseSamCliValidator implements SamCliValidator {
    private cachedSamInfoResponse?: SamCliInfoResponse
    // The modification timestamp of SAM CLI is used as the "cache key"
    private cachedSamInfoResponseSource?: Date

    public constructor() {
    }

    public async detectValidSamCli(): Promise<SamCliValidatorResult> {
        const result: SamCliValidatorResult = {
            samCliFound: false
        }

        const samCliLocation = this.getSamCliLocation()
        if (samCliLocation) {
            result.samCliFound = true

            result.versionValidation = await this.getVersionValidatorResult(samCliLocation)
        }

        return result
    }

    // This method is public for testing purposes
    public async getVersionValidatorResult(samCliLocation: string): Promise<SamCliVersionValidatorResult> {
        const cliStat: Pick<Stats, 'mtime'> = await this.getSamCliStat(samCliLocation)
        if (!this.isSamCliVersionCached(cliStat.mtime)) {
            this.cachedSamInfoResponse = await this.getInfo(samCliLocation)
            this.cachedSamInfoResponseSource = cliStat.mtime
        }

        const version: string = this.cachedSamInfoResponse!.version

        return {
            version,
            validation: BaseSamCliValidator.validateSamCliVersion(version),
        }
    }

    protected abstract async getSamCliStat(samCliLocation: string): Promise<Pick<Stats, 'mtime'>>

    protected abstract getSamCliLocation(): string | undefined

    protected abstract async getInfo(samCliLocation: string): Promise<SamCliInfoResponse>

    private isSamCliVersionCached(samCliLastModifiedOn: Date): boolean {
        if (!this.cachedSamInfoResponse) { return false }
        if (!this.cachedSamInfoResponseSource) { return false }

        return this.cachedSamInfoResponseSource === samCliLastModifiedOn
    }

    public static validateSamCliVersion(version?: string): SamCliVersionValidation {
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
}

export class DefaultSamCliValidator extends BaseSamCliValidator {

    public constructor(
        private readonly samCliConfiguration: SamCliConfiguration,
        private readonly invoker: SamCliProcessInvoker
    ) {
        super()
    }

    protected async getSamCliStat(samCliLocation: string): Promise<Stats> {
        return stat(samCliLocation)
    }

    protected getSamCliLocation(): string | undefined {
        return this.samCliConfiguration.getSamCliLocation()
    }

    protected async getInfo(samCliLocation: string): Promise<SamCliInfoResponse> {
        const samCliInfo = new SamCliInfoInvocation(this.invoker)

        return await samCliInfo.execute()
    }
}

// todo : CC : Move notification to separate file
function makeSamCliValidationNotification(
    samCliValidationError: InvalidSamCliError
): SamCliValidationNotification {
    if (samCliValidationError instanceof SamCliNotFoundError) {
        // TODO : CC : Message
        return new DefaultSamCliValidationNotification(
            'not found - get sam cli',
            [makeActionGoToSamCli({})],
        )
    } else if (samCliValidationError instanceof InvalidSamCliVersionError) {
        return new DefaultSamCliValidationNotification(
            makeVersionValidationNotificationText(samCliValidationError.versionValidation),
            makeVersionValidationActions(samCliValidationError.versionValidation.validation),
        )
    } else {
        // TODO : CC : Message
        return new DefaultSamCliValidationNotification(
            `Unexpected issue: ${samCliValidationError.message}`,
            []
        )
    }
}

function makeVersionValidationNotificationText(validationResult: SamCliVersionValidatorResult): string {
    const recommendation: string =
        validationResult.validation === SamCliVersionValidation.VersionTooHigh ?
            RECOMMENDATION_UPDATE_TOOLKIT : RECOMMENDATION_UPDATE_SAM_CLI

    return localize(
        'AWS.samcli.notification.version.invalid',
        'Your SAM CLI version {0} does not meet requirements ({1}\u00a0\u2264\u00a0version\u00a0<\u00a0{2}). {3}',
        validationResult.version,
        MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
        MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE,
        recommendation
    )
}

function makeVersionValidationActions(validation: SamCliVersionValidation): SamCliValidationNotificationAction[] {
    const actions: SamCliValidationNotificationAction[] = []

    if (validation === SamCliVersionValidation.VersionTooHigh) {
        actions.push(makeActionGoToVsCodeMarketplace({}))
    } else {
        actions.push(makeActionGoToSamCli({}))
    }

    return actions
}

export async function notifySamCliValidation(samCliValidationError: InvalidSamCliError): Promise<void> {
    const notification: SamCliValidationNotification = makeSamCliValidationNotification(samCliValidationError)

    await notification.show()
}

export interface SamCliValidationNotificationAction {
    label: string
    invoke(): Promise<void>
}

function makeActionGoToSamCli(
    {
        openExternal = vscode.env.openExternal
    }: {
        openExternal?: typeof vscode.env.openExternal
    }
): SamCliValidationNotificationAction {
    const action: SamCliValidationNotificationAction = {
        label: ACTION_GO_TO_SAM_CLI_PAGE,
        invoke: async () => {
            await openExternal(vscode.Uri.parse(samAboutInstallUrl))
        }
    }

    return action
}

function makeActionGoToVsCodeMarketplace(
    {
        openExternal = vscode.env.openExternal
    }: {
        openExternal?: typeof vscode.env.openExternal
    }
): SamCliValidationNotificationAction {
    // TODO : Bring up marketplace panel showing the toolkit page instead
    const action: SamCliValidationNotificationAction = {
        label: ACTION_GO_TO_AWS_TOOLKIT_PAGE,
        invoke: async () => {
            await openExternal(vscode.Uri.parse(vscodeMarketplaceUrl))
        }
    }

    return action
}

export interface SamCliValidationNotification {
    show(): Promise<void>
}

class DefaultSamCliValidationNotification implements SamCliValidationNotification {
    public constructor(
        private readonly message: string,
        private readonly actions: SamCliValidationNotificationAction[]
    ) {

    }

    public async show(): Promise<void> {
        const userResponse: string | undefined = await vscode.window.showErrorMessage(
            this.message,
            ...this.actions.map(action => action.label),
        )

        if (userResponse) {
            const responseActions: Promise<void>[] = this.actions
                .filter(action => action.label === userResponse)
                .map(async action => action.invoke())

            await Promise.all(responseActions)
        }
    }
}
