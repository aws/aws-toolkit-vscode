/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as semver from 'semver'
import { Runtime } from 'aws-sdk/clients/lambda'
import { Set as ImmutableSet } from 'immutable'
import { supportsEventBridgeTemplates } from '../../../src/eventSchemas/models/schemaCodeLangs'
import { RuntimePackageType } from './samLambdaRuntime'
import { getIdeProperties } from '../../shared/extensionUtilities'

export const helloWorldTemplate = localize('AWS.samcli.initWizard.template.helloWorld.name', '{0} SAM Hello World', getIdeProperties().company)
export const eventBridgeHelloWorldTemplate = localize('AWS.samcli.initWizard.template.helloWorld.name', '{0} SAM EventBridge Hello World', getIdeProperties().company)
export const eventBridgeStarterAppTemplate = localize('AWS.samcli.initWizard.template.helloWorld.name', '{0} SAM EventBridge App from Scratch', getIdeProperties().company)
export const stepFunctionsSampleApp = localize('AWS.samcli.initWizard.template.helloWorld.name', '{0} Step Functions Sample App', getIdeProperties().company)
export const repromptUserForTemplate = 'REQUIRES_AWS_CREDENTIALS_REPROMPT_USER_FOR_TEMPLATE'

export const CLI_VERSION_STEP_FUNCTIONS_TEMPLATE = '0.52.0'

export type SamTemplate =
    | typeof helloWorldTemplate
    | typeof eventBridgeHelloWorldTemplate
    | typeof eventBridgeStarterAppTemplate
    | typeof stepFunctionsSampleApp
    | 'REQUIRES_AWS_CREDENTIALS_REPROMPT_USER_FOR_TEMPLATE'

export function getSamTemplateWizardOption(
    runtime: Runtime,
    packageType: RuntimePackageType,
    samCliVersion: string
): ImmutableSet<SamTemplate> {
    const templateOptions = Array<SamTemplate>(helloWorldTemplate)

    if (packageType === 'Image') {
        // only supports hello world for now
        return ImmutableSet<SamTemplate>(templateOptions)
    }

    if (supportsEventBridgeTemplates(runtime)) {
        templateOptions.push(eventBridgeHelloWorldTemplate, eventBridgeStarterAppTemplate)
    }

    if (supportsStepFuntionsTemplate(samCliVersion)) {
        templateOptions.push(stepFunctionsSampleApp)
    }

    return ImmutableSet<SamTemplate>(templateOptions)
}

export function getSamCliTemplateParameter(templateSelected: SamTemplate): string {
    switch (templateSelected) {
        case helloWorldTemplate:
            return 'hello-world'
        case eventBridgeHelloWorldTemplate:
            return 'eventBridge-hello-world'
        case eventBridgeStarterAppTemplate:
            return 'eventBridge-schema-app'
        case stepFunctionsSampleApp:
            return 'step-functions-sample-app'
        default:
            throw new Error(`${templateSelected} is not valid sam template`)
    }
}

export function getTemplateDescription(template: SamTemplate): string {
    switch (template) {
        case helloWorldTemplate:
            return localize('AWS.samcli.initWizard.template.helloWorld.description', 'A basic SAM app')
        case eventBridgeHelloWorldTemplate:
            return localize(
                'AWS.samcli.initWizard.template.eventBridge_helloWorld.description',
                'Invokes a Lambda for every EC2 instance state change in your account'
            )
        case eventBridgeStarterAppTemplate:
            return localize(
                'AWS.samcli.initWizard.template.eventBridge_starterApp.description',
                'Invokes a Lambda based on a dynamic event trigger for an EventBridge Schema of your choice'
            )
        case stepFunctionsSampleApp:
            return localize(
                'AWS.samcli.initWizard.template.stepFunctionsSampleApp.description',
                'Orchestrates multiple Lambdas to execute a stock trading workflow on an hourly schedule'
            )
        default:
            throw new Error(`No description found for template ${template}`)
    }
}

export function supportsStepFuntionsTemplate(samCliVersion: string): boolean {
    if (!samCliVersion) {
        return false
    }
    return semver.gte(samCliVersion, CLI_VERSION_STEP_FUNCTIONS_TEMPLATE)
}
