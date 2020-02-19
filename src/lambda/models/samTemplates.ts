/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { Runtime } from 'aws-sdk/clients/lambda'
import { Set } from 'immutable'
import { supportsEventBridgeTemplates } from '../../../src/eventSchemas/models/schemaCodeLangs'

export const helloWorldTemplate = 'AWS SAM Hello World'
export const eventBridgeHelloWorldTemplate = 'AWS SAM EventBridge Hello World'
export const eventBridgeStarterAppTemplate = 'AWS SAM EventBridge App from Scratch'
export const repromptUserForTemplate = 'REQUIRES_AWS_CREDENTIALS_REPROMPT_USER_FOR_TEMPLATE'

export type SamTemplate =
    | 'AWS SAM Hello World'
    | 'AWS SAM EventBridge Hello World'
    | 'AWS SAM EventBridge App from Scratch'
    | 'REQUIRES_AWS_CREDENTIALS_REPROMPT_USER_FOR_TEMPLATE'

export const validTemplateOptions: Set<SamTemplate> = Set<SamTemplate>([
    helloWorldTemplate,
    eventBridgeHelloWorldTemplate,
    eventBridgeStarterAppTemplate
])

export const helloWorldOption: Set<SamTemplate> = Set<SamTemplate>([helloWorldTemplate])

export function getSamTemplateWizardOption(runtime: Runtime): Set<SamTemplate> {
    if (supportsEventBridgeTemplates(runtime)) {
        return validTemplateOptions
    }

    return helloWorldOption
}

export function getSamCliTemplateParameter(templateSelected: SamTemplate): string {
    switch (templateSelected) {
        case helloWorldTemplate:
            return 'hello-world'
        case eventBridgeHelloWorldTemplate:
            return 'eventBridge-hello-world'
        case eventBridgeStarterAppTemplate:
            return 'eventBridge-schema-app'
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
        default:
            throw new Error(`No description found for template ${template}`)
    }
}
