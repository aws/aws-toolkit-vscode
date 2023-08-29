/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { buildSchemaTemplateParameters } from '../../../eventSchemas/templates/schemasAppTemplateUtils'
import { DefaultSchemaClient } from '../../../shared/clients/schemaClient'
import { stub } from '../../utilities/stubber'
import {
    awsEventSchemaContent,
    customerUploadedSchema,
    customerUploadedSchemaMultipleTypes,
    partnerSchemaContent,
} from './schemasExamples'

const awsSchemaName = 'aws.ec2@EC2InstanceStateChangeNotification'
const awsSchemaExpectedPackageName = 'schema.aws.ec2.ec2instancestatechangenotification'
const registryName = 'Registry'
const schemaVersion = '1'
const awsToolkitUserAgent = 'AWSToolkit'

const partnerSchemaExpectedPackageName = 'schema.aws.partner.mongodb_com_1234567_tickets.ticket_created'
const partnerSchemaName = 'aws.partner-mongodb.com/1234567-tickets@Ticket.Created'

const customerUploadedSchemaName = 'someCustomer.SomeAwesomeSchema'
/** Expected package name. */
const customerUploadedSchemaExpectedPackage = 'schema.somecustomer_someawesomeschema'
const defaultEventSource = 'INSERT-YOUR-EVENT-SOURCE'
const defaultEventDetailType = 'INSERT-YOUR-DETAIL-TYPE'

const customerUploadedSchemaMultipleTypesName = 'someCustomer.multipleTypes@SomeOtherAwesomeSchema'
/** Expected package name. */
const customerUploadedSchemaMultipleTypesPkg = 'schema.somecustomer_multipletypes.someotherawesomeschema'

describe('Build template parameters for AwsEventSchema', async function () {
    it('should build correct template parameters for aws event schema', async function () {
        const schemaClient = stub(DefaultSchemaClient, { regionCode: 'region-1' })
        schemaClient.describeSchema.resolves({
            Content: awsEventSchemaContent,
            SchemaVersion: schemaVersion,
        })

        const result = await buildSchemaTemplateParameters(awsSchemaName, registryName, schemaClient)

        assert.strictEqual(result.SchemaVersion, schemaVersion, 'Schema version not matching')
        assert.strictEqual(result.templateExtraContent.AWS_Schema_registry, registryName, 'Registry name not matching')

        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_name,
            'EC2InstanceStateChangeNotification',
            'schemaRootEventName'
        )
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_root,
            awsSchemaExpectedPackageName,
            'schemaPackageHierarchy'
        )

        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_source,
            'aws.ec2',
            'x-amazon-events-source field not matching'
        )
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_detail_type,
            'EC2 Instance State-change Notification',
            'x-amazon-events-detail-type field not matching'
        )
        assert.strictEqual(
            result.templateExtraContent.user_agent,
            awsToolkitUserAgent,
            'User agent should be hardcoded to AWSToolkit'
        )
    })
})

describe('Build template parameters for PartnerSchema', async function () {
    it('should build correct template parameters for partner schema', async function () {
        const schemaClient = stub(DefaultSchemaClient, { regionCode: 'region-1' })
        schemaClient.describeSchema.resolves({
            Content: partnerSchemaContent,
            SchemaVersion: schemaVersion,
        })

        const result = await buildSchemaTemplateParameters(partnerSchemaName, registryName, schemaClient)

        assert.strictEqual(result.SchemaVersion, schemaVersion, 'Schema version not matching')
        assert.strictEqual(result.templateExtraContent.AWS_Schema_registry, registryName, 'Registry name not matching')

        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_name,
            'aws_partner_mongodb_com_Ticket_Created',
            'schemaRootEventName'
        )
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_root,
            partnerSchemaExpectedPackageName,
            'schemaPackageHierarchy'
        )

        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_source,
            'aws.partner-mongodb.com',
            'x-amazon-events-source field not matching'
        )
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_detail_type,
            'MongoDB Trigger for my_store.reviews',
            'x-amazon-events-detail-type field not matching'
        )
        assert.strictEqual(
            result.templateExtraContent.user_agent,
            awsToolkitUserAgent,
            'User agent should be hardcoded to AWSToolkit'
        )
    })
})

describe('Build template parameters for CustomerUploadedSchema', async function () {
    it('should build correct template parameters for customer uploaded schema with single type', async function () {
        const schemaClient = stub(DefaultSchemaClient, { regionCode: 'region-1' })
        schemaClient.describeSchema.resolves({
            Content: customerUploadedSchema,
            SchemaVersion: schemaVersion,
        })

        const result = await buildSchemaTemplateParameters(customerUploadedSchemaName, registryName, schemaClient)

        assert.strictEqual(result.SchemaVersion, schemaVersion, 'Schema version not matching')
        assert.strictEqual(result.templateExtraContent.AWS_Schema_registry, registryName, 'Registry name not matching')

        assert.strictEqual(result.templateExtraContent.AWS_Schema_name, 'Some_Awesome_Schema', 'schemaRootEventName')
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_root,
            customerUploadedSchemaExpectedPackage,
            'schemaPackageHierarchy'
        )

        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_source,
            defaultEventSource,
            'custom schemas should have default event source'
        )
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_detail_type,
            defaultEventDetailType,
            'custom schemas should have default detail type'
        )
        assert.strictEqual(
            result.templateExtraContent.user_agent,
            awsToolkitUserAgent,
            'User agent should be hardcoded to AWSToolkit'
        )
    })
})

describe('Build template parameters for CustomerUploadedSchemaMultipleTypes', async function () {
    it('should  build correct template parameters for customer uploaded schema with multiple types', async function () {
        const schemaClient = stub(DefaultSchemaClient, { regionCode: 'region-1' })
        schemaClient.describeSchema.resolves({
            Content: customerUploadedSchemaMultipleTypes,
            SchemaVersion: schemaVersion,
        })

        const result = await buildSchemaTemplateParameters(
            customerUploadedSchemaMultipleTypesName,
            registryName,
            schemaClient
        )

        assert.strictEqual(result.SchemaVersion, schemaVersion, 'Schema version not matching')
        assert.strictEqual(result.templateExtraContent.AWS_Schema_registry, registryName, 'Registry name not matching')

        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_name,
            'Some_Awesome_Schema_Object_1',
            'schemaRootEventName'
        )
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_root,
            customerUploadedSchemaMultipleTypesPkg,
            'schemaPackageHierarchy'
        )

        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_source,
            defaultEventSource,
            'custom schemas should have default event source'
        )
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_detail_type,
            defaultEventDetailType,
            'custom schemas should have default detail type'
        )
        assert.strictEqual(
            result.templateExtraContent.user_agent,
            awsToolkitUserAgent,
            'User agent should be hardcoded to AWSToolkit'
        )
    })
})
