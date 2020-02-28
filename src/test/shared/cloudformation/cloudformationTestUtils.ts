/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFile } from 'fs-extra'
import * as vscode from 'vscode'

import { CloudFormation } from '../../../shared/cloudformation/cloudformation'
import { CloudFormationTemplateRegistry } from '../../../shared/cloudformation/templateRegistry'

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

export function makeSampleSamTemplateYaml (addGlobalsSection: boolean): string {
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

export class FakeRegistry implements CloudFormationTemplateRegistry {
    public constructor(private readonly preloadedMap:  Map<string, CloudFormation.Template> = new Map<string, CloudFormation.Template>()) {}

    public get registeredTemplates() { return this.preloadedMap }

    public getRegisteredTemplate(templatePath: string) {
        return this.preloadedMap.get(templatePath)
    }

    public async addTemplateToTemplateData(templatePath: vscode.Uri) {
        console.error('not implemented')
    }

    public async removeTemplateFromRegistry(templatePath: vscode.Uri) {
        console.error('not implemented')
    }
}
