/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRunner } from 'aws-sdk'
import globals from '../extensionGlobals'
import {
    AppRunnerClient as AppRunnerClientSDK,
    DeleteServiceCommand,
    DeleteServiceRequest,
    DeleteServiceResponse,
    DescribeServiceCommand,
    DescribeServiceRequest,
    DescribeServiceResponse,
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
import { RequiredProps } from '../utilities/tsUtils'

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

    public paginateServices(request: ListServicesRequest) {
        return this.makePaginatedRequest(paginateListServices, request, (page) => page.ServiceSummaryList)
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

    public async createConnection(
        request: AppRunner.CreateConnectionRequest
    ): Promise<AppRunner.CreateConnectionResponse> {
        return (await this.createSdkClient()).createConnection(request).promise()
    }

    public async listConnections(
        request: AppRunner.ListConnectionsRequest = {}
    ): Promise<AppRunner.ListConnectionsResponse> {
        return (await this.createSdkClient()).listConnections(request).promise()
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
