/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    APIGateway,
    AppRunner,
    CloudControl,
    CloudFormation,
    CloudWatchLogs,
    ECS,
    IAM,
    Iot,
    Lambda,
    Schemas,
    S3,
    StepFunctions,
    STS,
    SSM,
} from 'aws-sdk'
import { ApiGatewayClient } from '../../../shared/clients/apiGatewayClient'
import { CloudControlClient } from '../../../shared/clients/cloudControlClient'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { CloudWatchLogsClient } from '../../../shared/clients/cloudWatchLogsClient'
import { EcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { EcsResourceAndToken, EcsClient } from '../../../shared/clients/ecsClient'
import { IamClient } from '../../../shared/clients/iamClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { SchemaClient } from '../../../shared/clients/schemaClient'
import { StepFunctionsClient } from '../../../shared/clients/stepFunctionsClient'
import { StsClient } from '../../../shared/clients/stsClient'
import { SsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'
import { IotClient, ListThingCertificatesResponse } from '../../../shared/clients/iotClient'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'

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
    SignedUrlRequest,
} from '../../../shared/clients/s3Client'
import { AppRunnerClient } from '../../../shared/clients/apprunnerClient'
import globals from '../../../shared/extensionGlobals'

interface Clients {
    apiGatewayClient: ApiGatewayClient
    cloudControlClient: CloudControlClient
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
    iotClient: IotClient
    ssmDocumentClient: SsmDocumentClient
    apprunnerClient: AppRunnerClient
}

export class MockToolkitClientBuilder implements ToolkitClientBuilder {
    private readonly clients: Clients
    public constructor(overrideClients?: Partial<Clients>) {
        this.clients = {
            apiGatewayClient: new MockApiGatewayClient(),
            cloudControlClient: new MockCloudControlClient(),
            cloudFormationClient: new MockCloudFormationClient(),
            cloudWatchLogsClient: new MockCloudWatchLogsClient(),
            ecsClient: new MockEcsClient({}),
            ecrClient: new MockEcrClient({}),
            iamClient: new MockIamClient(),
            lambdaClient: new MockLambdaClient({}),
            schemaClient: new MockSchemaClient(),
            stepFunctionsClient: new MockStepFunctionsClient(),
            stsClient: new MockStsClient({}),
            s3Client: new MockS3Client({}),
            iotClient: new MockIotClient({}),
            ssmDocumentClient: new MockSsmDocumentClient(),
            apprunnerClient: new MockAppRunnerClient(),
            ...overrideClients,
        }
    }

    public createAppRunnerClient(regionCode: string): AppRunnerClient {
        return this.clients.apprunnerClient
    }

    public createApiGatewayClient(regionCode: string): ApiGatewayClient {
        return this.clients.apiGatewayClient
    }

    public createCloudControlClient(regionCode: string): CloudControlClient {
        return this.clients.cloudControlClient
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

    public createIotClient(regionCode: string): IotClient {
        return this.clients.iotClient
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
        }),

        public readonly describeType: (typeName: string) => Promise<CloudFormation.DescribeTypeOutput> = async (
            typeName: string
        ) =>
            ({
                TypeName: '',
            } as CloudFormation.DescribeTypeOutput),

        public readonly listTypes: () => AsyncIterableIterator<CloudFormation.TypeSummary> = () => asyncGenerator([])
    ) {}
}

export class MockCloudControlClient implements CloudControlClient {
    public constructor(
        public readonly regionCode: string = '',

        public readonly createResource: (
            request: CloudControl.CreateResourceInput
        ) => Promise<CloudControl.CreateResourceOutput> = async (request: CloudControl.CreateResourceInput) =>
            ({
                ProgressEvent: '',
            } as CloudControl.CreateResourceOutput),
        public readonly deleteResource: (request: CloudControl.DeleteResourceInput) => Promise<void> = async (
            request: CloudControl.DeleteResourceInput
        ) => {},
        public readonly listResources: (
            request: CloudControl.ListResourcesInput
        ) => Promise<CloudControl.ListResourcesOutput> = async (request: CloudControl.ListResourcesInput) => ({
            TypeName: '',
            ResourceDescriptions: [],
            NextToken: '',
        }),
        public readonly getResource: (
            request: CloudControl.GetResourceInput
        ) => Promise<CloudControl.GetResourceOutput> = async (request: CloudControl.GetResourceInput) =>
            ({
                TypeName: '',
                ResourceDescription: {
                    Identifier: '',
                    ResourceModel: '',
                },
            } as CloudControl.GetResourceOutput),

        public readonly updateResource: (request: CloudControl.UpdateResourceInput) => Promise<void> = async (
            request: CloudControl.UpdateResourceInput
        ) => {}
    ) {}
}

