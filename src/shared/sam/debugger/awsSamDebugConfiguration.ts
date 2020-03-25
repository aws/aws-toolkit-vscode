/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvokeTargetProperties } from './awsSamDebugConfiguration.gen'

export interface AwsSamDebuggerInvokeTargetCodeFields extends InvokeTargetProperties {
    readonly target: 'code'
    readonly lambdaHandler: string
    readonly projectRoot: string
}

export interface AwsSamDebuggerInvokeTargetTemplateFields extends InvokeTargetProperties {
    readonly target: 'template'
    readonly samTemplatePath: string
    readonly samTemplateResource: string
}
