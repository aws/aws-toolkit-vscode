/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

export let helloWorldTemplate = 'helloWorldUninitialized'
export let eventBridgeHelloWorldTemplate = 'eventBridgeHelloWorldUninitialized'
export let eventBridgeStarterAppTemplate = 'eventBridgeStarterAppUnintialized'
export let stepFunctionsSampleApp = 'stepFunctionsSampleAppUnintialized'
export const typeScriptBackendTemplate = 'App Backend using TypeScript'
export const repromptUserForTemplate = 'REQUIRES_AWS_CREDENTIALS_REPROMPT_USER_FOR_TEMPLATE'

export const cliVersionStepFunctionsTemplate = '0.52.0'

export type SamTemplate = string

/**
 * Lazy load strings for SAM template quick picks
 * Need to be lazyloaded as `getIdeProperties` requires IDE activation for Cloud9
 */
export function lazyLoadSamTemplateStrings(): void {
    helloWorldTemplate = localize(
        'AWS.samcli.initWizard.template.helloWorld.name',
        '{0} SAM Hello World',
        getIdeProperties().company
    )
    eventBridgeHelloWorldTemplate = localize(
        'AWS.samcli.initWizard.template.helloWorld.name',
        '{0} SAM EventBridge Hello World',
        getIdeProperties().company
    )
    eventBridgeStarterAppTemplate = localize(
        'AWS.samcli.initWizard.template.helloWorld.name',
        '{0} SAM EventBridge App from Scratch',
        getIdeProperties().company
    )
    stepFunctionsSampleApp = localize(
        'AWS.samcli.initWizard.template.helloWorld.name',
        '{0} Step Functions Sample App',
        getIdeProperties().company
    )
}

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

    if (supportsTypeScriptBackendTemplate(runtime)) {
        templateOptions.push(typeScriptBackendTemplate)
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
        case typeScriptBackendTemplate:
            return 'quick-start-typescript-app'
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
        case typeScriptBackendTemplate:
            return localize(
                'AWS.samcli.initWizard.template.typeScriptBackendTemplate.description',
                'A sample TypeScript backend app with Lambda and DynamoDB'
            )
        default:
            throw new Error(`No description found for template ${template}`)
    }
}

export function supportsStepFuntionsTemplate(samCliVersion: string): boolean {
    if (!samCliVersion) {
        return false
    }
    return semver.gte(samCliVersion, cliVersionStepFunctionsTemplate)
}

export function supportsTypeScriptBackendTemplate(runtime: Runtime): boolean {
    return runtime === 'nodejs16.x'
}
