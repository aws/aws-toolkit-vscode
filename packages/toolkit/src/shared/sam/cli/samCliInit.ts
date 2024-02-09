/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Runtime } from 'aws-sdk/clients/lambda'
import { SchemaTemplateExtraContext } from '../../../eventSchemas/templates/schemasAppTemplateUtils'
import { Architecture, DependencyManager } from '../../../lambda/models/samLambdaRuntime'
import { getSamCliTemplateParameter, SamTemplate } from '../../../lambda/models/samTemplates'
import { SamCliContext } from './samCliContext'
import { logAndThrowIfUnexpectedExitCode } from './samCliInvokerUtils'

export interface SamCliInitArgs {
    name: string
    location: string
    dependencyManager: DependencyManager
    extraContent?: SchemaTemplateExtraContext
    template?: SamTemplate
    // zip-based lambdas; mutually exclusive with baseImage
    runtime?: Runtime
    // image-based lambdas; mutually exclusive with runtime
    baseImage?: string
    architecture?: Architecture
}

export async function runSamCliInit(initArguments: SamCliInitArgs, context: SamCliContext): Promise<void> {
    const args = [
        'init',
        '--name',
        initArguments.name,
        '--no-interactive',
        '--dependency-manager',
        initArguments.dependencyManager,
    ]

    if (initArguments.runtime) {
        args.push('--runtime', initArguments.runtime)
    }

    if (initArguments.template) {
        args.push('--app-template', getSamCliTemplateParameter(initArguments.template))
    }

    if (initArguments.architecture) {
        args.push('--architecture', initArguments.architecture)
    }

    if (initArguments.baseImage) {
        // specifying baseImage implies a packageType of image
        args.push('--package-type', 'Image')
        args.push('--base-image', initArguments.baseImage)
        // TODO: Allow users to select app template for base image
        args.push('--app-template', 'hello-world-lambda-image')
    }

    if (initArguments.extraContent!) {
        args.push('--extra-context', JSON.stringify(initArguments.extraContent))
    }

    const childProcessResult = await context.invoker.invoke({
        spawnOptions: { cwd: initArguments.location },
        arguments: args,
    })

    logAndThrowIfUnexpectedExitCode(childProcessResult, 0)
}
