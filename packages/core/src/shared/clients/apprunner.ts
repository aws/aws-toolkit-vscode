/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRunner } from 'aws-sdk'
import globals from '../extensionGlobals'
import {
    AppRunnerClient as AppRunnerClientSDK,
    ConnectionSummary,
    CreateConnectionCommand,
    CreateConnectionRequest,
    CreateConnectionResponse,
    DeleteServiceCommand,
    DeleteServiceRequest,
    DeleteServiceResponse,
    DescribeServiceCommand,
    DescribeServiceRequest,
    DescribeServiceResponse,
    ListConnectionsCommand,
    ListConnectionsRequest,
    ListConnectionsResponse,
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
    Service,
    ServiceSummary,
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

export type AppRunnerService = RequiredProps<Service, 'ServiceName' | 'ServiceArn' | 'Status' | 'ServiceId'>
export type AppRunnerServiceSummary = RequiredProps<
    ServiceSummary,
    'ServiceName' | 'ServiceArn' | 'Status' | 'ServiceId'
>

// Note: Many of the requests return a type of Service, but Service <: ServiceSummary.
type WithServiceSummary<T> = Omit<T, 'Service'> & { Service: AppRunnerServiceSummary }
export class AppRunnerClient extends ClientWrapper<AppRunnerClientSDK> {
    public constructor(regionCode: string) {
        super(regionCode, AppRunnerClientSDK)
    }

    public async createService(request: AppRunner.CreateServiceRequest): Promise<AppRunner.CreateServiceResponse> {
        return (await this.createSdkClient()).createService(request).promise()
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

    public async listOperations(request: AppRunner.ListOperationsRequest): Promise<AppRunner.ListOperationsResponse> {
        return (await this.createSdkClient()).listOperations(request).promise()
    }

    public async deleteService(request: DeleteServiceRequest): Promise<WithServiceSummary<DeleteServiceResponse>> {
        return this.makeRequest(DeleteServiceCommand, request)
    }

    protected async createSdkClient(): Promise<AppRunner> {
        return await globals.sdkClientBuilder.createAwsService(AppRunner, undefined, this.regionCode)
    }
}
