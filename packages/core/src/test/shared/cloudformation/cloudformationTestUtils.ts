/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFile } from 'fs-extra'

import * as CloudFormation from '../../../shared/cloudformation/cloudformation'

export function createBaseTemplate(): CloudFormation.Template {
    return {
        Globals: {
            Function: {
                Timeout: 5,
            },
        },
        Resources: {
            TestResource: createBaseResource(),
        },
    }
}

export function createBaseImageTemplate(): CloudFormation.Template {
    return {
        Globals: {
            Function: {
                Timeout: 5,
            },
        },
        Resources: {
            TestResource: createBaseImageResource(),
        },
    }
}

export function createBaseResource(): CloudFormation.Resource {
    return {
        Type: CloudFormation.SERVERLESS_FUNCTION_TYPE,
        Properties: {
            Handler: 'handler',
            CodeUri: '/',
            Runtime: 'nodejs12.x',
            Timeout: 12345,
            Architectures: ['x86_64'],
            Environment: {
                Variables: {
                    ENVVAR: 'envvar',
                },
            },
        },
    }
}

export function createBaseImageResource(): CloudFormation.Resource {
    return {
        Type: CloudFormation.SERVERLESS_FUNCTION_TYPE,
        Properties: {
            PackageType: 'Image',
            Timeout: 12345,
            Environment: {
                Variables: {
                    ENVVAR: 'envvar',
                },
            },
        },
    }
}

export async function strToYamlFile(str: string, file: string): Promise<void> {
    await writeFile(file, str, 'utf8')
}

export function makeSampleSamTemplateYaml(
    addGlobalsSection: boolean,
    subValues: {
        resourceName?: string
        resourceType?: string
        runtime?: string
        handler?: string
        codeUri?: string
    } = {},
    parameters?: string
): string {
    const globalsYaml = `
Globals:
    Function:
        Timeout: 5`

    return `${addGlobalsSection ? globalsYaml : ''}
Resources:${makeSampleYamlResource(subValues)}${parameters ? `\nParameters:\n${parameters}` : ''}`
}

export function makeSampleYamlResource(
    subValues: {
        resourceName?: string
        resourceType?: string
        runtime?: string
        handler?: string
        codeUri?: string
    } = {}
): string {
    return `
    ${subValues.resourceName ? subValues.resourceName : 'TestResource'}:
        Type: ${subValues.resourceType ? subValues.resourceType : CloudFormation.SERVERLESS_FUNCTION_TYPE}
        Properties:
            Handler: ${subValues.handler ? subValues.handler : 'handler'}
            CodeUri: ${subValues.codeUri ? subValues.codeUri : '/'}
            Runtime: ${subValues.runtime ? subValues.runtime : 'nodejs12.x'}
            Timeout: 12345
            Architectures:
                - x86_64
            Environment:
                Variables:
                    ENVVAR: envvar`
}

export function makeSampleYamlParameters(params: { [key: string]: CloudFormation.Parameter | undefined }): string {
    const returnVals: string[] = []
    for (const paramKey of Object.keys(params)) {
        const param = params[paramKey]
        if (param) {
            const paramStr = `
    ${paramKey}:
        Type: ${param.Type}
        ${param.AllowedPattern ? `AllowedPattern: ${param.AllowedPattern}` : ''}
        ${param.AllowValues ? `AllowedValues:\n              - ${param.AllowValues.join('\n              - ')}` : ''}
        ${param.ConstraintDescription ? `ConstraintDescription: ${param.ConstraintDescription}` : ''}
        ${param.Default ? `Default: ${param.Default.toString()}` : ''}
        ${param.Description ? `Description: ${param.Description}` : ''}
        ${param.MaxLength ? `MaxLength: ${param.MaxLength.toString()}` : ''}
        ${param.MaxValue ? `MaxValue: ${param.MaxValue.toString()}` : ''}
        ${param.MinLength ? `MinLength: ${param.MinLength.toString()}` : ''}
        ${param.MinValue ? `MinValue: ${param.MinValue.toString()}` : ''}
        ${param.NoEcho ? `NoEcho: ${param.NoEcho.toString()}` : ''}
`
            returnVals.push(paramStr)
        }
    }

    return returnVals.join('\n')
}

export const badYaml = '{ASD}ASD{asd}ASD:asd'
