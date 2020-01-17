/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Runtime } from 'aws-sdk/clients/lambda'
import { Set } from 'immutable'

export const helloWorldTemplate = 'AWS SAM Hello World'
export const eventBridgeHelloWorldTemplate = 'AWS SAM EventBridge Hello World'
export const eventBridgeStarterAppTemplate = 'AWS SAM EventBridge App from Scratch'
export const exitWizard = 'USER_RESPONSE_EXIT_WIZARD'

export type SamTemplate =
    | 'AWS SAM Hello World'
    | 'AWS SAM EventBridge Hello World'
    | 'AWS SAM EventBridge App from Scratch'
    | 'USER_RESPONSE_EXIT_WIZARD'

export const validTemplateOptions: Set<SamTemplate> = Set<SamTemplate>([
    helloWorldTemplate,
    eventBridgeHelloWorldTemplate,
    eventBridgeStarterAppTemplate
])

export const helloWorldOption: Set<SamTemplate> = Set<SamTemplate>([helloWorldTemplate])

export function supportsEventBridgeTemplates(runtime: Runtime): boolean {
    return runtime === 'python3.7' || runtime === 'python3.6' || runtime === 'python3.8'
}

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
            throw new Error(`Template ${templateSelected} is not supported for sam application flow`)
    }
}

export function getTemplateDescription(template: SamTemplate): string {
    return template === eventBridgeStarterAppTemplate ? 'You need to be connected to AWS to select this entry' : ''
}
