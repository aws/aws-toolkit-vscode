/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as schema from 'cloudformation-schema-js-yaml'
import { writeFile } from 'fs-extra'
import * as yaml from 'js-yaml'
import * as filesystemUtilities from '../filesystemUtilities'
import { SystemUtilities } from '../systemUtilities'
import { getLogger } from '../logger'

export namespace CloudFormation {
    export const SERVERLESS_FUNCTION_TYPE = 'AWS::Serverless::Function'

    export function validateProperties({
        Handler,
        CodeUri,
        Runtime,
        ...rest
    }: Partial<ResourceProperties>): ResourceProperties {
        if (!Handler) {
            throw new Error('Missing value: Handler')
        }

        if (!CodeUri) {
            throw new Error('Missing value: CodeUri')
        }

        if (!Runtime) {
            throw new Error('Missing value: Runtime')
        }

        return {
            Handler,
            CodeUri,
            Runtime,
            ...rest,
        }
    }

    export interface ResourceProperties {
        Handler: string | Ref
        CodeUri: string | Ref
        Runtime?: string | Ref
        MemorySize?: number
        Timeout?: number | Ref
        Environment?: Environment
    }

    interface Ref {
        Ref: string
    }

    export interface Environment {
        Variables?: Variables
    }

    export interface Variables {
        [key: string]: any
    }

    export interface Resource {
        Type: typeof SERVERLESS_FUNCTION_TYPE
        Properties?: ResourceProperties
    }

    // TODO: Can we automatically detect changes to the CFN spec and apply them here?
    // tslint:disable-next-line:max-line-length
    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html#parameters-section-structure-properties
    export type ParameterType =
        | 'String'
        | 'Number'
        | 'List<Number>'
        | 'CommaDelimitedList'
        | AWSSpecificParameterType
        | SSMParameterType

    // tslint:disable-next-line:max-line-length
    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html#aws-specific-parameter-types
    type AWSSpecificParameterType =
        | 'AWS::EC2::AvailabilityZone::Name'
        | 'AWS::EC2::Image::Id'
        | 'AWS::EC2::KeyPair::KeyName'
        | 'AWS::EC2::SecurityGroup::GroupName'
        | 'AWS::EC2::SecurityGroup::Id'
        | 'AWS::EC2::Subnet::Id'
        | 'AWS::EC2::Volume::Id'
        | 'AWS::EC2::VPC::Id'
        | 'AWS::Route53::HostedZone::Id'
        | 'List<AWS::EC2::AvailabilityZone::Name>'
        | 'List<AWS::EC2::Image::Id>'
        | 'List<AWS::EC2::Instance::Id>'
        | 'List<AWS::EC2::SecurityGroup::GroupName>'
        | 'List<AWS::EC2::SecurityGroup::Id>'
        | 'List<AWS::EC2::Subnet::Id>'
        | 'List<AWS::EC2::Volume::Id>'
        | 'List<AWS::EC2::VPC::Id>'
        | 'List<AWS::Route53::HostedZone::Id>'

    // tslint:disable-next-line:max-line-length
    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html#aws-ssm-parameter-types
    type SSMParameterType =
        | 'AWS::SSM::Parameter::Name'
        | 'AWS::SSM::Parameter::Value<String>'
        | 'AWS::SSM::Parameter::Value<List<String>>'
        | 'AWS::SSM::Parameter::Value<CommaDelimitedList>'
        | 'AWS::SSM::Parameter::Value<AWS::EC2::AvailabilityZone::Name>'
        | 'AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>'
        | 'AWS::SSM::Parameter::Value<AWS::EC2::KeyPair::KeyName>'
        | 'AWS::SSM::Parameter::ValueAWS::EC2::SecurityGroup::GroupName<>'
        | 'AWS::SSM::Parameter::Value<AWS::EC2::SecurityGroup::Id>'
        | 'AWS::SSM::Parameter::Value<AWS::EC2::Subnet::Id>'
        | 'AWS::SSM::Parameter::Value<AWS::EC2::Volume::Id>'
        | 'AWS::SSM::Parameter::Value<AWS::EC2::VPC::Id>'
        | 'AWS::SSM::Parameter::Value<AWS::Route53::HostedZone::Id>'
        | 'AWS::SSM::Parameter::Value<List<AWS::EC2::AvailabilityZone::Name>>'
        | 'AWS::SSM::Parameter::Value<List<AWS::EC2::Image::Id>>'
        | 'AWS::SSM::Parameter::Value<List<AWS::EC2::KeyPair::KeyName>>'
        | 'AWS::SSM::Parameter::Value<List<AWS::EC2::SecurityGroup::GroupName>>'
        | 'AWS::SSM::Parameter::Value<List<AWS::EC2::SecurityGroup::Id>>'
        | 'AWS::SSM::Parameter::Value<List<AWS::EC2::Subnet::Id>>'
        | 'AWS::SSM::Parameter::Value<List<AWS::EC2::Volume::Id>>'
        | 'AWS::SSM::Parameter::Value<List<AWS::EC2::VPC::Id>>'
        | 'AWS::SSM::Parameter::Value<List<AWS::Route53::HostedZone::Id>>'