export class MockCloudWatchLogsClient implements CloudWatchLogsClient {
    public constructor(
        public readonly regionCode: string = '',

        public readonly describeLogGroups: (
            request?: CloudWatchLogs.DescribeLogGroupsRequest
        ) => AsyncIterableIterator<CloudWatchLogs.LogGroup> = () => asyncGenerator([]),

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
    public readonly getClusters: (nextToken?: string) => Promise<EcsResourceAndToken>
    public readonly getServices: (cluster: string, nextToken?: string) => Promise<EcsResourceAndToken>
    public readonly getContainerNames: (taskDefinition: string) => Promise<string[]>
    public readonly listTasks: (cluster: string, serviceName: string) => Promise<string[]>
    public readonly describeTasks: (cluster: string, tasks: string[]) => Promise<ECS.Task[]>
    public readonly updateService: (cluster: string, serviceName: string, enable: boolean) => Promise<void>
    public readonly describeServices: (cluster: string, services: string[]) => Promise<ECS.Service[]>
    public readonly executeCommand: (
        cluster: string,
        container: string,
        task: string,
        command: string
    ) => Promise<ECS.ExecuteCommandResponse>

    public constructor({
        regionCode = '',
        getClusters = async () => ({ resource: [], nextToken: undefined }),
        getServices = async () => ({ resource: [], nextToken: undefined }),
        listContainerNames = async () => [],
        listTasks = async () => [],
        describeTasks = async () => [],
        updateService = async () => undefined,
        describeServices = async () => [],
        executeCommand = async () => ({} as ECS.ExecuteCommandResponse),
    }: {
        regionCode?: string
        getClusters?(): Promise<EcsResourceAndToken>
        getServices?(): Promise<EcsResourceAndToken>
        listContainerNames?(): Promise<string[]>
        listTasks?(): Promise<string[]>
        describeTasks?(): Promise<ECS.Task[]>
        updateService?(): Promise<void>
        describeServices?(): Promise<ECS.Service[]>
        executeCommand?(): Promise<ECS.ExecuteCommandResponse>
    }) {
        this.regionCode = regionCode
        this.getClusters = getClusters
        this.getServices = getServices
        this.getContainerNames = listContainerNames
        this.listTasks = listTasks
        this.describeTasks = describeTasks
        this.updateService = updateService
        this.describeServices = describeServices
        this.executeCommand = executeCommand
    }
}

export class MockIamClient implements IamClient {
    public readonly regionCode = ''

    public constructor() {}
    public listRoles(request?: IAM.ListRolesRequest): Promise<IAM.Role[]> {
        throw new Error('Method not implemented.')
    }
    public getRoles(request: IAM.ListRolesRequest = {}): AsyncIterableIterator<IAM.Role> {
        throw new Error('Method not implemented.')
    }
    public createRole(request: IAM.CreateRoleRequest): Promise<IAM.CreateRoleResponse> {
        throw new Error('Method not implemented.')
    }
    public attachRolePolicy(request: IAM.AttachRolePolicyRequest): Promise<void> {
        throw new Error('Method not implemented.')
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
            creationDate: new globals.clock.Date(),
        }),

        public readonly executeStateMachine: (
            arn: string,
            input: string
        ) => Promise<StepFunctions.StartExecutionOutput> = async (arn: string, input: string) => ({
            executionArn: '',
            startDate: new globals.clock.Date(),
        }),

        public readonly createStateMachine: (
            params: StepFunctions.CreateStateMachineInput
        ) => Promise<StepFunctions.CreateStateMachineOutput> = async (
            params: StepFunctions.CreateStateMachineInput
        ) => ({
            stateMachineArn: '',
            creationDate: new globals.clock.Date(),
        }),

