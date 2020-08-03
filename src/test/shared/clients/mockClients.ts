/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudFormation, CloudWatchLogs, IAM, Lambda, Schemas, StepFunctions, STS } from 'aws-sdk'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { CloudWatchLogsClient } from '../../../shared/clients/cloudWatchLogsClient'
import { EcsClient } from '../../../shared/clients/ecsClient'
import { IamClient } from '../../../shared/clients/iamClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { SchemaClient } from '../../../shared/clients/schemaClient'
import { StepFunctionsClient } from '../../../shared/clients/stepFunctionsClient'
import { StsClient } from '../../../shared/clients/stsClient'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'

import '../../../shared/utilities/asyncIteratorShim'
import { asyncGenerator } from '../../utilities/collectionUtils'

interface Clients {
    cloudFormationClient: CloudFormationClient
    cloudWatchLogsClient: CloudWatchLogsClient
    ecsClient: EcsClient
    iamClient: IamClient
    lambdaClient: LambdaClient
    schemaClient: SchemaClient
    stepFunctionsClient: StepFunctionsClient
    stsClient: StsClient
}

export class MockToolkitClientBuilder implements ToolkitClientBuilder {
    private readonly clients: Clients
    public constructor(overrideClients?: Partial<Clients>) {
        this.clients = {
            cloudFormationClient: new MockCloudFormationClient(),
            cloudWatchLogsClient: new MockCloudWatchLogsClient(),
            ecsClient: new MockEcsClient({}),
            iamClient: new MockIamClient({}),
            lambdaClient: new MockLambdaClient({}),
            schemaClient: new MockSchemaClient(),
            stepFunctionsClient: new MockStepFunctionsClient(),
            stsClient: new MockStsClient({}),
            ...overrideClients,
        }
    }

    public createCloudFormationClient(regionCode: string): CloudFormationClient {
        return this.clients.cloudFormationClient
    }

    public createCloudWatchLogsClient(regionCode: string): CloudWatchLogsClient {
        return this.clients.cloudWatchLogsClient
    }

    public createSchemaClient(regionCode: string): SchemaClient {
        return this.clients.schemaClient
    }

    public createIamClient(): IamClient {
        return this.clients.iamClient
    }

    public createEcsClient(regionCode: string): EcsClient {
        return this.clients.ecsClient
    }

    public createLambdaClient(regionCode: string): LambdaClient {
        return this.clients.lambdaClient
    }

    public createStepFunctionsClient(regionCode: string): StepFunctionsClient {
        return this.clients.stepFunctionsClient
    }

    public createStsClient(regionCode: string): StsClient {
        return this.clients.stsClient
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
            StackResources: [],
        })
    ) {}
}

export class MockCloudWatchLogsClient implements CloudWatchLogsClient {
    public constructor(
        public readonly regionCode: string = '',

        public readonly describeLogGroups: (
            statusFilter?: string[]
        ) => AsyncIterableIterator<CloudWatchLogs.LogGroup> = (statusFilter?: string[]) => asyncGenerator([]),

        public readonly describeLogStreams: (
            request: CloudWatchLogs.DescribeLogStreamsRequest
        ) => Promise<CloudWatchLogs.DescribeLogStreamsResponse> = async (
            request: CloudWatchLogs.DescribeLogStreamsRequest
        ) => {
            return {}
        },

        public readonly getLogEvents: (
            request: CloudWatchLogs.GetLogEventsRequest
        ) => Promise<CloudWatchLogs.GetLogEventsResponse> = async (request: CloudWatchLogs.GetLogEventsRequest) => {
            return {}
        }
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

export class MockEcsClient implements EcsClient {
    public readonly regionCode: string
    public readonly listClusters: () => AsyncIterableIterator<string>
    public readonly listServices: (cluster: string) => AsyncIterableIterator<string>
    public readonly listTaskDefinitionFamilies: () => AsyncIterableIterator<string>

    public constructor({
        regionCode = '',
        listClusters = () => asyncGenerator([]),
        listServices = (cluster: string) => asyncGenerator([]),
        listTaskDefinitionFamilies = () => asyncGenerator([]),
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

export class MockIamClient implements IamClient {
    public readonly listRoles: () => Promise<IAM.ListRolesResponse>

    public constructor({ listRoles = async () => ({ Roles: [] }) }: { listRoles?(): Promise<IAM.ListRolesResponse> }) {
        this.listRoles = listRoles
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
        listFunctions = () => asyncGenerator([]),
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

export class MockStepFunctionsClient implements StepFunctionsClient {
    public constructor(
        public readonly regionCode: string = '',

        public readonly listStateMachines: () => AsyncIterableIterator<StepFunctions.StateMachineListItem> = () =>
            asyncGenerator([]),

        public readonly getStateMachineDetails: (
            arn: string
        ) => Promise<StepFunctions.DescribeStateMachineOutput> = async (arn: string) => ({
            stateMachineArn: '',
            roleArn: '',
            name: '',
            definition: '',
            type: '',
            creationDate: new Date(),
        }),

        public readonly executeStateMachine: (
            arn: string,
            input: string
        ) => Promise<StepFunctions.StartExecutionOutput> = async (arn: string, input: string) => ({
            executionArn: '',
            startDate: new Date(),
        }),

        public readonly createStateMachine: (
            params: StepFunctions.CreateStateMachineInput
        ) => Promise<StepFunctions.CreateStateMachineOutput> = async (
            params: StepFunctions.CreateStateMachineInput
        ) => ({
            stateMachineArn: '',
            creationDate: new Date(),
        }),

        public readonly updateStateMachine: (
            params: StepFunctions.UpdateStateMachineInput
        ) => Promise<StepFunctions.UpdateStateMachineOutput> = async (
            params: StepFunctions.UpdateStateMachineInput
        ) => ({
            updateDate: new Date(),
        })
    ) {}
}

export class MockStsClient implements StsClient {
    public readonly regionCode: string
    public readonly getCallerIdentity: () => Promise<STS.GetCallerIdentityResponse>

    public constructor({
        regionCode = '',
        getCallerIdentity = async () => ({}),
    }: {
        regionCode?: string
        getCallerIdentity?(): Promise<STS.GetCallerIdentityResponse>
    }) {
        this.regionCode = regionCode
        this.getCallerIdentity = getCallerIdentity
    }
}
