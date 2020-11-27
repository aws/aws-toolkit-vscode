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

export const helloWorldTemplate = 'AWS SAM Hello World'
export const eventBridgeHelloWorldTemplate = 'AWS SAM EventBridge Hello World'
export const eventBridgeStarterAppTemplate = 'AWS SAM EventBridge App from Scratch'
export const stepFunctionsSampleApp = 'AWS Step Functions Sample App'
export const repromptUserForTemplate = 'REQUIRES_AWS_CREDENTIALS_REPROMPT_USER_FOR_TEMPLATE'

export const CLI_VERSION_STEP_FUNCTIONS_TEMPLATE = '0.52.0'

export type SamTemplate =
    | 'AWS SAM Hello World'
    | 'AWS SAM EventBridge Hello World'
    | 'AWS SAM EventBridge App from Scratch'
    | 'AWS Step Functions Sample App'
    | 'REQUIRES_AWS_CREDENTIALS_REPROMPT_USER_FOR_TEMPLATE'

export function getSamTemplateWizardOption(runtime: Runtime, samCliVersion: string): ImmutableSet<SamTemplate> {
    let templateOptions: Array<SamTemplate> = Array<SamTemplate>(helloWorldTemplate)

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
