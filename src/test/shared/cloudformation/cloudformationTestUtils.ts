/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFile } from 'fs-extra'

import { CloudFormation } from '../../../shared/cloudformation/cloudformation'

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

export function createBaseResource(): CloudFormation.Resource {
    return {
        Type: CloudFormation.SERVERLESS_FUNCTION_TYPE,
        Properties: {
            Handler: 'handler',
            CodeUri: '/',
            Runtime: 'nodejs12.x',
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
    } = {}
): string {
    const globalsYaml = `
Globals:
    Function:
        Timeout: 5`

    return `${addGlobalsSection ? globalsYaml : ''}
Resources:${makeSampleYamlResource(subValues)}`
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
            Environment:
                Variables:
                    ENVVAR: envvar`
}

export const badYaml = '{ASD}ASD{asd}ASD:asd'
