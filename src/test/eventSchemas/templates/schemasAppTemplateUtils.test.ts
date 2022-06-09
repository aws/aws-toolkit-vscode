/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Schemas } from 'aws-sdk'
import * as sinon from 'sinon'
import { buildSchemaTemplateParameters } from '../../../eventSchemas/templates/schemasAppTemplateUtils'
import { SchemaClient } from '../../../shared/clients/schemaClient'
import {
    AWS_EVENT_SCHEMA_CONTENT,
    CUSTOMER_UPLOADED_SCHEMA,
    CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES,
    PARTNER_SCHEMA_CONTENT,
} from './schemasExamples'

const AWS_SCHEMA_NAME = 'aws.ec2@EC2InstanceStateChangeNotification'
const AWS_SCHEMA_EXPECTED_PACKAGE_NAME = 'schema.aws.ec2.ec2instancestatechangenotification'
const REGISTRY_NAME = 'Registry'
const SCHEMA_VERSION = '1'
const AWS_TOOLKIT_USER_AGENT = 'AWSToolkit'

const PARTNER_SCHEMA_EXPECTED_PACKAGE_NAME = 'schema.aws.partner.mongodb_com_1234567_tickets.ticket_created'
const PARTNER_SCHEMA_NAME = 'aws.partner-mongodb.com/1234567-tickets@Ticket.Created'

const CUSTOMER_UPLOADED_SCHEMA_NAME = 'someCustomer.SomeAwesomeSchema'
const CUSTOMER_UPLOADED_SCHEMA_EXPECTED_PACKAGE_NAME = 'schema.somecustomer_someawesomeschema'
const DEFAULT_EVENT_SOURCE = 'INSERT-YOUR-EVENT-SOURCE'
const DEFAULT_EVENT_DETAIL_TYPE = 'INSERT-YOUR-DETAIL-TYPE'

const CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_NAME = 'someCustomer.multipleTypes@SomeOtherAwesomeSchema'
const CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_EXPECTED_PACKAGE_NAME =
    'schema.somecustomer_multipletypes.someotherawesomeschema'

const schemaClient = {
    describeSchema() {
        throw new Error('Not Implemented')
    },
} as unknown as SchemaClient

describe('Build template parameters for AwsEventSchema', async function () {
    afterEach(function () {
        sinon.restore()
    })

    it('should build correct template parameters for aws event schema', async function () {
        const schemaResponse: Schemas.DescribeSchemaResponse = {
            Content: AWS_EVENT_SCHEMA_CONTENT,
            SchemaVersion: SCHEMA_VERSION,
        }

        sinon.stub(schemaClient, 'describeSchema').returns(Promise.resolve(schemaResponse))

        const result = await buildSchemaTemplateParameters(AWS_SCHEMA_NAME, REGISTRY_NAME, schemaClient)

        assert.strictEqual(result.SchemaVersion, SCHEMA_VERSION, 'Schema version not matching')
        assert.strictEqual(result.templateExtraContent.AWS_Schema_registry, REGISTRY_NAME, 'Registry name not matching')

        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_name,
            'EC2InstanceStateChangeNotification',
            'schemaRootEventName'
        )
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_root,
            AWS_SCHEMA_EXPECTED_PACKAGE_NAME,
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
            AWS_TOOLKIT_USER_AGENT,
            'User agent should be hardcoded to AWSToolkit'
        )
    })
})

