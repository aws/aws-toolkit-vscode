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
import { LAMBDA_PACKAGE_TYPE_IMAGE } from '../constants'

export namespace CloudFormation {
    export const SERVERLESS_API_TYPE = 'AWS::Serverless::Api'
    export const SERVERLESS_FUNCTION_TYPE = 'AWS::Serverless::Function'
    export const LAMBDA_FUNCTION_TYPE = 'AWS::Lambda::Function'

    export function isZipLambdaResource(
        resource?: ZipResourceProperties | ImageResourceProperties
    ): resource is ZipResourceProperties {
        return resource?.PackageType !== 'Image'
    }

    export function isImageLambdaResource(
        resource?: ZipResourceProperties | ImageResourceProperties
    ): resource is ImageResourceProperties {
        return resource?.PackageType === 'Image'
    }

    export function validateZipLambdaProperties({
        Handler,
        CodeUri,
        Runtime,
        ...rest
    }: Partial<ZipResourceProperties>): ZipResourceProperties {
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

    export interface LambdaResourceProperties {
        MemorySize?: number | Ref
        Timeout?: number | Ref
        Environment?: Environment
        Events?: Events
        PackageType?: 'Image' | 'Zip'
        [key: string]: any
    }

    export interface ZipResourceProperties extends LambdaResourceProperties {
        Handler: string | Ref
        CodeUri: string | Ref
        Runtime?: string | Ref
        PackageType?: 'Zip'
    }

    export interface ImageResourceProperties extends LambdaResourceProperties {
        PackageType: 'Image'
        ImageConfig?: ImageConfig
    }

    export interface ImageConfig {
        EntryPoint?: string[]
        Command?: string[]
        WorkingDirectory?: string
    }

    export interface Ref {
        Ref: string
    }

    export interface Environment {
        Variables?: Variables
    }

    export interface ApiEventProperties {
        Path?: string
        Method?: 'delete' | 'get' | 'head' | 'options' | 'patch' | 'post' | 'put' | 'any'
        Payload?: {
            json?: {
                [k: string]: string | number | boolean
            }
        }
    }

    export interface Event {
        Type?: 'Api' | 'HttpApi'
        Properties?: ApiEventProperties
    }

    export interface Events {
        [key: string]: Event
    }

    export interface Variables {
        [key: string]: any
    }

    export type ResourceType =
        | typeof LAMBDA_FUNCTION_TYPE
        | typeof SERVERLESS_FUNCTION_TYPE
        | typeof SERVERLESS_API_TYPE
        | string

    export interface Resource {
        Type: ResourceType
        Properties?: ZipResourceProperties | ImageResourceProperties
        Metadata?: SamImageMetadata
        // Any other properties are fine to have, we just copy them transparently
        [key: string]: any
    }

    export interface SamImageMetadata {
        Dockerfile: string
        DockerContext: string
        // we only care about the two above, but really anything can go here
        [key: string]: any
    }

    // TODO: Can we automatically detect changes to the CFN spec and apply them here?
    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html#parameters-section-structure-properties
    export type ParameterType =
        | 'String'
        | 'Number'
        | 'List<Number>'
        | 'CommaDelimitedList'
        | AWSSpecificParameterType
        | SSMParameterType

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
     * This takes refs into account but doesn't account for value; just whether or not the type is correct.
     * @param resource
     * @param template
     */
    export function validateResource(resource: Resource, template: Template): void {
        if (!resource.Type) {
            throw new Error('Missing or invalid value in Template for key: Type')
        }
        if (resource.Properties) {
            if (resource.Properties.PackageType === LAMBDA_PACKAGE_TYPE_IMAGE) {
                if (
                    !resource.Metadata?.Dockerfile ||
                    !validatePropertyType(resource.Metadata.Dockerfile, template, 'string')
                ) {
                    throw new Error('Missing or invalid value in Template for key: Metadata.Dockerfile')
                }
                if (
                    !resource.Metadata.DockerContext ||
                    !validatePropertyType(resource.Metadata.DockerContext, template, 'string')
                ) {
                    throw new Error('Missing or invalid value in Template for key: Metadata.DockerContext')
                }
            } else {
                if (
                    !resource.Properties.Handler ||
                    !validatePropertyType(resource.Properties.Handler, template, 'string')
                ) {
                    throw new Error('Missing or invalid value in Template for key: Handler')
                }
                if (
                    !resource.Properties.CodeUri ||
                    !validatePropertyType(resource.Properties.CodeUri, template, 'string')
                ) {
                    throw new Error('Missing or invalid value in Template for key: CodeUri')
                }
                if (
                    !!resource.Properties.Runtime &&
                    !validatePropertyType(resource.Properties.Runtime, template, 'string')
                ) {
                    throw new Error('Invalid value in Template for key: Runtime')
                }
            }

            if (
                !!resource.Properties.Timeout &&
                !validatePropertyType(resource.Properties.Timeout, template, 'number')
            ) {
                throw new Error('Invalid value in Template for key: Timeout')
            }
        }
    }

    export function getRuntime(resource: Pick<Resource, 'Properties'>, template: Template): string {
        const properties = resource.Properties as ZipResourceProperties
        if (!properties || !validatePropertyType(properties.Runtime, template, 'string')) {
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
            isZipLambdaResource(resource.Properties) &&
            // TODO: `resource.Properties.Handler` is relative to `CodeUri`, but
            //       `handlerName` is relative to the directory containing the source
            //       file. To fix, update lambda handler candidate searches for
            //       interpreted languages to return a handler name relative to the
            //       `CodeUri`, rather than to the directory containing the source file.
            resource.Properties.Handler === handlerName
        )
    }

    /**
     * Parameter/Ref helper functions
     */

    /**
     * Validates whether or not a property is a valid ref.
     * @param property Property to validate
     */
    function isRef(property: string | number | object | undefined): boolean {
        return (
            typeof property === 'object' && Object.keys(property).length === 1 && Object.keys(property).includes('Ref')
        )
    }

    /**
     * Gets the string value for a property in a template.
     * If the value is a Ref to a parameter, returns the default value of the ref; this may be undefined.
     * Also returns undefined if the property is neither string nor Ref.
     * @param property Property value to check
     * @param template Template object to parse through
     */
    export function getStringForProperty(
        property: string | number | object | undefined,
        template: Template
    ): string | undefined {
        return getThingForProperty(property, template, 'string') as string | undefined
    }

    /**
     * Gets the numeric value for a property in a template.
     * If the value is a Ref to a parameter, returns the default value of the ref; this may be undefined.
     * Also returns undefined if the property is neither number nor Ref.
     * @param property Property value to check
     * @param template Template object to parse through
     */
    export function getNumberForProperty(
        property: string | number | object | undefined,
        template: Template
    ): number | undefined {
        return getThingForProperty(property, template, 'number') as number | undefined
    }

    /**
     * Returns the "thing" that represents the property:
     * * string if a string is requested and (the property is a string or if the property is a ref that is not a Number and has a default value)
     * * number if a number is requested and (the property is a number or if the property is a ref that is Number and has a default value)
     * * undefined in all other cases
     *
     * Ultimately it is up to the caller to ensure the type matches but this should do a more-than-reasonable job.
     * @param property Property to validate the type of
     * @param template Template object to parse through
     * @param type Type to validate the property's type against
     */
    function getThingForProperty(
        property: string | number | object | undefined,
        template: Template,
        type: 'string' | 'number'
    ): string | number | undefined {
        if (validatePropertyType(property, template, type)) {
            if (typeof property !== 'object' && typeof property === type) {
                return property
            } else if (isRef(property)) {
                try {
                    const forcedProperty = property as Ref
                    return getReffedThing(forcedProperty, template, type)
                } catch (err) {
                    getLogger().debug(err)
                }
            }
        }

        return undefined
    }

    /**
     * Returns whether or not a property or its underlying ref matches the specified type
     * Does not validate a default value for a template parameter; just checks the value's type
     * @param property Property to validate the type of
     * @param template Template object to parse through
     * @param type Type to validate the property's type against
     */
    function validatePropertyType(
        property: string | number | object | undefined,
        template: Template,
        type: 'string' | 'number'
    ): boolean {
        if (typeof property === type) {
            return true
        } else if (isRef(property)) {
            // property has a Ref, force it to abide by that shape
            const forcedProperty = property as Ref
            const param = getReffedParam(forcedProperty, template)
            const paramType = param.Type === 'Number' ? 'number' : 'string'

            return paramType === type
        }

        return false
    }

    /**
     * Gets a value (string or number) from a Ref.
     *
     * If `thingType == number`...
     * - it is an error if the resolved value is not a number.
     * - returns undefined if the Ref does not have a default value but is
     *   a number.
     *
     * @param ref Ref to pull a number from
     * @param template Template to parse through
     * @param thingType Type to validate against
     */
    function getReffedThing(ref: Ref, template: Template, thingType: 'number' | 'string'): number | string | undefined {
        const param = getReffedParam(ref, template)
        // every other type, including List<Number>, is formatted as a string.
        if (
            (thingType === 'number' && param.Type === 'Number') ||
            (thingType !== 'number' && param.Type !== 'Number')
        ) {
            if (param.Default && typeof param.Default !== thingType) {
                throw new Error(`Parameter ${ref.Ref} is not a ${thingType}`)
            }

            // returns undefined if no default value is present
            return param.Default
        }

        throw new Error(`Parameter ${ref.Ref} is not a ${thingType}`)
    }

    /**
     * Given a Ref, pulls the CFN Parameter that the Ref is reffing.
     * Throws an error if reffed param isn't found.
     * @param ref Ref containing a reference to a parameter
     * @param template Template to parse through
     */
    function getReffedParam(ref: Ref, template: Template): Parameter {
        const refParam = ref.Ref
        const params = template.Parameters

        if (params && Object.keys(params).includes(refParam)) {
            return params[refParam]!
        }

        throw new Error(`Parameter not found in template: ${refParam}`)
    }

    /**
     * Resolves a value against a list of overrides. Resolution occurs in this order:
     * * property is not an object = return raw val (possibly undefined)
     * * property is a Ref object
     *   * ...with an override = return overridden val
     *   * ...without an override = return default val (possibly undefined)
     * * property is a generic object = return undefined
     * @param property Property to evaluate
     * @param template Template to parse through
     * @param overrides Object containing override values
     */
    export function resolvePropertyWithOverrides(
        property: string | number | object | undefined,
        template: Template,
        overrides: {
            [k: string]: string | number
        } = {}
    ): string | number | undefined {
        if (typeof property !== 'object') {
            return property
        }
        if (isRef(property)) {
            try {
                // property has a Ref, force it to abide by that shape
                const forcedProperty = property as Ref
                const refParam = forcedProperty.Ref
                const param = getReffedParam(forcedProperty, template)
                if (param) {
                    // check overrides first--those take precedent
                    if (Object.keys(overrides).includes(refParam)) {
                        return param.Type === 'Number'
                            ? (overrides[refParam] as number)
                            : (overrides[refParam] as string)
                    }

                    // return default val. This can be undefined.
                    return param.Default
                        ? param.Type === 'Number'
                            ? (param.Default as number)
                            : (param.Default as string)
                        : undefined
                }
            } catch (err) {
                getLogger().debug(err)
            }
        }

        return undefined
    }
}
