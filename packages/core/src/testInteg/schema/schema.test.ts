/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'
import { GlobalStorage } from '../../shared/globalStorage'
import * as fs from 'fs-extra'
import { getDefaultSchemas, samAndCfnSchemaUrl } from '../../shared/schemas'
import {
    getCITestSchemas,
    JSONObject,
    unmarshal,
    assertDefinitionProperty,
    assertProperty,
    assertRef,
    assertDefinition,
} from '../../test/shared/schema/testUtils'
import { assertTelemetry } from '../../test/testUtil'
import { waitUntil } from '../../shared/utilities/timeoutUtils'

describe('Sam Schema Regression', function () {
    let samSchema: JSONObject

    before(async function () {
        ;({ samSchema } = await getCITestSchemas())
    })

    it('has Policy Templates', function () {
        const samPolicyTemplate = 'AWS::Serverless::Function.SAMPolicyTemplate'
        assertDefinitionProperty(samSchema, samPolicyTemplate, 'S3WritePolicy')
        assertDefinitionProperty(samSchema, samPolicyTemplate, 'DynamoDBWritePolicy')
        assertDefinitionProperty(samSchema, samPolicyTemplate, 'SSMParameterReadPolicy')
        assertDefinitionProperty(samSchema, samPolicyTemplate, 'AWSSecretsManagerGetSecretValuePolicy')
    })

    it('has property Domain in AWS::Serverless::Api', function () {
        const domainLocation = unmarshal(
            samSchema,
            'definitions',
            'AWS::Serverless::Api',
            'properties',
            'Properties',
            'properties'
        )
        assertProperty(domainLocation, 'Domain')
        assertRef(unmarshal(domainLocation, 'Domain'), 'Api.DomainConfiguration')

        assertDefinition(samSchema, 'AWS::Serverless::Api.DomainConfiguration')
        assertDefinition(samSchema, 'AWS::Serverless::Api.MutualTlsAuthentication')
        assertDefinition(samSchema, 'AWS::Serverless::Api.Route53Configuration')
    })

    it('has Property Version in AWS::Serverless::Function.IAMPolicyDocument and AWS::Serverless::StateMachine.IAMPolicyDocument', function () {
        assertDefinitionProperty(samSchema, 'AWS::Serverless::Function.IAMPolicyDocument', 'Version')
        assertDefinitionProperty(samSchema, 'AWS::Serverless::StateMachine.IAMPolicyDocument', 'Version')
    })

    it('has Property RequestModel and RequestParameters in AWS::Serverless::Function.ApiEvent', function () {
        assertDefinitionProperty(samSchema, 'AWS::Serverless::Function.ApiEvent', 'RequestModel')
        assertDefinitionProperty(samSchema, 'AWS::Serverless::Function.ApiEvent', 'RequestParameters')
        assertDefinition(samSchema, 'AWS::Serverless::Function.RequestModel')
        assertDefinition(samSchema, 'AWS::Serverless::Function.RequestParameter')
    })

    it('has Property AddDefaultAuthorizerToCorsPreflight in AWS::Serverless::Api.Auth', function () {
        assertDefinitionProperty(samSchema, 'AWS::Serverless::Api.Auth', 'AddDefaultAuthorizerToCorsPreflight')
    })
})

describe('getDefaultSchemas()', () => {
    beforeEach(async () => {})

    it('uses cache after initial fetch for CFN/SAM schema', async () => {
        fs.removeSync(GlobalStorage.samAndCfnSchemaDestinationUri().fsPath)
        globals.telemetry.telemetryEnabled = true
        globals.telemetry.clearRecords()
        globals.telemetry.logger.clear()
        await getDefaultSchemas()
        await getDefaultSchemas()
        await getDefaultSchemas()
        await waitUntil(
            async () => {
                return fs.existsSync(GlobalStorage.samAndCfnSchemaDestinationUri().fsPath)
            },
            { truthy: true, interval: 200, timeout: 5000 }
        )
        assertTelemetry('toolkit_getExternalResource', [
            // Initial retrieval.
            // (Technically, this is done on activation, not any of the getDefaultSchemas() calls above.)
            { url: samAndCfnSchemaUrl, passive: true, result: 'Succeeded' },
            // Use cache after initial fetch.
            { url: samAndCfnSchemaUrl, passive: true, result: 'Cancelled', reason: 'Cache hit' },
            { url: samAndCfnSchemaUrl, passive: true, result: 'Cancelled', reason: 'Cache hit' },
        ])
    })
})
