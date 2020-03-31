/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFile } from 'fs-extra'
import * as yaml from 'js-yaml'
import * as path from 'path'
import { mkdir } from '../../../shared/filesystem'
import * as filesystemUtilities from '../../../shared/filesystemUtilities'
import { CloudFormation } from '../../cloudformation/cloudformation'

export class SamTemplateGenerator {
    private resourceName?: string
    private readonly properties: Partial<CloudFormation.ResourceProperties> = {}
    private globals: CloudFormation.TemplateGlobals | undefined

    public withResourceName(resourceName: string): SamTemplateGenerator {
        this.resourceName = resourceName

        return this
    }

    public withFunctionHandler(handlerName: string): SamTemplateGenerator {
        this.properties.Handler = handlerName

        return this
    }

    public withCodeUri(codeUri: string): SamTemplateGenerator {
        this.properties.CodeUri = codeUri

        return this
    }

    public withRuntime(runtime: string): SamTemplateGenerator {
        this.properties.Runtime = runtime

        return this
    }

    public withMemorySize(memorySize: number): SamTemplateGenerator {
        this.properties.MemorySize = memorySize

        return this
    }

    public withTimeout(timeout: number): SamTemplateGenerator {
        this.properties.Timeout = timeout

        return this
    }

    public withEnvironment(env: CloudFormation.Environment): SamTemplateGenerator {
        this.properties.Environment = env

        return this
    }

    public withGlobals(globals: CloudFormation.TemplateGlobals): SamTemplateGenerator {
        this.globals = globals

        return this
    }

    public async generate(filename: string): Promise<void> {
        if (!this.resourceName) {
            throw new Error('Missing value: ResourceName')
        }

        const template: CloudFormation.Template = {
            Resources: {
                [this.resourceName!]: {
                    Type: CloudFormation.SERVERLESS_FUNCTION_TYPE,
                    Properties: CloudFormation.validateProperties(this.properties),
                },
            },
        }

        if (this.globals) {
            template.Globals = this.globals
        }

        const templateAsYaml: string = yaml.safeDump(template, { skipInvalid: true })

        const parentDirectory: string = path.dirname(filename)
        if (!(await filesystemUtilities.fileExists(parentDirectory))) {
            await mkdir(parentDirectory, { recursive: true })
        }
        await writeFile(filename, templateAsYaml, 'utf8')
    }
}
