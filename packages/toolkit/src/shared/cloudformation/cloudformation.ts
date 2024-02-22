/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as vscode from 'vscode'
import { writeFile } from 'fs-extra'
import { schema } from 'yaml-cfn'
import * as yaml from 'js-yaml'
import * as filesystemUtilities from '../filesystemUtilities'
import { SystemUtilities } from '../systemUtilities'
import { getLogger } from '../logger'
import { lambdaPackageTypeImage } from '../constants'
import { isCloud9 } from '../extensionUtilities'
import { isUntitledScheme, normalizeVSCodeUri } from '../utilities/vsCodeUtils'

export const SERVERLESS_API_TYPE = 'AWS::Serverless::Api' // eslint-disable-line @typescript-eslint/naming-convention
export const SERVERLESS_FUNCTION_TYPE = 'AWS::Serverless::Function' // eslint-disable-line @typescript-eslint/naming-convention
export const LAMBDA_FUNCTION_TYPE = 'AWS::Lambda::Function' // eslint-disable-line @typescript-eslint/naming-convention

export const templateFileGlobPattern = '**/*.{yaml,yml,json,template}'
export const templateFileRegexPattern = /.*\.(yaml|yml|json|template)$/i
export const devfileExcludePattern = /.*devfile\.(yaml|yml)/i
/**
 * Match any file path that contains a .aws-sam folder. The way this works is:
 * match anything that starts  with a '/' or '\', then '.aws-sam', then either
 * a '/' or '\' followed by any number of characters or end of a string (so it
 * matches both /.aws-sam or /.aws-sam/<any number of characters>)
 */
export const templateFileExcludePattern = /.*[/\\]\.aws-sam([/\\].*|$)/

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
    Architectures?: ('x86_64' | 'arm64')[]
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

type ThingType = 'number' | 'string' | 'array'
const samParamArrayTypes = ['List<Number>', 'CommaDelimitedList']

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
    AWSTemplateFormatVersion?: string

    Transform?: { properties: any } | string

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

type GlobalType = string | number | Record<string, unknown> | string[] | undefined

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
    [key in FunctionKeys]?: GlobalType
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
    [key in ApiKeys]?: GlobalType
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
    [key in HttpApiKeys]?: GlobalType
}

