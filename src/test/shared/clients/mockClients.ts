/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudFormation, Lambda, STS } from 'aws-sdk'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { EcsClient } from '../../../shared/clients/ecsClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'

//TODO: change the import to aws-sdk-js once Schemas SDK is launched
import * as Schemas from '../../../shared/schemas/clientschemas'

import { SchemaClient } from '../../../shared/clients/schemaClient'
import { StsClient } from '../../../shared/clients/stsClient'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'

import '../../../shared/utilities/asyncIteratorShim'
import { asyncGenerator } from '../../utilities/collectionUtils'

export class MockToolkitClientBuilder implements ToolkitClientBuilder {
    public constructor(
        private readonly cloudFormationClient: CloudFormationClient = new MockCloudFormationClient(),

        private readonly schemaClient: SchemaClient = new MockSchemaClient(),

        private readonly ecsClient: EcsClient = new MockEcsClient({}),

        private readonly lambdaClient: LambdaClient = new MockLambdaClient({}),

        private readonly stsClient: StsClient = new MockStsClient({})
    ) {}

    public createCloudFormationClient(regionCode: string): CloudFormationClient {
        return this.cloudFormationClient
    }

    public createSchemaClient(regionCode: string): SchemaClient {
        return this.schemaClient
    }

    public createEcsClient(regionCode: string): EcsClient {
        return this.ecsClient
    }

    public createLambdaClient(regionCode: string): LambdaClient {
        return this.lambdaClient
    }

    public createStsClient(regionCode: string): StsClient {
        return this.stsClient
    }
}

export class MockCloudFormationClient implements CloudFormationClient {
    public constructor(
        public readonly regionCode: string = '',

        public readonly deleteStack: (name: string) => Promise<void> = async (name: string) => {},

        public readonly listStacks: (statusFilter?: string[]) => AsyncIterableIterator<CloudFormation.StackSummary> = (
            statusFilter?: string[]
        ) => asyncGenerator([]),

        public readonly describeStackResources: (
            name: string
        ) => Promise<CloudFormation.DescribeStackResourcesOutput> = async (name: string) => ({
            StackResources: []
        })
    ) {}
}

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
            Content: ''
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

export class MockEcsClient implements EcsClient {
    public readonly regionCode: string
    public readonly listClusters: () => AsyncIterableIterator<string>
    public readonly listServices: (cluster: string) => AsyncIterableIterator<string>
    public readonly listTaskDefinitionFamilies: () => AsyncIterableIterator<string>

    public constructor({
        regionCode = '',
        listClusters = () => asyncGenerator([]),
        listServices = (cluster: string) => asyncGenerator([]),
        listTaskDefinitionFamilies = () => asyncGenerator([])
    }: {
        regionCode?: string
        listClusters?(): AsyncIterableIterator<string>
        listServices?(cluster: string): AsyncIterableIterator<string>
        listTaskDefinitionFamilies?(): AsyncIterableIterator<string>
    }) {
        this.regionCode = regionCode
        this.listClusters = listClusters
        this.listServices = listServices
        this.listTaskDefinitionFamilies = listTaskDefinitionFamilies
    }
}

export class MockLambdaClient implements LambdaClient {
    public readonly regionCode: string
    public readonly deleteFunction: (name: string) => Promise<void>
    public readonly invoke: (name: string, payload?: Lambda._Blob) => Promise<Lambda.InvocationResponse>
    public readonly listFunctions: () => AsyncIterableIterator<Lambda.FunctionConfiguration>

    public constructor({
        regionCode = '',
        deleteFunction = async (name: string) => {},
        invoke = async (name: string, payload?: Lambda._Blob) => ({}),
        listFunctions = () => asyncGenerator([])
    }: {
        regionCode?: string
        deleteFunction?(name: string): Promise<void>
        invoke?(name: string, payload?: Lambda._Blob): Promise<Lambda.InvocationResponse>
        listFunctions?(): AsyncIterableIterator<Lambda.FunctionConfiguration>
    }) {
        this.regionCode = regionCode
        this.deleteFunction = deleteFunction
        this.invoke = invoke
        this.listFunctions = listFunctions
    }
}

export class MockStsClient implements StsClient {
    public readonly regionCode: string
    public readonly getCallerIdentity: () => Promise<STS.GetCallerIdentityResponse>

    public constructor({
        regionCode = '',
        getCallerIdentity = async () => ({})
    }: {
        regionCode?: string
        getCallerIdentity?(): Promise<STS.GetCallerIdentityResponse>
    }) {
        this.regionCode = regionCode
        this.getCallerIdentity = getCallerIdentity
    }
}
