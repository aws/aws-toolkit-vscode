/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as schema from 'cloudformation-schema-js-yaml'
import * as yaml from 'js-yaml'
import * as filesystem from '../filesystem'
import * as filesystemUtilities from '../filesystemUtilities'
import { SystemUtilities } from '../systemUtilities'

export namespace CloudFormation {

    export interface Resource {
        Type: string,
        Properties?: {
            Handler: string,
            CodeUri: string,
            Runtime?: string,
            Timeout?: number,
            Environment?: Environment
        }
    }

    export interface Template {
        Resources?: {
            [key: string]: Resource
        }
    }

    export interface Environment {
        Variables?: {
            [varName: string]: string
        }
    }

    export async function load(filename: string): Promise<Template> {

        if (!await SystemUtilities.fileExists(filename)) {
            throw new Error(`Template file not found: ${filename}`)
        }

        const templateAsYaml: string = await filesystemUtilities.readFileAsString(filename)
        const template = yaml.safeLoad(
            templateAsYaml,
            {
                schema: schema as yaml.SchemaDefinition
            }
        ) as Template
        validateTemplate(template)

        return template
    }

    export async function save(template: Template, filename: string): Promise<void> {
        const templateAsYaml: string = yaml.safeDump(template)

        await filesystem.writeFile(filename, templateAsYaml, 'utf8')
    }

    export function validateTemplate(template: Template): void {
        if (!!template.Resources) {
            for (const resource in template.Resources) {
                if (typeof resource === 'string') {
                    validateResource(template.Resources[resource])
                }
            }
        }

    }

    export function validateResource(resource: Resource): void {
        if (!resource.Type) {
            throw new Error('Missing or invalid value in Template for key: Type')
        }
        if (!!resource.Properties) {
            if (!resource.Properties.Handler || typeof resource.Properties.Handler !== 'string') {
                throw new Error('Missing or invalid value in Template for key: Handler')
            }
            if (!resource.Properties.CodeUri || typeof resource.Properties.CodeUri !== 'string') {
                throw new Error('Missing or invalid value in Template for key: CodeUri')
            }
            if (!!resource.Properties.Runtime && typeof resource.Properties.Runtime !== 'string') {
                throw new Error('Invalid value in Template for key: Runtime')
            }
            if (!!resource.Properties.Timeout && typeof resource.Properties.Timeout !== 'number') {
                throw new Error('Invalid value in Template for key: Timeout')
            }
            if (!!resource.Properties.Environment && !!resource.Properties.Environment.Variables) {
                for (const variable in resource.Properties.Environment.Variables) {
                    if (typeof resource.Properties.Environment.Variables[variable] !== 'string') {
                        throw new Error(`Invalid value in Template for key: ${variable}: expected string`)
                    }
                }
            }
        }
    }

}