describe('Build template parameters for PartnerSchema', async function () {
    let sandbox: sinon.SinonSandbox
    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })
    it('should build correct template parameters for partner schema', async function () {
        const schemaResponse: Schemas.DescribeSchemaResponse = {
            Content: PARTNER_SCHEMA_CONTENT,
            SchemaVersion: SCHEMA_VERSION,
        }
        sandbox.stub(schemaClient, 'describeSchema').returns(Promise.resolve(schemaResponse))

        const result = await buildSchemaTemplateParameters(PARTNER_SCHEMA_NAME, REGISTRY_NAME, schemaClient)

        assert.strictEqual(result.SchemaVersion, SCHEMA_VERSION, 'Schema version not matching')
        assert.strictEqual(result.templateExtraContent.AWS_Schema_registry, REGISTRY_NAME, 'Registry name not matching')

        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_name,
            'aws_partner_mongodb_com_Ticket_Created',
            'schemaRootEventName'
        )
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_root,
            PARTNER_SCHEMA_EXPECTED_PACKAGE_NAME,
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
            AWS_TOOLKIT_USER_AGENT,
            'User agent should be hardcoded to AWSToolkit'
        )
    })
})

describe('Build template parameters for CustomerUploadedSchema', async function () {
    afterEach(function () {
        sinon.restore()
    })

    it('should build correct template parameters for customer uploaded schema with single type', async function () {
        const schemaResponse: Schemas.DescribeSchemaResponse = {
            Content: CUSTOMER_UPLOADED_SCHEMA,
            SchemaVersion: SCHEMA_VERSION,
        }
        sinon.stub(schemaClient, 'describeSchema').returns(Promise.resolve(schemaResponse))

        const result = await buildSchemaTemplateParameters(CUSTOMER_UPLOADED_SCHEMA_NAME, REGISTRY_NAME, schemaClient)

        assert.strictEqual(result.SchemaVersion, SCHEMA_VERSION, 'Schema version not matching')
        assert.strictEqual(result.templateExtraContent.AWS_Schema_registry, REGISTRY_NAME, 'Registry name not matching')

        assert.strictEqual(result.templateExtraContent.AWS_Schema_name, 'Some_Awesome_Schema', 'schemaRootEventName')
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_root,
            CUSTOMER_UPLOADED_SCHEMA_EXPECTED_PACKAGE_NAME,
            'schemaPackageHierarchy'
        )

        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_source,
            DEFAULT_EVENT_SOURCE,
            'custom schemas should have default event source'
        )
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_detail_type,
            DEFAULT_EVENT_DETAIL_TYPE,
            'custom schemas should have default detail type'
        )
        assert.strictEqual(
            result.templateExtraContent.user_agent,
            AWS_TOOLKIT_USER_AGENT,
            'User agent should be hardcoded to AWSToolkit'
        )
    })
})

describe('Build template parameters for CustomerUploadedSchemaMultipleTypes', async function () {
    afterEach(function () {
        sinon.restore()
    })

    it('should  build correct template parameters for customer uploaded schema with multiple types', async function () {
        const schemaResponse: Schemas.DescribeSchemaResponse = {
            Content: CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES,
            SchemaVersion: SCHEMA_VERSION,
        }
        sinon.stub(schemaClient, 'describeSchema').returns(Promise.resolve(schemaResponse))

        const result = await buildSchemaTemplateParameters(
            CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_NAME,
            REGISTRY_NAME,
            schemaClient
        )

        assert.strictEqual(result.SchemaVersion, SCHEMA_VERSION, 'Schema version not matching')
        assert.strictEqual(result.templateExtraContent.AWS_Schema_registry, REGISTRY_NAME, 'Registry name not matching')

        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_name,
            'Some_Awesome_Schema_Object_1',
            'schemaRootEventName'
        )
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_root,
            CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_EXPECTED_PACKAGE_NAME,
            'schemaPackageHierarchy'
        )

        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_source,
            DEFAULT_EVENT_SOURCE,
            'custom schemas should have default event source'
        )
        assert.strictEqual(
            result.templateExtraContent.AWS_Schema_detail_type,
            DEFAULT_EVENT_DETAIL_TYPE,
            'custom schemas should have default detail type'
        )
        assert.strictEqual(
            result.templateExtraContent.user_agent,
            AWS_TOOLKIT_USER_AGENT,
            'User agent should be hardcoded to AWSToolkit'
        )
    })
})