        public readonly updateStateMachine: (
            params: StepFunctions.UpdateStateMachineInput
        ) => Promise<StepFunctions.UpdateStateMachineOutput> = async (
            params: StepFunctions.UpdateStateMachineInput
        ) => ({
            updateDate: new globals.clock.Date(),
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

    assumeRole(request: STS.AssumeRoleRequest): Promise<STS.AssumeRoleResponse> {
        throw new Error('Method not implemented.')
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
    public readonly uploadFile: (request: UploadFileRequest) => Promise<S3.ManagedUpload>
    public readonly listObjectVersions: (request: ListObjectVersionsRequest) => Promise<ListObjectVersionsResponse>
    public readonly listObjectVersionsIterable: (
        request: ListObjectVersionsRequest
    ) => AsyncIterableIterator<ListObjectVersionsResponse>
    public readonly deleteObject: (request: DeleteObjectRequest) => Promise<void>
    public readonly deleteObjects: (request: DeleteObjectsRequest) => Promise<DeleteObjectsResponse>
    public readonly deleteBucket: (request: DeleteBucketRequest) => Promise<void>
    public readonly getSignedUrl: (request: SignedUrlRequest) => Promise<string>

    public constructor({
        regionCode = '',
        createBucket = async (request: CreateBucketRequest) => ({ bucket: { name: '', region: '', arn: '' } }),
        listAllBuckets = async () => [],
        listBuckets = async () => ({ buckets: [] }),
        listFiles = async (request: ListFilesRequest) => ({ files: [], folders: [] }),
        createFolder = async (request: CreateFolderRequest) => ({ folder: { name: '', path: '', arn: '' } }),
        downloadFile = async (request: DownloadFileRequest) => {},
        getSignedUrl = async (request: SignedUrlRequest) => '',
        uploadFile = async (request: UploadFileRequest) => {
            return new S3.ManagedUpload({})
        },
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
        getSignedUrl?(request: SignedUrlRequest): Promise<string>
        uploadFile?(request: UploadFileRequest): Promise<S3.ManagedUpload>
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
        this.getSignedUrl = getSignedUrl
        this.uploadFile = uploadFile
        this.listObjectVersions = listObjectVersions
        this.listObjectVersionsIterable = listObjectVersionsIterable
        this.deleteObject = deleteObject
        this.deleteObjects = deleteObjects
        this.deleteBucket = deleteBucket
    }
}

export class MockIotClient implements IotClient {
    public readonly regionCode: string

    public readonly listThings: () => Promise<Iot.ListThingsResponse>
    public readonly createThing: (request: Iot.CreateThingRequest) => Promise<Iot.CreateThingResponse>
    public readonly deleteThing: (request: Iot.DeleteThingRequest) => Promise<void>
    public readonly listCertificates: (request: Iot.ListCertificatesRequest) => Promise<Iot.ListCertificatesResponse>
    public readonly listThingCertificates: (
        request: Iot.ListThingPrincipalsRequest
    ) => Promise<ListThingCertificatesResponse>
    public readonly createCertificateAndKeys: (
        request: Iot.CreateKeysAndCertificateRequest
    ) => Promise<Iot.CreateKeysAndCertificateResponse>
    public readonly updateCertificate: (request: Iot.UpdateCertificateRequest) => Promise<void>
    public readonly deleteCertificate: (request: Iot.DeleteCertificateRequest) => Promise<void>
    public readonly attachThingPrincipal: (request: Iot.AttachThingPrincipalRequest) => Promise<void>
    public readonly detachThingPrincipal: (request: Iot.DetachThingPrincipalRequest) => Promise<void>
    public readonly listPolicies: (request: Iot.ListPoliciesRequest) => Promise<Iot.ListPoliciesResponse>
    public readonly listPrincipalPolicies: (
        request: Iot.ListPrincipalPoliciesRequest
    ) => Promise<Iot.ListPoliciesResponse>
    public readonly attachPolicy: (request: Iot.AttachPolicyRequest) => Promise<void>
    public readonly detachPolicy: (request: Iot.DetachPolicyRequest) => Promise<void>
    public readonly createPolicy: (request: Iot.CreatePolicyRequest) => Promise<void>
    public readonly deletePolicy: (request: Iot.DeletePolicyRequest) => Promise<void>
    public readonly listThingsForCert: (request: Iot.ListPrincipalThingsRequest) => Promise<string[]>
    public readonly listThingPrincipals: (
        request: Iot.ListThingPrincipalsRequest
    ) => Promise<Iot.ListThingPrincipalsResponse>
    public readonly getEndpoint: () => Promise<string>
    public readonly listPolicyVersions: () => AsyncIterableIterator<Iot.PolicyVersion>
    public readonly createPolicyVersion: (request: Iot.CreatePolicyVersionRequest) => Promise<void>
    public readonly deletePolicyVersion: (request: Iot.DeletePolicyVersionRequest) => Promise<void>
    public readonly setDefaultPolicyVersion: (request: Iot.SetDefaultPolicyVersionRequest) => Promise<void>
    public readonly getPolicyVersion: (request: Iot.GetPolicyVersionRequest) => Promise<Iot.GetPolicyVersionResponse>
    public readonly listPolicyTargets: (request: Iot.ListTargetsForPolicyRequest) => Promise<string[]>

    public constructor({
        regionCode = '',
        listThings = async () => ({ things: [], nextToken: undefined }),
        createThing = async (request: Iot.CreateThingRequest) => ({ thingName: '', thingArn: '' }),
        deleteThing = async (request: Iot.DeleteThingRequest) => {},
        listCertificates = async (request: Iot.ListCertificatesRequest) => ({
            certificates: [],
            nextMarker: undefined,
        }),
        listThingCertificates = async (request: Iot.ListThingPrincipalsRequest) => ({
            certificates: [],
            nextToken: undefined,
        }),
        createCertificateAndKeys = async (request: Iot.CreateKeysAndCertificateRequest) => ({
            certificateId: '',
            certificatePem: '',
            keyPair: {
                PrivateKey: '',
                PublicKey: '',
            },
        }),
        updateCertificate = async (request: Iot.UpdateCertificateRequest) => {},
        deleteCertificate = async (request: Iot.DeleteCertificateRequest) => {},
        attachThingPrincipal = async (request: Iot.AttachThingPrincipalRequest) => {},
        detachThingPrincipal = async (request: Iot.DetachThingPrincipalRequest) => {},
        listPolicies = async (request: Iot.ListPoliciesRequest) => ({ policies: [], nextMarker: undefined }),
        listPrincipalPolicies = async (request: Iot.ListPrincipalPoliciesRequest) => ({
            policies: [],
            nextMarker: undefined,
        }),
        attachPolicy = async (request: Iot.AttachPolicyRequest) => {},
        detachPolicy = async (request: Iot.DetachPolicyRequest) => {},
        createPolicy = async (request: Iot.CreatePolicyRequest) => {},
        deletePolicy = async (request: Iot.DeletePolicyRequest) => {},
        listThingsForCert = async (request: Iot.ListPrincipalThingsRequest) => [],
        listThingPrincipals = async (request: Iot.ListThingPrincipalsRequest) => ({
            principals: [],
            nextToken: undefined,
        }),
        getEndpoint = async () => '',
        listPolicyVersions = () => asyncGenerator([]),
        createPolicyVersion = async (request: Iot.CreatePolicyVersionRequest) => {},
        deletePolicyVersion = async (request: Iot.DeletePolicyVersionRequest) => {},
        setDefaultPolicyVersion = async (request: Iot.SetDefaultPolicyVersionRequest) => {},
        getPolicyVersion = async (request: Iot.GetPolicyVersionRequest) => ({
            policyDocument: '',
        }),
        listPolicyTargets = async (request: Iot.ListTargetsForPolicyRequest) => [],
    }: {
        regionCode?: string
        listThings?(): Promise<Iot.ListThingsResponse>
        createThing?(request: Iot.CreateThingRequest): Promise<Iot.CreateThingResponse>
        deleteThing?(request: Iot.DeleteThingRequest): Promise<void>
        listCertificates?(request: Iot.ListCertificatesRequest): Promise<Iot.ListCertificatesResponse>
        listThingCertificates?(request: Iot.ListThingPrincipalsRequest): Promise<ListThingCertificatesResponse>
        createCertificateAndKeys?(
            request: Iot.CreateKeysAndCertificateRequest
        ): Promise<Iot.CreateKeysAndCertificateResponse>
        updateCertificate?(request: Iot.UpdateCertificateRequest): Promise<void>
        deleteCertificate?(request: Iot.DeleteCertificateRequest): Promise<void>
        attachThingPrincipal?(request: Iot.AttachThingPrincipalRequest): Promise<void>
        detachThingPrincipal?(request: Iot.DetachThingPrincipalRequest): Promise<void>
        listPolicies?(request: Iot.ListPoliciesRequest): Promise<Iot.ListPoliciesResponse>
        listPrincipalPolicies?(request: Iot.ListPrincipalPoliciesRequest): Promise<Iot.ListPoliciesResponse>
        attachPolicy?(request: Iot.AttachPolicyRequest): Promise<void>
        detachPolicy?(request: Iot.DetachPolicyRequest): Promise<void>
        createPolicy?(request: Iot.CreatePolicyRequest): Promise<void>
        deletePolicy?(request: Iot.DeletePolicyRequest): Promise<void>
        listThingsForCert?(request: Iot.ListPrincipalThingsRequest): Promise<string[]>
        listThingPrincipals?(request: Iot.ListThingPrincipalsRequest): Promise<Iot.ListThingPrincipalsResponse>
        getEndpoint?(): Promise<string>
        listPolicyVersions?(): AsyncIterableIterator<Iot.PolicyVersion>
        createPolicyVersion?(request: Iot.CreatePolicyVersionRequest): Promise<void>
        deletePolicyVersion?(request: Iot.DeletePolicyVersionRequest): Promise<void>
        setDefaultPolicyVersion?(request: Iot.SetDefaultPolicyVersionRequest): Promise<void>
        getPolicyVersion?(request: Iot.GetPolicyVersionRequest): Promise<Iot.GetPolicyVersionResponse>
        listPolicyTargets?(request: Iot.ListTargetsForPolicyRequest): Promise<string[]>
    }) {
        this.regionCode = regionCode
        this.listThings = listThings
        this.createThing = createThing
        this.deleteThing = deleteThing
        this.listCertificates = listCertificates
        this.listThingCertificates = listThingCertificates
        this.createCertificateAndKeys = createCertificateAndKeys
        this.updateCertificate = updateCertificate
        this.deleteCertificate = deleteCertificate
        this.attachThingPrincipal = attachThingPrincipal
        this.detachThingPrincipal = detachThingPrincipal
        this.listPolicies = listPolicies
        this.listPrincipalPolicies = listPrincipalPolicies
        this.attachPolicy = attachPolicy
        this.detachPolicy = detachPolicy
        this.createPolicy = createPolicy
        this.deletePolicy = deletePolicy
        this.listThingsForCert = listThingsForCert
        this.listThingPrincipals = listThingPrincipals
        this.getEndpoint = getEndpoint
        this.listPolicyVersions = listPolicyVersions
        this.createPolicyVersion = createPolicyVersion
        this.deletePolicyVersion = deletePolicyVersion
        this.setDefaultPolicyVersion = setDefaultPolicyVersion
        this.getPolicyVersion = getPolicyVersion
        this.listPolicyTargets = listPolicyTargets
    }
}

export class MockAppRunnerClient implements AppRunnerClient {
    public readonly regionCode: string = ''

    public constructor() {}

    public async createService(request: AppRunner.CreateServiceRequest): Promise<AppRunner.CreateServiceResponse> {
        throw new Error('Not implemented')
    }

    public async listServices(request: AppRunner.ListServicesRequest): Promise<AppRunner.ListServicesResponse> {
        throw new Error('Not implemented')
    }

    public async pauseService(request: AppRunner.PauseServiceRequest): Promise<AppRunner.PauseServiceResponse> {
        throw new Error('Not implemented')
    }

    public async resumeService(request: AppRunner.ResumeServiceRequest): Promise<AppRunner.ResumeServiceResponse> {
        throw new Error('Not implemented')
    }

    public async updateService(request: AppRunner.UpdateServiceRequest): Promise<AppRunner.UpdateServiceResponse> {
        throw new Error('Not implemented')
    }

    public async createConnection(
        request: AppRunner.CreateConnectionRequest
    ): Promise<AppRunner.CreateConnectionResponse> {
        throw new Error('Not implemented')
    }

    public async listConnections(
        request: AppRunner.ListConnectionsRequest
    ): Promise<AppRunner.ListConnectionsResponse> {
        throw new Error('Not implemented')
    }

    public async describeService(
        request: AppRunner.DescribeServiceRequest
    ): Promise<AppRunner.DescribeServiceResponse> {
        throw new Error('Not implemented')
    }

    public async startDeployment(
        request: AppRunner.StartDeploymentRequest
    ): Promise<AppRunner.StartDeploymentResponse> {
        throw new Error('Not implemented')
    }

    public async listOperations(request: AppRunner.ListOperationsRequest): Promise<AppRunner.ListOperationsResponse> {
        throw new Error('Not implemented')
    }

    public async deleteService(request: AppRunner.DeleteServiceRequest): Promise<AppRunner.DeleteServiceResponse> {
        throw new Error('Not implemented')
    }
}
