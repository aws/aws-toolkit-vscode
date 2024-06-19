/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import _ = require('lodash')
import { SchemaCodeGenUtils, toValidIdentifier } from '../../eventSchemas/models/schemaCodeGenUtils'
import { SchemaClient } from '../../shared/clients/schemaClient'

const xAmazonEventSource = 'x-amazon-events-source'
const xAmazonEventDetailType = 'x-amazon-events-detail-type'

const components = 'components'
const schemas = 'schemas'
const componentsSchemasPath = '#/components/schemas/'
const awsEvent = 'AWSEvent'
const properties = 'properties'
const detail = 'detail'
const ref = '$ref'

const defaultEventSource = 'INSERT-YOUR-EVENT-SOURCE'
const defaultEventDetailType = 'INSERT-YOUR-DETAIL-TYPE'

export interface SchemaTemplateParameters {
    SchemaVersion: string
    templateExtraContent: SchemaTemplateExtraContext
}

// This matches the extra_content parameters to Schema-based templates in both key and value names in cookiecutter.json in the templates used by SamEventBridgeSchemaAppPython
export interface SchemaTemplateExtraContext {
    AWS_Schema_registry: string // eslint-disable-line @typescript-eslint/naming-convention
    AWS_Schema_name: string // eslint-disable-line @typescript-eslint/naming-convention
    AWS_Schema_root: string // eslint-disable-line @typescript-eslint/naming-convention
    AWS_Schema_source: string // eslint-disable-line @typescript-eslint/naming-convention
    AWS_Schema_detail_type: string // eslint-disable-line @typescript-eslint/naming-convention
    user_agent: string // eslint-disable-line @typescript-eslint/naming-convention
}

export async function buildSchemaTemplateParameters(schemaName: string, registryName: string, client: SchemaClient) {
    const response = await client.describeSchema(registryName, schemaName)
    const schemaNode = JSON.parse(response.Content!)
    const latestSchemaVersion = response.SchemaVersion
    // Standard OpenAPI specification for AwsEventNode
    const awsEventNode = _.get(schemaNode, components.concat('.', schemas, '.', awsEvent))

    // Derive source from custom OpenAPI metadata provided by Schemas service
    let source = _.get(awsEventNode, xAmazonEventSource)
    if (!_.isString(source)) {
        source = defaultEventSource
    }

    // Derive detail type from custom OpenAPI metadata provided by Schemas service
    let detailType = _.get(awsEventNode, xAmazonEventDetailType)
    if (!_.isString(detailType)) {
        detailType = defaultEventDetailType
    }

    // Generate schema root/package from the scheme name
    // In the near future, this will be returned as part of a Schemas Service API call
    const schemaPackageHierarchy = buildSchemaPackageHierarchy(schemaName)

    // Derive root schema event name from OpenAPI metadata, or if ambiguous, use the last post-character section of a schema name
    const rootSchemaEventName = buildRootSchemaEventName(schemaNode, awsEventNode) || getCoreFileName(schemaName)

    const templateExtraContent: SchemaTemplateExtraContext = {
        AWS_Schema_registry: registryName, // eslint-disable-line @typescript-eslint/naming-convention
        AWS_Schema_name: rootSchemaEventName!, // eslint-disable-line @typescript-eslint/naming-convention
        AWS_Schema_root: schemaPackageHierarchy, // eslint-disable-line @typescript-eslint/naming-convention
        AWS_Schema_source: source, // eslint-disable-line @typescript-eslint/naming-convention
        AWS_Schema_detail_type: detailType, // eslint-disable-line @typescript-eslint/naming-convention
        // Need to provide user agent to SAM CLI so that it will enable appTemplate-based
        user_agent: 'AWSToolkit',
    }

    const schemaTemplateParameters: SchemaTemplateParameters = {
        SchemaVersion: latestSchemaVersion!,
        templateExtraContent: templateExtraContent,
    }

    return schemaTemplateParameters
}

function buildSchemaPackageHierarchy(schemaName: string) {
    const codeGenUtilsObject = new SchemaCodeGenUtils()

    return codeGenUtilsObject.buildSchemaPackageName(schemaName)
}

function buildRootSchemaEventName(schemaNode: any, awsEventNode: any) {
    const refValue = _.get(awsEventNode, properties.concat('.', detail, '.', ref))

    if (_.isString(refValue) && refValue.includes(componentsSchemasPath)) {
        const awsEventDetailRef = refValue.split(componentsSchemasPath).pop()
        if (!_.isEmpty(awsEventDetailRef)) {
            return toValidIdentifier(awsEventDetailRef!)
        }
    }

    const schemaRoots = _.keysIn(_.get(schemaNode, components.concat('.', schemas)))
    if (!_.isEmpty(schemaRoots)) {
        return toValidIdentifier(schemaRoots[0])
    }

    return undefined
}

function getCoreFileName(schemaName: string) {
    const parsedName = schemaName.split('@')

    return parsedName[parsedName.length - 1]
}
