/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schemas } from 'aws-sdk'
import { SchemaClient } from '../../../shared/clients/schemaClient'
import { asyncGenerator } from '../../utilities/collectionUtils'

export class MockSchemaClient implements SchemaClient {
    public constructor(
        public readonly regionCode: string = '',

        public readonly listRegistries: () => AsyncIterableIterator<Schemas.RegistrySummary> = () => asyncGenerator([]),

        public readonly listSchemas: (registryName: string) => AsyncIterableIterator<Schemas.SchemaSummary> = (
            registryName: string
        ) => asyncGenerator([]),

        public readonly describeSchema: (
            registryName: string,
            schemaName: string,
            schemaVersion?: string
        ) => Promise<Schemas.DescribeSchemaResponse> = async (
            registryName: string,
            schemaName: string,
            schemaVersion?: string
        ) => ({
            Content: '',
        }),

        public readonly getCodeBindingSource: (
            language: string,
            registryName: string,
            schemaName: string,
            version: string
        ) => Promise<Schemas.GetCodeBindingSourceResponse> = async (
            language: string,
            registryName: string,
            schemaName: string,
            version: string
        ) => ({ Body: undefined }),

        public readonly describeCodeBinding: (
            language: string,
            registryName: string,
            schemaName: string,
            version: string
        ) => Promise<Schemas.DescribeCodeBindingResponse> = async (
            language: string,
            registryName: string,
            schemaName: string,
            version: string
        ) => ({ Status: '' }),

        public readonly putCodeBinding: (
            language: string,
            registryName: string,
            schemaName: string,
            version: string
        ) => Promise<Schemas.PutCodeBindingResponse> = async (
            language: string,
            registryName: string,
            schemaName: string,
            version: string
        ) => ({ Status: '' }),

        public readonly listSchemaVersions: (
            registryName: string,
            schemaName: string
        ) => AsyncIterableIterator<Schemas.SchemaVersionSummary> = (registryName: string, schemaName: string) =>
            asyncGenerator([]),

        public readonly searchSchemas: (
            keywords: string,
            registryName: string
        ) => AsyncIterableIterator<Schemas.SearchSchemaSummary> = (keywords: string, registryName: string) =>
            asyncGenerator([])
    ) {}
}