type SimpleTableKeys = 'SSESpecification'
const simpleTableKeysSet: Set<string> = new Set(['SSESpecification'])
type SimpleTableGlobals = {
    [key in SimpleTableKeys]?: GlobalType
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

/** Returns true if the given name or path is a valid CloudFormation or SAM filename. */
export function isValidFilename(filename: string | vscode.Uri): boolean {
    filename = typeof filename === 'string' ? filename : filename.fsPath
    filename = filename.trim()
    if (!filename.match(templateFileRegexPattern)) {
        return false
    }
    // Note: intentionally _not_ checking `templateFileExcludePattern` here, because while excluding
    // template files in .aws-sam/ is relevant for the workspace scan, it's irrelevant if such
    // a file was opened explicitly by the user.
    return !filename.match(devfileExcludePattern)
}

export async function load(filename: string, validate: boolean = true): Promise<Template> {
    if (!(await SystemUtilities.fileExists(filename))) {
        throw new Error(`Template file not found: ${filename}`)
    }

    const templateAsYaml: string = await filesystemUtilities.readFileAsString(filename)
    return loadByContents(templateAsYaml, validate)
}

export async function loadByContents(contents: string, validate: boolean = true): Promise<Template> {
    const template = yaml.load(contents, {
        schema: schema as any,
    }) as Template

    if (validate) {
        validateTemplate(template)
    }
    return template
}

/**
 * Returns a `Template` if the given file (on disk) or `contents` is a valid CloudFormation
 * document, or `{ template: undefined, kind: undefined }` if the file is invalid.
 */
export async function tryLoad(
    uri: vscode.Uri,
    contents?: string
): Promise<{ template: Template | undefined; kind: 'sam' | 'cfn' | undefined }> {
    const rv: {
        template: Template | undefined
        kind: 'sam' | 'cfn' | undefined
    } = { template: undefined, kind: undefined }
    try {
        if (isUntitledScheme(uri)) {
            if (!contents) {
                // this error technically just throw us into the catch so the error message isn't used
                throw new Error('Contents must be defined for untitled uris')
            }
            rv.template = await loadByContents(contents, false)
        } else {
            rv.template = await load(normalizeVSCodeUri(uri), false)
        }
    } catch (e) {
        return {
            template: undefined,
            kind: undefined,
        }
    }

    // Check if the template is a SAM template, using the same heuristic as the cfn-lint team:
    // https://github.com/aws-cloudformation/aws-cfn-lint-visual-studio-code/blob/629de0bac4f36cfc6534e409a6f6766a2240992f/client/src/yaml-support/yaml-schema.ts#L39-L51
    if (rv.template.AWSTemplateFormatVersion || rv.template.Resources) {
        rv.kind =
            rv.template.Transform && rv.template.Transform.toString().startsWith('AWS::Serverless') ? 'sam' : 'cfn'

        return rv
    }

    return {
        template: undefined,
        kind: undefined,
    }
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
        if (resource.Properties.PackageType === lambdaPackageTypeImage) {
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
    return typeof property === 'object' && Object.keys(property!).length === 1 && Object.keys(property!).includes('Ref')
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
    targetObj: { [key: string]: GlobalType } | undefined,
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
 * Gets the array value for a property in a template.
 * As per [the SAM documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html#parameters-section-structure-properties-type) ,
 *    this will **always** be a string array.
 *
 * TODO: [lists in Globals are **additive** with other fields](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-specification-template-anatomy-globals.html#sam-specification-template-anatomy-globals-overrideable-lists)
 *
 * If the value is a Ref to a parameter, returns the default value of the ref; this may be undefined.
 * If the value is not defined in the `targetObj` (`undefined` Ref counts as a definition), will attempt to find a value in Globals.
 * Returns undefined if the value is not found in `targetObj` or `Globals`.
 * @param targetObj Object containing a key to check
 * @param key Key to look up in `targetObj`. If not present in `targetObj`, will fall back to a value in `Globals`.
 * @param template Full template object. Required for `Ref` and `Globals` lookup.
 */
export function getArrayForProperty(
    targetObj: { [key: string]: string | number | Record<string, unknown> | undefined } | undefined,
    key: string,
    template: Template
): string[] | undefined {
    return getThingForProperty(targetObj, key, template, 'array') as string[] | undefined
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
    targetObj: { [key: string]: GlobalType } | undefined,
    key: string,
    template: Template,
    type: ThingType,
    globalLookup?: boolean
): string | number | string[] | undefined {
    if (!targetObj) {
        return undefined
    }
    const property: unknown = targetObj[key]
    if (validatePropertyType(targetObj, key, template, type)) {
        if (typeof property !== 'object' && typeof property === type) {
            return property as 'string' | 'number'
        } else if (Array.isArray(property)) {
            return property as string[]
        } else if (isRef(property)) {
            try {
                const forcedProperty = property as Ref
                return getReffedThing(forcedProperty, template, type)
            } catch (err) {
                getLogger().debug(err as Error)
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
    targetObj: { [key: string]: GlobalType } | undefined,
    key: string,
    template: Template,
    type: ThingType,
    globalLookup?: boolean
): boolean {
    if (!targetObj) {
        return false
    }
    const property: unknown = targetObj[key]
    if (typeof property === type || (type === 'array' && Array.isArray(property))) {
        return true
    } else if (isRef(property)) {
        // property has a Ref, force it to abide by that shape
        const forcedProperty = property as Ref
        const param = getReffedParam(forcedProperty, template)
        switch (type) {
            case 'number':
                return param.Type === 'Number'
            // TODO: gate this on "string" type specifically?
            case 'string':
                return param.Type !== 'Number'
            case 'array':
                return samParamArrayTypes.includes(param.Type)
        }
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
 * @param ref Ref to pull a value from
 * @param template Template to parse through
 * @param thingType Type to validate against
 */
function getReffedThing(ref: Ref, template: Template, thingType: ThingType): number | string | string[] | undefined {
    const param = getReffedParam(ref, template)
    // every other type, including List<Number>, is formatted as a string.
    if (
        (thingType === 'number' && param.Type === 'Number') ||
        (thingType === 'string' && param.Type !== 'Number') ||
        (thingType === 'array' && samParamArrayTypes.includes(param.Type))
    ) {
        if (param.Default && (thingType === 'array' ? 'string' : thingType) !== typeof param.Default) {
            throw new Error(`Default value for Parameter "${ref.Ref}" is not a ${thingType}`)
        }

        // attempt to convert to str array if array
        // returns undefined if no default value is present
        return param.Default && thingType === 'array' ? param.Default.toString().split(',') : param.Default
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
                    return param.Type === 'Number' ? (overrides[refParam] as number) : (overrides[refParam] as string)
                }

                // return default val. This can be undefined.
                return param.Default
                    ? param.Type === 'Number'
                        ? (param.Default as number)
                        : (param.Default as string)
                    : undefined
            }
        } catch (err) {
            getLogger().debug(err as Error)
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

/**
 * Creates a starter YAML template file.
 * @param isSam: Create a SAM template instead of a CFN template
 */
export async function createStarterTemplateFile(isSam?: boolean): Promise<void> {
    const content = createStarterTemplateYaml(isSam)
    const wsFolder = vscode.workspace.workspaceFolders
    const loc = await vscode.window.showSaveDialog({
        filters: { YAML: ['yaml'] },
        defaultUri: wsFolder && wsFolder[0] ? wsFolder[0].uri : undefined,
    })
    if (loc) {
        fs.writeFileSync(loc.fsPath, content)
        await vscode.commands.executeCommand('vscode.open', loc)
    }
}

/**
 * Creates a boilerplate CFN or SAM template that is complete enough to be picked up for JSON schema assignment
 * TODO: Remove `isCloud9` when Cloud9 gets YAML code completion
 * @param isSam Create a SAM or CFN template
 */
function createStarterTemplateYaml(isSam?: boolean): string {
    return `AWSTemplateFormatVersion: '2010-09-09'
${isSam ? 'Transform: AWS::Serverless-2016-10-31\n' : ''}
Description: <your stack description here>
${isCloud9() ? '' : '\n# Available top-level fields are listed in code completion\n'}
# Add Resources Here: uncomment the following lines
# Resources:
#   <resource name here>:
#     Type: # resource type here${isCloud9() ? '' : ' - available resources are listed in code completion'}
#     # <add resource-specific properties underneath this entry ${
        isCloud9() ? '' : ' - available properties are listed in code completion'
    }>
#     Properties:
`
}
