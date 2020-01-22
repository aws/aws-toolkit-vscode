/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schemas } from 'aws-sdk'

export interface SchemaClient {
    readonly regionCode: string

    listRegistries(): AsyncIterableIterator<Schemas.RegistrySummary>

    listSchemas(registryName: string): AsyncIterableIterator<Schemas.SchemaSummary>

    describeSchema(
        registryName: string,
        schemaName: string,
        schemaVersion?: string
    ): Promise<Schemas.DescribeSchemaResponse>
    listSchemaVersions(registryName: string, schemaName: string): AsyncIterableIterator<Schemas.SchemaVersionSummary>

    getCodeBindingSource(
        language: string,
        registryName: string,
        schemaName: string,
        schemaVersion: string
    ): Promise<Schemas.GetCodeBindingSourceResponse>

    putCodeBinding(
        language: string,
        registryName: string,
        schemaName: string,
        schemaVersion: string
    ): Promise<Schemas.PutCodeBindingResponse>

    describeCodeBinding(
        language: string,
        registryName: string,
        schemaName: string,
        schemaVersion: string
    ): Promise<Schemas.DescribeCodeBindingResponse>

    searchSchemas(keywords: string, registryName: string): AsyncIterableIterator<Schemas.SearchSchemaSummary>
}
