/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AppRunnerClient as AppRunnerClientSDK,
    CodeConfiguration,
    CodeConfigurationValues,
    CodeRepository,
    ConnectionSummary,
    CreateConnectionCommand,
    CreateConnectionRequest,
    CreateConnectionResponse,
    CreateServiceCommand,
    CreateServiceRequest,
    CreateServiceResponse,
    DeleteServiceCommand,
    DeleteServiceRequest,
    DeleteServiceResponse,
    DescribeServiceCommand,
    DescribeServiceRequest,
    DescribeServiceResponse,
    ImageRepository,
    ListConnectionsCommand,
    ListConnectionsRequest,
    ListConnectionsResponse,
    ListOperationsCommand,
    ListOperationsRequest,
    ListOperationsResponse,
    ListServicesCommand,
    ListServicesRequest,
    ListServicesResponse,
    paginateListServices,
    PauseServiceCommand,
    PauseServiceRequest,
    PauseServiceResponse,
    ResumeServiceCommand,
    ResumeServiceRequest,
    ResumeServiceResponse,
    ServiceSummary,
    SourceCodeVersion,
    SourceConfiguration,
    StartDeploymentCommand,
    StartDeploymentRequest,
    StartDeploymentResponse,
    UpdateServiceCommand,
    UpdateServiceRequest,
    UpdateServiceResponse,
} from '@aws-sdk/client-apprunner'
import { ClientWrapper } from './clientWrapper'
import { hasProps, RequiredProps } from '../utilities/tsUtils'
import { AsyncCollection } from '../utilities/asyncCollection'

export type AppRunnerServiceSummary = RequiredProps<
    ServiceSummary,
    'ServiceName' | 'ServiceArn' | 'Status' | 'ServiceId'
>
export interface AppRunnerImageRepository
    extends RequiredProps<ImageRepository, 'ImageIdentifier' | 'ImageRepositoryType'> {}

export type AppRunnerCodeConfigurationValues = RequiredProps<CodeConfigurationValues, 'Runtime'>
interface AppRunnerCodeConfiguration extends RequiredProps<CodeConfiguration, 'ConfigurationSource'> {
    CodeConfigurationValues: RequiredProps<CodeConfigurationValues, 'Runtime'>
}
export interface AppRunnerCodeRepository extends RequiredProps<CodeRepository, 'RepositoryUrl'> {
    SourceCodeVersion: RequiredProps<SourceCodeVersion, 'Type' | 'Value'>
    CodeConfiguration: AppRunnerCodeConfiguration
}
export interface AppRunnerSourceConfiguration extends SourceConfiguration {
    CodeRepository?: AppRunnerCodeRepository | undefined
    ImageRepository?: RequiredProps<ImageRepository, 'ImageIdentifier' | 'ImageRepositoryType'>
}
export interface AppRunnerCreateServiceRequest extends RequiredProps<CreateServiceRequest, 'ServiceName'> {
    SourceConfiguration: AppRunnerSourceConfiguration
}

// Note: Many of the requests return a type of Service, but Service <: ServiceSummary.
type WithServiceSummary<T> = Omit<T, 'Service'> & { Service: AppRunnerServiceSummary }
export class AppRunnerClient extends ClientWrapper<AppRunnerClientSDK> {
    public constructor(regionCode: string) {
        super(regionCode, AppRunnerClientSDK)
    }

    public async createService(
        request: AppRunnerCreateServiceRequest
    ): Promise<WithServiceSummary<CreateServiceResponse>> {
        return await this.makeRequest(CreateServiceCommand, request)
    }

    public async listServices(request: ListServicesRequest): Promise<ListServicesResponse> {
        return await this.makeRequest(ListServicesCommand, request)
    }

    public paginateServices(request: ListServicesRequest): AsyncCollection<AppRunnerServiceSummary[]> {
        return this.makePaginatedRequest(paginateListServices, request, (page) => page.ServiceSummaryList).map(
            (summaries) => summaries.filter(isServiceSummary)
        )

        function isServiceSummary(s: ServiceSummary): s is AppRunnerServiceSummary {
            return hasProps(s, 'ServiceName', 'ServiceArn', 'Status', 'ServiceId')
        }
    }

    public async pauseService(request: PauseServiceRequest): Promise<WithServiceSummary<PauseServiceResponse>> {
        return await this.makeRequest(PauseServiceCommand, request)
    }

    public async resumeService(request: ResumeServiceRequest): Promise<WithServiceSummary<ResumeServiceResponse>> {
        return await this.makeRequest(ResumeServiceCommand, request)
    }

    public async updateService(request: UpdateServiceRequest): Promise<WithServiceSummary<UpdateServiceResponse>> {
        return await this.makeRequest(UpdateServiceCommand, request)
    }

    public async createConnection(request: CreateConnectionRequest): Promise<CreateConnectionResponse> {
        return await this.makeRequest(CreateConnectionCommand, request)
    }

    public async listConnections(request: ListConnectionsRequest = {}): Promise<ConnectionSummary[]> {
        const result: ListConnectionsResponse = await this.makeRequest(ListConnectionsCommand, request)
        return result.ConnectionSummaryList ?? []
    }

    public async describeService(
        request: DescribeServiceRequest
    ): Promise<WithServiceSummary<DescribeServiceResponse>> {
        return await this.makeRequest(DescribeServiceCommand, request)
    }

    public async startDeployment(request: StartDeploymentRequest): Promise<StartDeploymentResponse> {
        return await this.makeRequest(StartDeploymentCommand, request)
    }

    public async listOperations(request: ListOperationsRequest): Promise<ListOperationsResponse> {
        return await this.makeRequest(ListOperationsCommand, request)
    }

    public async deleteService(request: DeleteServiceRequest): Promise<WithServiceSummary<DeleteServiceResponse>> {
        return this.makeRequest(DeleteServiceCommand, request)
    }
}
