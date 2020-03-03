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
                Timeout: 5
            }
        },
        Resources: {
            TestResource: createBaseResource()
        }
    }
}

export function createBaseResource(): CloudFormation.Resource {
    return {
        Type: CloudFormation.SERVERLESS_FUNCTION_TYPE,
        Properties: {
            Handler: 'handler',
            CodeUri: 'codeuri',
            Runtime: 'runtime',
            Timeout: 12345,
            Environment: {
                Variables: {
                    ENVVAR: 'envvar'
                }
            }
        }
    }
}

export async function strToYamlFile(str: string, file: string): Promise<void> {
    await writeFile(file, str, 'utf8')
}

export function makeSampleSamTemplateYaml(addGlobalsSection: boolean): string {
    const globalsYaml = `
Globals:
    Function:
        Timeout: 5`

    return `${addGlobalsSection ? globalsYaml : ''}
Resources:
    TestResource:
        Type: ${CloudFormation.SERVERLESS_FUNCTION_TYPE}
        Properties:
            Handler: handler
            CodeUri: codeuri
            Runtime: runtime
            Timeout: 12345
            Environment:
                Variables:
                    ENVVAR: envvar`
}

export const badYaml = '{ASD}ASD{asd}ASD:asd'
