/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as schema from 'cloudformation-schema-js-yaml'
import * as yaml from 'js-yaml'
import * as filesystem from '../filesystem'
import * as filesystemUtilities from '../filesystemUtilities'

export namespace CloudFormation {

    export interface Resource {
        Type: string,
        Properties?: {
            Handler: string,
            CodeUri: string,
            Runtime?: string,
            Timeout?: number
        }
    }

    export interface Template {
        Resources?: {
            [key: string]: Resource
        }
    }

    export async function load(filename: string): Promise<Template> {
        const templateAsYaml: string = await filesystemUtilities.readFileAsString(filename, 'utf8')

        return yaml.safeLoad(
            templateAsYaml,
            {
                schema: schema as yaml.SchemaDefinition
            }
        ) as Template
    }

    export async function save(template: Template, filename: string): Promise<void> {
        const templateAsYaml: string = yaml.safeDump(template)

        await filesystem.writeFileAsync(filename, templateAsYaml, 'utf8')
    }
}
