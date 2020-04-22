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

export interface ReadonlyJsonObject {
    readonly [key: string]: string | number | boolean
}

export function isAwsSamDebugConfiguration(config: vscode.DebugConfiguration): config is AwsSamDebuggerConfiguration {
    return config.type === AWS_SAM_DEBUG_TYPE
}

export function isTemplateTargetProperties(props: TargetProperties): props is TemplateTargetProperties {
    return props.target === TEMPLATE_TARGET_TYPE
}

export function isCodeTargetProperties(props: TargetProperties): props is CodeTargetProperties {
    return props.target === CODE_TARGET_TYPE
}

// /**
//  * let response: Partial<AwsSamDebuggerConfiguration> = {
//         type: AWS_SAM_DEBUG_TYPE,
//         request: DIRECT_INVOKE_TYPE,
//         name: resourceName,
//         invokeTarget: {
//             target: TEMPLATE_TARGET_TYPE,
//             samTemplatePath: templatePath,
//             samTemplateResource: resourceName,
//         },
//     }
//  */

// export function createAwsSamDebugConfig(
//     resourceName: string,
//     requestType: string,
//     targetProperties: TemplateTargetProperties | CodeTargetProperties,
//     additionalParams: any
// ): AwsSamDebuggerConfiguration {
//     const baseConfig: Pick<AwsSamDebuggerConfiguration, 'type' | 'name' | 'request'> = {
//         type: AWS_SAM_DEBUG_TYPE,
//         name: resourceName,
//         request: ''
//     }

//     if (requestType === DIRECT_INVOKE_TYPE) {
//         baseConfig.request = DIRECT_INVOKE_TYPE
//         if (targetProperties.target === TEMPLATE_TARGET_TYPE) {
//             return {
//                 ...baseConfig,
//                 ...addTemplateToAwsSamDebugConfig(additionalParams)
//             }
//         } else if (targetProperties.target === CODE_TARGET_TYPE) {
//             // implement
//         }
//     }

//     throw new Error ('Unrecognized or unimplemented debug configuration parameters')
// }

// function addTemplateToAwsSamDebugConfig(
//     params: {
//         templatePath: string
//         resourceName: string
//         eventJson?: ReadonlyJsonObject
//         environmentVariables?: ReadonlyJsonObject
//         dockerNetwork?: string
//         useContainer?: boolean
//     }
// ): Pick<AwsSamDebuggerConfiguration, 'invokeTarget' | 'lambda' | 'sam'> {
//     const invokeTarget: TemplateTargetProperties = {
//         target: TEMPLATE_TARGET_TYPE,
//         samTemplatePath: params.templatePath,
//         samTemplateResource: params.resourceName,
//     }

//     let addition: Partial<AwsSamDebuggerConfiguration> = {
//         lambda: undefined,
//         sam: undefined
//     }

//     if (params.eventJson) {
//         addition = {
//             ...addition,
//             lambda: {
//                 event: {
//                     json: params.eventJson,
//                 },
//             },
//         }
//     }
//     if (params.environmentVariables) {
//         addition = {
//             ...addition,
//             lambda: {
//                 ...addition.lambda,
//                 environmentVariables: params.environmentVariables,
//             },
//         }
//     }
//     if (params.dockerNetwork) {
//         addition = {
//             ...addition,
//             sam: {
//                 dockerNetwork: params.dockerNetwork,
//             },
//         }
//     }
//     if (params.useContainer) {
//         addition = {
//             ...addition,
//             sam: {
//                 ...addition.sam,
//                 containerBuild: params.useContainer,
//             },
//         }
//     }
//     return {
//         invokeTarget,
//         ...addition,
//     }
// }
export function createTemplateAwsSamDebugConfig(
    resourceName: string,
    templatePath: string,
    preloadedConfig?: {
        eventJson?: ReadonlyJsonObject
        environmentVariables?: ReadonlyJsonObject
        dockerNetwork?: string
        useContainer?: boolean
    }
): AwsSamDebuggerConfiguration {
    const response: AwsSamDebuggerConfiguration = {
        type: AWS_SAM_DEBUG_TYPE,
        request: DIRECT_INVOKE_TYPE,
        name: resourceName,
        invokeTarget: {
            target: TEMPLATE_TARGET_TYPE,
            samTemplatePath: templatePath,
            samTemplateResource: resourceName,
        },
    }

    if (preloadedConfig) {
        return {
            ...response,
            lambda:
                preloadedConfig.environmentVariables || preloadedConfig.eventJson
                    ? {
                          event: preloadedConfig.eventJson
                              ? {
                                    json: preloadedConfig.eventJson,
                                }
                              : undefined,
                          environmentVariables: preloadedConfig.environmentVariables,
                      }
                    : undefined,
            sam:
                preloadedConfig.dockerNetwork || preloadedConfig.useContainer
                    ? {
                          dockerNetwork: preloadedConfig.dockerNetwork,
                          containerBuild: preloadedConfig.useContainer,
                      }
                    : undefined,
        }
    }

    return response
}
