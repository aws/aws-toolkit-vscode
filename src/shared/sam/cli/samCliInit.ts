/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Runtime } from 'aws-sdk/clients/lambda'
import { SchemaTemplateExtraContext } from '../../../eventSchemas/templates/schemasAppTemplateUtils'
import { DependencyManager } from '../../../lambda/models/samLambdaRuntime'
import { getSamCliTemplateParameter, SamTemplate } from '../../../lambda/models/samTemplates'
import { SamCliContext } from './samCliContext'
import { logAndThrowIfUnexpectedExitCode } from './samCliInvokerUtils'

export interface SamCliInitArgs {
    runtime: Runtime
    template: SamTemplate
    location: string
    name: string
    dependencyManager: DependencyManager
    extraContent?: SchemaTemplateExtraContext
}

export async function runSamCliInit(initArguments: SamCliInitArgs, context: SamCliContext): Promise<void> {
    const args = [
        'init',
        '--name',
        initArguments.name,
        '--runtime',
        initArguments.runtime,
        '--no-interactive',
        '--app-template',
        getSamCliTemplateParameter(initArguments.template),
        '--dependency-manager',
        initArguments.dependencyManager,
    ]

    if (initArguments.extraContent!) {
        args.push('--extra-context', JSON.stringify(initArguments.extraContent))
    }

    const childProcessResult = await context.invoker.invoke({
        spawnOptions: { cwd: initArguments.location },
        arguments: args,
    })

    logAndThrowIfUnexpectedExitCode(childProcessResult, 0)
}
