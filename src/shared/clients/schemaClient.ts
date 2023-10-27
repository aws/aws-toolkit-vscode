/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */



import {
    DescribeCodeBindingCommandOutput,
    DescribeSchemaCommandOutput,
    GetCodeBindingSourceCommandOutput,
    ListRegistriesCommandInput,
    ListRegistriesCommandOutput,
    ListSchemasCommandInput,
    ListSchemasCommandOutput,
    ListSchemaVersionsCommandInput,
    ListSchemaVersionsCommandOutput,
    PutCodeBindingCommandOutput,
    RegistrySummary,
    Schemas,
    SchemaSummary,
    SchemaVersionSummary,
    SearchSchemasCommandInput,
    SearchSchemasCommandOutput,
    SearchSchemaSummary,
} from "@aws-sdk/client-schemas";

import globals from '../extensionGlobals'

import { ClassToInterfaceType } from '../utilities/tsUtils'

export type SchemaClient = ClassToInterfaceType<DefaultSchemaClient>
export class DefaultSchemaClient {
    public constructor(public readonly regionCode: string) {}

    public async *listRegistries(): AsyncIterableIterator<RegistrySummary> {
        const client = await this.createSdkClient()

        const request: ListRegistriesCommandInput = {}

        do {
            const response: ListRegistriesCommandOutput = await client.listRegistries(request).promise()

            if (response.Registries) {
                yield* response.Registries
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async *listSchemas(registryName: string): AsyncIterableIterator<SchemaSummary> {
        const client = await this.createSdkClient()

        const request: ListSchemasCommandInput = {
            RegistryName: registryName,
        }

        do {
            const response: ListSchemasCommandOutput = await client.listSchemas(request).promise()

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
    ): Promise<DescribeSchemaCommandOutput> {
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
    ): AsyncIterableIterator<SchemaVersionSummary> {
        const client = await this.createSdkClient()

        const request: ListSchemaVersionsCommandInput = {
            RegistryName: registryName,
            SchemaName: schemaName,
        }

        do {
            const response: ListSchemaVersionsCommandOutput = await client.listSchemaVersions(request).promise()

            if (response.SchemaVersions) {
                yield* response.SchemaVersions
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async *searchSchemas(
        keywords: string,
        registryName: string
    ): AsyncIterableIterator<SearchSchemaSummary> {
        const client = await this.createSdkClient()

        const request: SearchSchemasCommandInput = {
            Keywords: keywords,
            RegistryName: registryName,
        }

        do {
            const response: SearchSchemasCommandOutput = await client.searchSchemas(request).promise()

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
    ): Promise<GetCodeBindingSourceCommandOutput> {
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
    ): Promise<PutCodeBindingCommandOutput> {
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
    ): Promise<DescribeCodeBindingCommandOutput> {
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
