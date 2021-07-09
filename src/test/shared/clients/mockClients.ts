/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { S3 } from 'aws-sdk'
import { APIGateway, CloudFormation, CloudWatchLogs, IAM, Lambda, Schemas, StepFunctions, STS, SSM } from 'aws-sdk'
import { ApiGatewayClient } from '../../../shared/clients/apiGatewayClient'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { CloudWatchLogsClient } from '../../../shared/clients/cloudWatchLogsClient'
import { EcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { EcsClient } from '../../../shared/clients/ecsClient'
import { IamClient } from '../../../shared/clients/iamClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { SchemaClient } from '../../../shared/clients/schemaClient'
import { StepFunctionsClient } from '../../../shared/clients/stepFunctionsClient'
import { StsClient } from '../../../shared/clients/stsClient'
import { SsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'

import '../../../shared/utilities/asyncIteratorShim'
import { asyncGenerator } from '../../utilities/collectionUtils'
import {
    S3Client,
    CreateBucketRequest,
    ListFilesRequest,
    CreateFolderRequest,
    DownloadFileRequest,
    UploadFileRequest,
    ListObjectVersionsRequest,
    DeleteObjectRequest,
    DeleteObjectsRequest,
    DeleteBucketRequest,
    CreateBucketResponse,
    ListBucketsResponse,
    ListFilesResponse,
    CreateFolderResponse,
    ListObjectVersionsResponse,
    DeleteObjectsResponse,
} from '../../../shared/clients/s3Client'

interface Clients {
    apiGatewayClient: ApiGatewayClient
    cloudFormationClient: CloudFormationClient
    cloudWatchLogsClient: CloudWatchLogsClient
    ecrClient: EcrClient
    ecsClient: EcsClient
    iamClient: IamClient
    lambdaClient: LambdaClient
    schemaClient: SchemaClient
    stepFunctionsClient: StepFunctionsClient
    stsClient: StsClient
    s3Client: S3Client
    ssmDocumentClient: SsmDocumentClient
}

export class MockToolkitClientBuilder implements ToolkitClientBuilder {
    private readonly clients: Clients
    public constructor(overrideClients?: Partial<Clients>) {
        this.clients = {
            apiGatewayClient: new MockApiGatewayClient(),
            cloudFormationClient: new MockCloudFormationClient(),
            cloudWatchLogsClient: new MockCloudWatchLogsClient(),
            ecsClient: new MockEcsClient({}),
            ecrClient: new MockEcrClient({}),
            iamClient: new MockIamClient({}),
            lambdaClient: new MockLambdaClient({}),
            schemaClient: new MockSchemaClient(),
            stepFunctionsClient: new MockStepFunctionsClient(),
            stsClient: new MockStsClient({}),
            s3Client: new MockS3Client({}),
            ssmDocumentClient: new MockSsmDocumentClient(),
            ...overrideClients,
        }
    }

    public createApiGatewayClient(regionCode: string): ApiGatewayClient {
        return this.clients.apiGatewayClient
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

    public createEcrClient(): EcrClient {
        return this.clients.ecrClient
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

    public createS3Client(regionCode: string): S3Client {
        return this.clients.s3Client
    }

    public createSsmClient(regionCode: string): SsmDocumentClient {
        return this.clients.ssmDocumentClient
    }
}

export class MockApiGatewayClient implements ApiGatewayClient {
    public constructor(public readonly regionCode: string = '') {}

    getResourcesForApi(apiId: string): AsyncIterableIterator<APIGateway.Resource> {
        return asyncGenerator([])
    }

    getStages(apiId: string): Promise<APIGateway.Stages> {
        return Promise.resolve({})
    }

    listApis(): AsyncIterableIterator<APIGateway.RestApi> {
        return asyncGenerator([])
    }

    testInvokeMethod(
        apiId: string,
        resourceId: string,
        method: string,
        body: string,
        pathWithQueryString: string | undefined
    ): Promise<APIGateway.TestInvokeMethodResponse> {
        return Promise.resolve({})
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

export class MockEcrClient implements EcrClient {
    public readonly regionCode: string
    public readonly describeRepositories: () => AsyncIterableIterator<EcrRepository>
    public readonly describeTags: (repositoryName: string) => AsyncIterableIterator<string>
    public readonly deleteRepository: (repositoryName: string) => Promise<void>
    public readonly deleteTag: (repositoryName: string, tag: string) => Promise<void>
    public readonly createRepository: (repositoryName: string) => Promise<void>

    public constructor({
        regionCode = '',
        describeRepositories = () => asyncGenerator([]),
        describeTags = () => asyncGenerator([]),
        deleteRepository = async () => {},
        deleteTag = async () => {},
        createRepository = async () => {},
    }: {
        regionCode?: string
        describeRepositories?(): AsyncIterableIterator<EcrRepository>
        describeTags?(): AsyncIterableIterator<string>
        deleteRepository?(): Promise<void>
        deleteTag?(): Promise<void>
        createRepository?(): Promise<void>
    }) {
        this.regionCode = regionCode
        this.describeRepositories = describeRepositories
        this.describeTags = describeTags
        this.deleteRepository = deleteRepository
        this.deleteTag = deleteTag
        this.createRepository = createRepository
    }
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
    public readonly regionCode = ''
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
    public readonly getFunction: (name: string) => Promise<Lambda.GetFunctionResponse>
    public readonly updateFunctionCode: (name: string, zipFile: Buffer) => Promise<Lambda.FunctionConfiguration>

    public constructor({
        regionCode = '',
        deleteFunction = async (name: string) => {},
        invoke = async (name: string, payload?: Lambda._Blob) => ({}),
        listFunctions = () => asyncGenerator([]),
        getFunction = async (name: string) => ({}),
        updateFunctionCode = async (name: string, zipFile: Buffer) => ({}),
    }: {
        regionCode?: string
        deleteFunction?(name: string): Promise<void>
        invoke?(name: string, payload?: Lambda._Blob): Promise<Lambda.InvocationResponse>
        listFunctions?(): AsyncIterableIterator<Lambda.FunctionConfiguration>
        getFunction?(name: string): Promise<Lambda.GetFunctionResponse>
        updateFunctionCode?(name: string, zipFile: Buffer): Promise<Lambda.FunctionConfiguration>
    }) {
        this.regionCode = regionCode
        this.deleteFunction = deleteFunction
        this.invoke = invoke
        this.listFunctions = listFunctions
        this.getFunction = getFunction
        this.updateFunctionCode = updateFunctionCode
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

export class MockSsmDocumentClient implements SsmDocumentClient {
    public constructor(
        public readonly regionCode: string = '',

        public readonly deleteDocument: (documentName: string) => Promise<SSM.Types.DeleteDocumentResult> = async (
            documentName: string
        ) => ({} as SSM.Types.DeleteDocumentResult),

        public readonly listDocuments: () => AsyncIterableIterator<SSM.DocumentIdentifier> = () => asyncGenerator([]),

        public readonly listDocumentVersions: (
            documentName: string
        ) => AsyncIterableIterator<SSM.Types.DocumentVersionInfo> = (documentName: string) => asyncGenerator([]),

        public readonly describeDocument: (
            documentName: string,
            documentVersion?: string
        ) => Promise<SSM.DescribeDocumentResult> = async (documentName: string, documentVersion?: string) =>
            ({
                Document: {
                    Name: '',
                    DocumentType: '',
                    DocumentFormat: '',
                },
            } as SSM.Types.DescribeDocumentResult),

        public readonly getDocument: (
            documentName: string,
            documentVersion?: string
        ) => Promise<SSM.Types.GetDocumentResult> = async (documentName: string, documentVersion?: string) =>
            ({
                Name: '',
                DocumentType: '',
                Content: '',
                DocumentFormat: '',
            } as SSM.Types.GetDocumentResult),

        public readonly createDocument: (
            request: SSM.Types.CreateDocumentRequest
        ) => Promise<SSM.Types.CreateDocumentResult> = async (request: SSM.Types.CreateDocumentRequest) => ({}),

        public readonly updateDocument: (
            request: SSM.Types.UpdateDocumentRequest
        ) => Promise<SSM.Types.UpdateDocumentResult> = async (request: SSM.Types.UpdateDocumentRequest) => ({}),

        public readonly updateDocumentVersion: (
            documentName: string,
            documentVersion: string
        ) => Promise<SSM.Types.UpdateDocumentDefaultVersionResult> = async (
            documentName: string,
            documentVersion: string
        ) => ({})
    ) {}
}
export class MockS3Client implements S3Client {
    public readonly regionCode: string

    public readonly createBucket: (request: CreateBucketRequest) => Promise<CreateBucketResponse>
    public readonly listAllBuckets: () => Promise<S3.Bucket[]>
    public readonly listBuckets: () => Promise<ListBucketsResponse>
    public readonly listFiles: (request: ListFilesRequest) => Promise<ListFilesResponse>
    public readonly createFolder: (request: CreateFolderRequest) => Promise<CreateFolderResponse>
    public readonly downloadFile: (request: DownloadFileRequest) => Promise<void>
    public readonly uploadFile: (request: UploadFileRequest) => Promise<void>
    public readonly listObjectVersions: (request: ListObjectVersionsRequest) => Promise<ListObjectVersionsResponse>
    public readonly listObjectVersionsIterable: (
        request: ListObjectVersionsRequest
    ) => AsyncIterableIterator<ListObjectVersionsResponse>
    public readonly deleteObject: (request: DeleteObjectRequest) => Promise<void>
    public readonly deleteObjects: (request: DeleteObjectsRequest) => Promise<DeleteObjectsResponse>
    public readonly deleteBucket: (request: DeleteBucketRequest) => Promise<void>

    public constructor({
        regionCode = '',
        createBucket = async (request: CreateBucketRequest) => ({ bucket: { name: '', region: '', arn: '' } }),
        listAllBuckets = async () => [],
        listBuckets = async () => ({ buckets: [] }),
        listFiles = async (request: ListFilesRequest) => ({ files: [], folders: [] }),
        createFolder = async (request: CreateFolderRequest) => ({ folder: { name: '', path: '', arn: '' } }),
        downloadFile = async (request: DownloadFileRequest) => {},
        uploadFile = async (request: UploadFileRequest) => {},
        listObjectVersions = async (request: ListObjectVersionsRequest) => ({ objects: [] }),
        listObjectVersionsIterable = (request: ListObjectVersionsRequest) => asyncGenerator([]),
        deleteObject = async (request: DeleteObjectRequest) => {},
        deleteObjects = async (request: DeleteObjectsRequest) => ({ errors: [] }),
        deleteBucket = async (request: DeleteBucketRequest) => {},
    }: {
        regionCode?: string
        createBucket?(request: CreateBucketRequest): Promise<CreateBucketResponse>
        listAllBuckets?(): Promise<S3.Bucket[]>
        listBuckets?(): Promise<ListBucketsResponse>
        listFiles?(request: ListFilesRequest): Promise<ListFilesResponse>
        createFolder?(request: CreateFolderRequest): Promise<CreateFolderResponse>
        downloadFile?(request: DownloadFileRequest): Promise<void>
        uploadFile?(request: UploadFileRequest): Promise<void>
        listObjectVersions?(request: ListObjectVersionsRequest): Promise<ListObjectVersionsResponse>
        listObjectVersionsIterable?(
            request: ListObjectVersionsRequest
        ): AsyncIterableIterator<ListObjectVersionsResponse>
        deleteObject?(request: DeleteObjectRequest): Promise<void>
        deleteObjects?(request: DeleteObjectsRequest): Promise<DeleteObjectsResponse>
        deleteBucket?(request: DeleteBucketRequest): Promise<void>
    }) {
        this.regionCode = regionCode
        this.createBucket = createBucket
        this.listAllBuckets = listAllBuckets
        this.listBuckets = listBuckets
        this.listFiles = listFiles
        this.createFolder = createFolder
        this.downloadFile = downloadFile
        this.uploadFile = uploadFile
        this.listObjectVersions = listObjectVersions
        this.listObjectVersionsIterable = listObjectVersionsIterable
        this.deleteObject = deleteObject
        this.deleteObjects = deleteObjects
        this.deleteBucket = deleteBucket
    }
}
