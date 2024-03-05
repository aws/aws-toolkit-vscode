/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schemas } from 'aws-sdk'
import globals from '../extensionGlobals'

import { ClassToInterfaceType } from '../utilities/tsUtils'

export type SchemaClient = ClassToInterfaceType<DefaultSchemaClient>
export class DefaultSchemaClient {
    public constructor(public readonly regionCode: string) {}

    public async *listRegistries(): AsyncIterableIterator<Schemas.RegistrySummary> {
        const client = await this.createSdkClient()

        const request: Schemas.ListRegistriesRequest = {}

        do {
            const response: Schemas.ListRegistriesResponse = await client.listRegistries(request).promise()

            if (response.Registries) {
                yield* response.Registries
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async *listSchemas(registryName: string): AsyncIterableIterator<Schemas.SchemaSummary> {
        const client = await this.createSdkClient()

        const request: Schemas.ListSchemasRequest = {
            RegistryName: registryName,
        }

        do {
            const response: Schemas.ListSchemasResponse = await client.listSchemas(request).promise()

            if (response.Schemas) {
                yield* response.Schemas
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async describeSchema(
        registryName: string,
        schemaName: string,
        schemaVersion?: string
    ): Promise<Schemas.DescribeSchemaResponse> {
        const client = await this.createSdkClient()

        return await client
            .describeSchema({
                RegistryName: registryName,
                SchemaName: schemaName,
                SchemaVersion: schemaVersion,
            })
            .promise()
    }

    public async *listSchemaVersions(
        registryName: string,
        schemaName: string
    ): AsyncIterableIterator<Schemas.SchemaVersionSummary> {
        const client = await this.createSdkClient()

        const request: Schemas.ListSchemaVersionsRequest = {
            RegistryName: registryName,
            SchemaName: schemaName,
        }

        do {
            const response: Schemas.ListSchemaVersionsResponse = await client.listSchemaVersions(request).promise()

            if (response.SchemaVersions) {
                yield* response.SchemaVersions
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async *searchSchemas(
        keywords: string,
        registryName: string
    ): AsyncIterableIterator<Schemas.SearchSchemaSummary> {
        const client = await this.createSdkClient()

        const request: Schemas.SearchSchemasRequest = {
            Keywords: keywords,
            RegistryName: registryName,
        }

        do {
            const response: Schemas.SearchSchemasResponse = await client.searchSchemas(request).promise()

            if (response.Schemas) {
                yield* response.Schemas
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async getCodeBindingSource(
        language: string,
        registryName: string,
        schemaName: string,
        schemaVersion: string
    ): Promise<Schemas.GetCodeBindingSourceResponse> {
        const client = await this.createSdkClient()

        return await client
            .getCodeBindingSource({
                Language: language,
                RegistryName: registryName,
                SchemaName: schemaName,
                SchemaVersion: schemaVersion,
            })
            .promise()
    }

    public async putCodeBinding(
        language: string,
        registryName: string,
        schemaName: string,
        schemaVersion: string
    ): Promise<Schemas.PutCodeBindingResponse> {
        const client = await this.createSdkClient()

        return await client
            .putCodeBinding({
                Language: language,
                RegistryName: registryName,
                SchemaName: schemaName,
                SchemaVersion: schemaVersion,
            })
            .promise()
    }
    public async describeCodeBinding(
        language: string,
        registryName: string,
        schemaName: string,
        schemaVersion: string
    ): Promise<Schemas.DescribeCodeBindingResponse> {
        const client = await this.createSdkClient()

        return await client
            .describeCodeBinding({
                Language: language,
                RegistryName: registryName,
                SchemaName: schemaName,
                SchemaVersion: schemaVersion,
            })
            .promise()
    }

    private async createSdkClient(): Promise<Schemas> {
        return await globals.sdkClientBuilder.createAwsService(Schemas, undefined, this.regionCode)
    }
}