    export interface Parameter {
        Type: ParameterType
        AllowedPattern?: string
        AllowValues?: string[]
        ConstraintDescription?: string
        Default?: any
        Description?: string
        MaxLength?: number
        MaxValue?: number
        MinLength?: number
        MinValue?: number
        NoEcho?: boolean
    }

    export interface Template {
        Parameters?: {
            [key: string]: Parameter | undefined
        }

        Globals?: TemplateGlobals

        Resources?: TemplateResources
    }

    export type TemplateGlobals = any

    export interface TemplateResources {
        [key: string]: Resource | undefined
    }

    export async function load(filename: string): Promise<Template> {
        if (!(await SystemUtilities.fileExists(filename))) {
            throw new Error(`Template file not found: ${filename}`)
        }

        const templateAsYaml: string = await filesystemUtilities.readFileAsString(filename)
        const template = yaml.safeLoad(templateAsYaml, {
            schema: schema as yaml.SchemaDefinition,
        }) as Template
        validateTemplate(template)

        return template
    }

    export async function save(template: Template, filename: string): Promise<void> {
        const templateAsYaml: string = yaml.safeDump(template)

        await writeFile(filename, templateAsYaml, 'utf8')
    }

    export function validateTemplate(template: Template): void {
        if (!template.Resources) {
            return
        }

        const lambdaResources = Object.getOwnPropertyNames(template.Resources)
            .map(key => template.Resources![key]!)
            .filter(resource => resource.Type === SERVERLESS_FUNCTION_TYPE)
            .map(resource => resource as Resource)

        if (lambdaResources.length <= 0) {
            throw new Error('Template does not contain any Lambda resources')
        }

        for (const lambdaResource of lambdaResources) {
            validateResource(lambdaResource, template)
        }
    }

    /**
     * Validates whether or not a property is an expected type.
     * This takes refs into account but doesn't
     * @param resource
     * @param template
     */
    export function validateResource(resource: Resource, template: Template): void {
        if (!resource.Type) {
            throw new Error('Missing or invalid value in Template for key: Type')
        }
        if (!!resource.Properties) {
            if (
                !resource.Properties.Handler ||
                !validatePropertyType(resource.Properties.Handler, 'string', template)
            ) {
                throw new Error('Missing or invalid value in Template for key: Handler')
            }
            if (
                !resource.Properties.CodeUri ||
                !validatePropertyType(resource.Properties.CodeUri, 'string', template)
            ) {
                throw new Error('Missing or invalid value in Template for key: CodeUri')
            }
            if (
                !!resource.Properties.Runtime &&
                !validatePropertyType(resource.Properties.Runtime, 'string', template)
            ) {
                throw new Error('Invalid value in Template for key: Runtime')
            }
            if (
                !!resource.Properties.Timeout &&
                !validatePropertyType(resource.Properties.Timeout, 'number', template)
            ) {
                throw new Error('Invalid value in Template for key: Timeout')
            }
        }
    }

    export function getRuntime(resource: Pick<Resource, 'Properties'>, template: Template): string {
        const properties = resource.Properties
        if (!properties || !validatePropertyType(properties.Runtime, 'string', template)) {
            throw new Error('Resource does not specify a Runtime')
        }

        const reffedVal = getStringForProperty(properties.Runtime! as Ref, template)
        // TODO: should we handle this a different way? User could still override in this state.
        if (!reffedVal) {
            throw new Error('Resource references a parameter without a default value')
        }
        return reffedVal
    }

