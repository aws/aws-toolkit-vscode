/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from 'yaml-cfn'
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

    // Globals section of the template. Provides default values for functions, APIs, HTTP APIs, and SimpleTables.
    // https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-specification-template-anatomy-globals.html#sam-specification-template-anatomy-globals-supported-resources-and-properties
    export interface TemplateGlobals {
        Function?: FunctionGlobals
        Api?: ApiGlobals
        HttpApi?: HttpApiGlobals
        SimpleTable?: SimpleTableGlobals
    }

    type FunctionKeys =
        | 'Handler'
        | 'Runtime'
        | 'CodeUri'
        | 'DeadLetterQueue'
        | 'Description'
        | 'MemorySize'
        | 'Timeout'
        | 'VpcConfig'
        | 'Environment'
        | 'Tags'
        | 'Tracing'
        | 'KmsKeyArn'
        | 'Layers'
        | 'AutoPublishAlias'
        | 'DeploymentPreference'
        | 'PermissionsBoundary'
        | 'ReservedConcurrentExecutions'
        | 'EventInvokeConfig'
    const functionKeysSet: Set<string> = new Set([
        'Handler',
        'Runtime',
        'CodeUri',
        'DeadLetterQueue',
        'Description',
        'MemorySize',
        'Timeout',
        'VpcConfig',
        'Environment',
        'Tags',
        'Tracing',
        'KmsKeyArn',
        'Layers',
        'AutoPublishAlias',
        'DeploymentPreference',
        'PermissionsBoundary',
        'ReservedConcurrentExecutions',
        'EventInvokeConfig',
    ])
    type FunctionGlobals = {
        [key in FunctionKeys]?: string | number | Record<string, unknown> | undefined
    }

    type ApiKeys =
        | 'Auth'
        | 'Name'
        | 'DefinitionUri'
        | 'CacheClusterEnabled'
        | 'CacheClusterSize'
        | 'Variables'
        | 'EndpointConfiguration'
        | 'MethodSettings'
        | 'BinaryMediaTypes'
        | 'MinimumCompressionSize'
        | 'Cors'
        | 'GatewayResponses'
        | 'AccessLogSetting'
        | 'CanarySetting'
        | 'TracingEnabled'
        | 'OpenApiVersion'
        | 'Domain'
    const apiKeysSet: Set<string> = new Set([
        'Auth',
        'Name',
        'DefinitionUri',
        'CacheClusterEnabled',
        'CacheClusterSize',
        'Variables',
        'EndpointConfiguration',
        'MethodSettings',
        'BinaryMediaTypes',
        'MinimumCompressionSize',
        'Cors',
        'GatewayResponses',
        'AccessLogSetting',
        'CanarySetting',
        'TracingEnabled',
        'OpenApiVersion',
        'Domain',
    ])
    type ApiGlobals = {
        [key in ApiKeys]?: string | number | Record<string, unknown> | undefined
    }

    type HttpApiKeys =
        | 'Auth'
        | 'CorsConfiguration'
        | 'AccessLogSettings'
        | 'Tags'
        | 'DefaultRouteSettings'
        | 'RouteSettings'
        | 'Domain'
    const HttpApiKeysSet: Set<string> = new Set([
        'Auth',
        'CorsConfiguration',
        'AccessLogSettings',
        'Tags',
        'DefaultRouteSettings',
        'RouteSettings',
        'Domain',
    ])
    type HttpApiGlobals = {
        [key in HttpApiKeys]?: string | number | Record<string, unknown> | undefined
    }

    type SimpleTableKeys = 'SSESpecification'
    const simpleTableKeysSet: Set<string> = new Set(['SSESpecification'])
    type SimpleTableGlobals = {
        [key in SimpleTableKeys]?: string | number | Record<string, unknown> | undefined
    }

    function globalPropForKey(key: string): keyof TemplateGlobals | undefined {
        if (functionKeysSet.has(key)) {
            return 'Function'
        } else if (apiKeysSet.has(key)) {
            return 'Api'
        } else if (HttpApiKeysSet.has(key)) {
            return 'HttpApi'
        } else if (simpleTableKeysSet.has(key)) {
            return 'SimpleTable'
        } else {
            return undefined
        }
    }

    export interface TemplateResources {
        [key: string]: Resource | undefined
    }

    export async function load(filename: string): Promise<Template> {
        if (!(await SystemUtilities.fileExists(filename))) {
            throw new Error(`Template file not found: ${filename}`)
        }

        const templateAsYaml: string = await filesystemUtilities.readFileAsString(filename)
        const template = yaml.load(templateAsYaml, {
            schema: schema as any,
        }) as Template
        validateTemplate(template)

        return template
    }

    export async function save(template: Template, filename: string): Promise<void> {
        const templateAsYaml: string = yaml.dump(template)

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
                if (!validatePropertyType(resource.Metadata, 'Dockerfile', template, 'string')) {
                    throw new Error('Missing or invalid value in Template for key: Metadata.Dockerfile')
                }
                if (!validatePropertyType(resource.Metadata, 'DockerContext', template, 'string')) {
                    throw new Error('Missing or invalid value in Template for key: Metadata.DockerContext')
                }
            } else {
                if (!validatePropertyType(resource.Properties, 'Handler', template, 'string')) {
                    throw new Error('Missing or invalid value in Template for key: Handler')
                }
                if (!resource.Properties.CodeUri) {
                    // Missing codeUri is allowed, (SAM pulls from the handler instead). Set as empty string.
                    resource.Properties.CodeUri = ''
                } else if (!validatePropertyType(resource.Properties, 'CodeUri', template, 'string')) {
                    throw new Error('Invalid value in Template for key: CodeUri')
                }
                if (
                    !!resource.Properties.Runtime &&
                    !validatePropertyType(resource.Properties, 'Runtime', template, 'string')
                ) {
                    throw new Error('Invalid value in Template for key: Runtime')
                }
            }

            if (
                !!resource.Properties.Timeout &&
                !validatePropertyType(resource.Properties, 'Timeout', template, 'number')
            ) {
                throw new Error('Invalid value in Template for key: Timeout')
            }
        }
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
    function isRef(property: unknown): boolean {
        return (
            typeof property === 'object' &&
            Object.keys(property!).length === 1 &&
            Object.keys(property!).includes('Ref')
        )
    }

    /**
     * Gets the string value for a property in a template.
     * If the value is a Ref to a parameter, returns the default value of the ref; this may be undefined.
     * If the value is not defined in the `targetObj` (`undefined` Ref counts as a definition), will attempt to find a value in Globals.
     * Returns undefined if the value is not found in `targetObj` or `Globals`.
     * @param targetObj Object containing a key to check
     * @param key Key to look up in `targetObj`. If not present in `targetObj`, will fall back to a value in `Globals`.
     * @param template Full template object. Required for `Ref` and `Globals` lookup.
     */
    export function getStringForProperty(
        targetObj: { [key: string]: string | number | Record<string, unknown> | undefined } | undefined,
        key: string,
        template: Template
    ): string | undefined {
        return getThingForProperty(targetObj, key, template, 'string') as string | undefined
    }

    /**
     * Gets the numeric value for a property in a template.
     * If the value is a Ref to a parameter, returns the default value of the ref; this may be undefined.
     * If the value is not defined in the `targetObj` (`undefined` Ref counts as a definition), will attempt to find a value in Globals.
     * Returns undefined if the value is not found in `targetObj` or `Globals`.
     * @param targetObj Object containing a key to check
     * @param key Key to look up in `targetObj`. If not present in `targetObj`, will fall back to a value in `Globals`.
     * @param template Full template object. Required for `Ref` and `Globals` lookup.
     */
    export function getNumberForProperty(
        targetObj: { [key: string]: string | number | Record<string, unknown> | undefined } | undefined,
        key: string,
        template: Template
    ): number | undefined {
        return getThingForProperty(targetObj, key, template, 'number') as number | undefined
    }

    /**
     * Returns the "thing" that represents the property within `targetObj` or `Globals`:
     * * string if a string is requested and (the property is a string or if the property is a ref that is not a Number and has a default value)
     * * number if a number is requested and (the property is a number or if the property is a ref that is Number and has a default value)
     * * undefined in all other cases
     *
     * Ultimately it is up to the caller to ensure the type matches but this should do a more-than-reasonable job.
     * @param targetObj Object containing a key to check
     * @param key Key to look up in `targetObj`. If not present in `targetObj`, will fall back to a value in `Globals`.
     * @param template Full template object. Required for `Ref` and `Globals` lookup.
     * @param type Type to validate the property's type against
     * @param globalLookup Whether or not this is currently looking at `Globals` fields. Internal for recursion prevention.
     */
    function getThingForProperty(
        targetObj: { [key: string]: string | number | Record<string, unknown> | undefined } | undefined,
        key: string,
        template: Template,
        type: 'string' | 'number',
        globalLookup?: boolean
    ): string | number | undefined {
        if (!targetObj) {
            return undefined
        }
        const property: unknown = targetObj[key]
        if (validatePropertyType(targetObj, key, template, type)) {
            if (typeof property !== 'object' && typeof property === type) {
                return property as 'string' | 'number'
            } else if (isRef(property)) {
                try {
                    const forcedProperty = property as Ref
                    return getReffedThing(forcedProperty, template, type)
                } catch (err) {
                    getLogger().debug(err)
                }
            }
        }

        // only look if we're not already looking at globals
        if (!globalLookup) {
            const globalProp = globalPropForKey(key)

            if (globalProp && template.Globals && template.Globals[globalProp]) {
                return getThingForProperty(template.Globals![globalProp], key, template, type, true)
            }
        }

        return undefined
    }

    /**
     * Returns whether or not a property or its underlying ref matches the specified type
     * Checks `targetObj` and `Globals` in that priority order. Will fail if `targetObj` is not valid but `Globals` is.
     * Does not validate a default value for a template parameter; just checks the value's type
     * @param targetObj Object containing a key to check
     * @param key Key to look up in `targetObj`. If not present in `targetObj`, will fall back to a value in `Globals`.
     * @param template Full template object. Required for `Ref` and `Globals` lookup.
     * @param type Type to validate the property's type against
     * @param globalLookup Whether or not this is currently looking at `Globals` fields. Internal for recursion prevention.
     */
    function validatePropertyType(
        targetObj: { [key: string]: string | number | Record<string, unknown> | undefined } | undefined,
        key: string,
        template: Template,
        type: 'string' | 'number',
        globalLookup?: boolean
    ): boolean {
        if (!targetObj) {
            return false
        }
        const property: unknown = targetObj[key]
        if (typeof property === type) {
            return true
        } else if (isRef(property)) {
            // property has a Ref, force it to abide by that shape
            const forcedProperty = property as Ref
            const param = getReffedParam(forcedProperty, template)
            const paramType = param.Type === 'Number' ? 'number' : 'string'

            return paramType === type
        }

        // only look if we're not already looking at globals
        if (!globalLookup) {
            const globalProp = globalPropForKey(key)

            if (globalProp && template.Globals && template.Globals[globalProp]) {
                return validatePropertyType(template.Globals![globalProp], key, template, type, true)
            }
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
            return param.Default as 'number' | 'string'
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
        property: unknown,
        template: Template,
        overrides: {
            [k: string]: string | number
        } = {}
    ): string | number | undefined {
        if (typeof property !== 'object') {
            return property as string | number | undefined
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

    /**
     * Removes characters disallowed in CFN/SAM logical resource ids.
     *
     * Example: "/a/b/c/foo-Bar!_baz{9)=+" => "abcfooBarbaz9"
     *
     * Reference: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resources-section-structure.html
     * > The logical ID must be alphanumeric (A-Za-z0-9) and unique within the template
     *
     * @param filename Filename
     * @returns  Resource id derived from the input.
     */
    export function makeResourceId(s: string) {
        return s.replace(/[^A-Za-z0-9]/g, '')
    }
}
