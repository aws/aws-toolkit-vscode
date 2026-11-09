/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DescribeCodeBindingCommand,
    DescribeCodeBindingResponse,
    DescribeSchemaCommand,
    DescribeSchemaResponse,
    GetCodeBindingSourceCommand,
    GetCodeBindingSourceResponse,
    ListRegistriesCommand,
    ListRegistriesRequest,
    ListRegistriesResponse,
    ListSchemasCommand,
    ListSchemasRequest,
    ListSchemasResponse,
    ListSchemaVersionsCommand,
    ListSchemaVersionsRequest,
    ListSchemaVersionsResponse,
    PutCodeBindingCommand,
    PutCodeBindingResponse,
    RegistrySummary,
    SchemasClient,
    SchemaSummary,
    SchemaVersionSummary,
    SearchSchemasCommand,
    SearchSchemasRequest,
    SearchSchemasResponse,
    SearchSchemaSummary,
} from '@aws-sdk/client-schemas'
import globals from '../extensionGlobals'

import { ClassToInterfaceType } from '../utilities/tsUtils'

export type SchemaClient = ClassToInterfaceType<DefaultSchemaClient>
export class DefaultSchemaClient {
    public constructor(public readonly regionCode: string) {}

    public async *listRegistries(): AsyncIterableIterator<RegistrySummary> {
        const client = this.createSdkClient()

        const request: ListRegistriesRequest = {}

        do {
            const response: ListRegistriesResponse = await client.send(new ListRegistriesCommand(request))

            if (response.Registries) {
                yield* response.Registries
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async *listSchemas(registryName: string): AsyncIterableIterator<SchemaSummary> {
        const client = this.createSdkClient()

        const request: ListSchemasRequest = {
            RegistryName: registryName,
        }

        do {
            const response: ListSchemasResponse = await client.send(new ListSchemasCommand(request))

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
    ): Promise<DescribeSchemaResponse> {
        const client = this.createSdkClient()

        return await client.send(
            new DescribeSchemaCommand({
                RegistryName: registryName,
                SchemaName: schemaName,
                SchemaVersion: schemaVersion,
            })
        )
    }

    public async *listSchemaVersions(
        registryName: string,
        schemaName: string
    ): AsyncIterableIterator<SchemaVersionSummary> {
        const client = this.createSdkClient()

        const request: ListSchemaVersionsRequest = {
            RegistryName: registryName,
            SchemaName: schemaName,
        }

        do {
            const response: ListSchemaVersionsResponse = await client.send(new ListSchemaVersionsCommand(request))

            if (response.SchemaVersions) {
                yield* response.SchemaVersions
            }

            request.NextToken = response.NextToken
        } while (request.NextToken)
    }

    public async *searchSchemas(keywords: string, registryName: string): AsyncIterableIterator<SearchSchemaSummary> {
        const client = this.createSdkClient()

        const request: SearchSchemasRequest = {
            Keywords: keywords,
            RegistryName: registryName,
        }

        do {
            const response: SearchSchemasResponse = await client.send(new SearchSchemasCommand(request))

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
    ): Promise<GetCodeBindingSourceResponse> {
        const client = this.createSdkClient()

        return await client.send(
            new GetCodeBindingSourceCommand({
                Language: language,
                RegistryName: registryName,
                SchemaName: schemaName,
                SchemaVersion: schemaVersion,
            })
        )
    }

    public async putCodeBinding(
        language: string,
        registryName: string,
        schemaName: string,
        schemaVersion: string
    ): Promise<PutCodeBindingResponse> {
        const client = this.createSdkClient()

        return await client.send(
            new PutCodeBindingCommand({
                Language: language,
                RegistryName: registryName,
                SchemaName: schemaName,
                SchemaVersion: schemaVersion,
            })
        )
    }
    public async describeCodeBinding(
        language: string,
        registryName: string,
        schemaName: string,
        schemaVersion: string
    ): Promise<DescribeCodeBindingResponse> {
        const client = this.createSdkClient()

        return await client.send(
            new DescribeCodeBindingCommand({
                Language: language,
                RegistryName: registryName,
                SchemaName: schemaName,
                SchemaVersion: schemaVersion,
            })
        )
    }

    private createSdkClient(): SchemasClient {
        return globals.sdkClientBuilderV3.createAwsService({
            serviceClient: SchemasClient,
            clientOptions: { region: this.regionCode },
        })
    }
}