    export async function getResourceFromTemplate(
        {
            templatePath,
            handlerName,
        }: {
            templatePath: string
            handlerName: string
        },
        context: { loadTemplate: typeof load } = { loadTemplate: load }
    ): Promise<Resource> {
        const template = await context.loadTemplate(templatePath)

        return getResourceFromTemplateResources({
            templateResources: template.Resources,
            handlerName,
        })
    }

    export async function getResourceFromTemplateResources(params: {
        templateResources?: TemplateResources
        handlerName: string
    }): Promise<Resource> {
        const resources = params.templateResources || {}

        const matches = Object.keys(resources)
            .filter(key =>
                matchesHandler({
                    resource: resources[key],
                    handlerName: params.handlerName,
                })
            )
            .map(key => resources[key]!)

        if (matches.length < 1) {
            throw new Error(`Could not find a SAM resource for handler ${params.handlerName}`)
        }

        if (matches.length > 1) {
            // TODO: Is this a valid scenario?
            throw new Error(`Found more than one SAM resource for handler ${params.handlerName}`)
        }

        return matches[0]
    }

    function matchesHandler({ resource, handlerName }: { resource?: Resource; handlerName: string }) {
        return (
            resource &&
            resource.Type === SERVERLESS_FUNCTION_TYPE &&
            resource.Properties &&
            // TODO: `resource.Properties.Handler` is relative to `CodeUri`, but
            //       `handlerName` is relative to the directory containing the source
            //       file. To fix, update lambda handler candidate searches for
            //       interpreted languages to return a handler name relative to the
            //       `CodeUri`, rather than to the directory containing the source file.
            resource.Properties.Handler === handlerName
        )
    }

    export function getStringForProperty(
        property: string | number | object | undefined,
        template: Template
    ): string | undefined {
        if (validatePropertyType(property, 'string', template)) {
            if (typeof property === 'string') {
                return property
            } else if (typeof property === 'object') {
                try {
                    const forcedProperty = property as Ref
                    return getReffedString(forcedProperty, template)
                } catch (err) {
                    getLogger().debug(err)
                }
            }
        }

        return undefined
    }

    export function getNumberForProperty(
        property: string | number | object | undefined,
        template: Template
    ): number | undefined {
        if (validatePropertyType(property, 'number', template)) {
            if (typeof property === 'number') {
                return property
            } else if (typeof property === 'object') {
                try {
                    const forcedProperty = property as Ref
                    return getReffedNumber(forcedProperty, template)
                } catch (err) {
                    getLogger().debug(err)
                }
            }
        }

        return undefined
    }

    function validatePropertyType(
        property: string | number | object | undefined,
        type: 'string' | 'number',
        template: Template
    ): boolean {
        if (typeof property === type) {
            return true
        } else if (
            typeof property === 'object' &&
            Object.keys(property).length === 1 &&
            Object.keys(property).includes('Ref')
        ) {
            // property has a Ref, force it to abide by that shape
            const forcedProperty = property as Ref
            const param = getReffedParam(forcedProperty, template)
            const paramType = param.Type === 'Number' ? 'number' : 'string'

            return paramType === type
        }

        return false
    }

    function getReffedNumber(ref: Ref, template: Template): number | undefined {
        const param = getReffedParam(ref, template)
        if (param.Type === 'Number') {
            if (param.Default && typeof param.Default !== 'number') {
                throw new Error(`Parameter ${ref.Ref} is not a number`)
            }

            // returns undefined if no default value is present
            return param.Default
        }

        throw new Error(`Parameter ${ref.Ref} is not typed as a number`)
    }

    function getReffedString(ref: Ref, template: Template): string | undefined {
        const param = getReffedParam(ref, template)
        // every other type, including List<Number>, is formatted as a string.
        if (param.Type !== 'Number') {
            if (param.Default && typeof param.Default !== 'string') {
                throw new Error(`Parameter ${ref.Ref} is not a string`)
            }

            // returns undefined if no default value is present
            return param.Default
        }

        throw new Error(`Parameter ${ref.Ref} is not typed as a string`)
    }

    function getReffedParam(ref: Ref, template: Template): Parameter {
        const refParam = ref.Ref
        const params = template.Parameters

        if (params && Object.keys(params).includes(refParam)) {
            return params[refParam]!
        }

        throw new Error(`Parameter not found in template: ${refParam}`)
    }
}
