/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    AwsSamDebuggerConfiguration,
    CodeTargetProperties,
    TemplateTargetProperties,
} from './awsSamDebugConfiguration.gen'

export * from './awsSamDebugConfiguration.gen'

export const AWS_SAM_DEBUG_TYPE = 'aws-sam'
export const DIRECT_INVOKE_TYPE = 'direct-invoke'
export const TEMPLATE_TARGET_TYPE: 'template' = 'template'
export const CODE_TARGET_TYPE: 'code' = 'code'
export const AWS_SAM_DEBUG_REQUEST_TYPES = [DIRECT_INVOKE_TYPE]
export const AWS_SAM_DEBUG_TARGET_TYPES = [TEMPLATE_TARGET_TYPE, CODE_TARGET_TYPE]

export type TargetProperties = AwsSamDebuggerConfiguration['invokeTarget']

export function isAwsSamDebugConfiguration(config: vscode.DebugConfiguration): config is AwsSamDebuggerConfiguration {
    return config.type === AWS_SAM_DEBUG_TYPE
}

export function isTemplateTargetProperties(props: TargetProperties): props is TemplateTargetProperties {
    return props.target === TEMPLATE_TARGET_TYPE
}

export function isCodeTargetProperties(props: TargetProperties): props is CodeTargetProperties {
    return props.target === CODE_TARGET_TYPE
}

export function createAwsSamDebugConfigurationForTemplate(
    resourceName: string,
    templatePath: string
): AwsSamDebuggerConfiguration {
    return {
        type: AWS_SAM_DEBUG_TYPE,
        request: DIRECT_INVOKE_TYPE,
        name: resourceName,
        invokeTarget: {
            target: TEMPLATE_TARGET_TYPE,
            samTemplateResource: resourceName,
            samTemplatePath: templatePath,
        },
    }
}
