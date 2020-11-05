/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirp, writeFile } from 'fs-extra'
import * as yaml from 'js-yaml'
import * as path from 'path'
import * as filesystemUtilities from '../../../shared/filesystemUtilities'
import { CloudFormation } from '../../cloudformation/cloudformation'

export class SamTemplateGenerator {
    private resourceName?: string
    private templateResources?: CloudFormation.TemplateResources
    private readonly properties: Partial<CloudFormation.ResourceProperties> = {}
    private globals: CloudFormation.TemplateGlobals | undefined
    private parameters:
        | {
              [key: string]: CloudFormation.Parameter | undefined
          }
        | undefined

    public constructor(private readonly originalTemplate?: CloudFormation.Template) {}

    public withResourceName(resourceName: string): SamTemplateGenerator {
        this.resourceName = resourceName

        return this
    }

    public withTemplateResources(templateResources: CloudFormation.TemplateResources) {
        this.templateResources = templateResources

        return this
    }

    public withFunctionHandler(handlerName: string | CloudFormation.Ref): SamTemplateGenerator {
        this.properties.Handler = handlerName

        return this
    }

    public withCodeUri(codeUri: string | CloudFormation.Ref): SamTemplateGenerator {
        this.properties.CodeUri = codeUri

        return this
    }

    public withRuntime(runtime: string | CloudFormation.Ref): SamTemplateGenerator {
        this.properties.Runtime = runtime

        return this
    }

    public withMemorySize(memorySize: number | CloudFormation.Ref): SamTemplateGenerator {
        this.properties.MemorySize = memorySize

        return this
    }

    public withTimeout(timeout: number | CloudFormation.Ref): SamTemplateGenerator {
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

    public withParameters(parameters: { [key: string]: CloudFormation.Parameter | undefined }): SamTemplateGenerator {
        this.parameters = parameters

        return this
    }

    public async generate(filename: string): Promise<void> {
        if (!this.resourceName && !this.templateResources) {
            throw new Error('Missing value: at least one of ResourceName or TemplateResources')
        }

        const templateAdditions: CloudFormation.Template = {
            Resources: {
                ...this.templateResources,
            },
        }

        if (this.resourceName) {
            templateAdditions.Resources = {
                ...templateAdditions.Resources,
                [this.resourceName]: {
                    Type: CloudFormation.SERVERLESS_FUNCTION_TYPE,
                    Properties: CloudFormation.validateProperties(this.properties),
                },
            }
        }

        if (this.globals) {
            templateAdditions.Globals = this.globals
        }

        if (this.parameters) {
            templateAdditions.Parameters = this.parameters
        }

        const template: CloudFormation.Template = {
            ...this.originalTemplate,
            ...templateAdditions,
        }

        const templateAsYaml: string = yaml.safeDump(template, { skipInvalid: true })

        const parentDirectory: string = path.dirname(filename)
        if (!(await filesystemUtilities.fileExists(parentDirectory))) {
            await mkdirp(parentDirectory)
        }
        await writeFile(filename, templateAsYaml, 'utf8')
    }
}
