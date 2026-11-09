/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AppRunner from '@aws-sdk/client-apprunner'
import { ClientWrapper } from './clientWrapper'
import { hasProps, RequiredProps } from '../utilities/tsUtils'
import { AsyncCollection } from '../utilities/asyncCollection'

export type ServiceSummary = RequiredProps<
    AppRunner.ServiceSummary,
    'ServiceName' | 'ServiceArn' | 'Status' | 'ServiceId'
>
export type ImageRepository = RequiredProps<AppRunner.ImageRepository, 'ImageIdentifier' | 'ImageRepositoryType'>

export type CodeConfigurationValues = RequiredProps<AppRunner.CodeConfigurationValues, 'Runtime'>
interface CodeConfiguration extends RequiredProps<AppRunner.CodeConfiguration, 'ConfigurationSource'> {
    CodeConfigurationValues: CodeConfigurationValues
}
export interface CodeRepository extends RequiredProps<AppRunner.CodeRepository, 'RepositoryUrl'> {
    SourceCodeVersion: RequiredProps<AppRunner.SourceCodeVersion, 'Type' | 'Value'>
    CodeConfiguration: CodeConfiguration
}
export interface SourceConfiguration extends AppRunner.SourceConfiguration {
    CodeRepository?: CodeRepository
    ImageRepository?: RequiredProps<ImageRepository, 'ImageIdentifier' | 'ImageRepositoryType'>
}
export interface CreateServiceRequest extends RequiredProps<AppRunner.CreateServiceRequest, 'ServiceName'> {
    SourceConfiguration: SourceConfiguration
}

// Note: Many of the requests return a type of Service, but Service <: ServiceSummary.
type WithServiceSummary<T> = Omit<T, 'Service'> & { Service: ServiceSummary }
export class AppRunnerClient extends ClientWrapper<AppRunner.AppRunnerClient> {
    public constructor(regionCode: string) {
        super(regionCode, AppRunner.AppRunnerClient)
    }

    public async createService(
        request: CreateServiceRequest
    ): Promise<WithServiceSummary<AppRunner.CreateServiceResponse>> {
        return await this.makeRequest(AppRunner.CreateServiceCommand, request)
    }

    public async listServices(request: AppRunner.ListServicesRequest): Promise<AppRunner.ListServicesResponse> {
        return await this.makeRequest(AppRunner.ListServicesCommand, request)
    }

    public paginateServices(request: AppRunner.ListServicesRequest): AsyncCollection<ServiceSummary[]> {
        return this.makePaginatedRequest(
            AppRunner.paginateListServices,
            request,
            (page) => page.ServiceSummaryList
        ).map((summaries) => summaries.filter(isServiceSummary))

        function isServiceSummary(s: AppRunner.ServiceSummary): s is ServiceSummary {
            return hasProps(s, 'ServiceName', 'ServiceArn', 'Status', 'ServiceId')
        }
    }

    public async pauseService(
        request: AppRunner.PauseServiceRequest
    ): Promise<WithServiceSummary<AppRunner.PauseServiceResponse>> {
        return await this.makeRequest(AppRunner.PauseServiceCommand, request)
    }

    public async resumeService(
        request: AppRunner.ResumeServiceRequest
    ): Promise<WithServiceSummary<AppRunner.ResumeServiceResponse>> {
        return await this.makeRequest(AppRunner.ResumeServiceCommand, request)
    }

    public async updateService(
        request: AppRunner.UpdateServiceRequest
    ): Promise<WithServiceSummary<AppRunner.UpdateServiceResponse>> {
        return await this.makeRequest(AppRunner.UpdateServiceCommand, request)
    }

    public async createConnection(
        request: AppRunner.CreateConnectionRequest
    ): Promise<AppRunner.CreateConnectionResponse> {
        return await this.makeRequest(AppRunner.CreateConnectionCommand, request)
    }

    public async listConnections(
        request: AppRunner.ListConnectionsRequest = {}
    ): Promise<AppRunner.ConnectionSummary[]> {
        const result: AppRunner.ListConnectionsResponse = await this.makeRequest(
            AppRunner.ListConnectionsCommand,
            request
        )
        return result.ConnectionSummaryList ?? []
    }

    public async describeService(
        request: AppRunner.DescribeServiceRequest
    ): Promise<WithServiceSummary<AppRunner.DescribeServiceResponse>> {
        return await this.makeRequest(AppRunner.DescribeServiceCommand, request)
    }

    public async startDeployment(
        request: AppRunner.StartDeploymentRequest
    ): Promise<AppRunner.StartDeploymentResponse> {
        return await this.makeRequest(AppRunner.StartDeploymentCommand, request)
    }

    public async listOperations(request: AppRunner.ListOperationsRequest): Promise<AppRunner.ListOperationsResponse> {
        return await this.makeRequest(AppRunner.ListOperationsCommand, request)
    }

    public async deleteService(
        request: AppRunner.DeleteServiceRequest
    ): Promise<WithServiceSummary<AppRunner.DeleteServiceResponse>> {
        return this.makeRequest(AppRunner.DeleteServiceCommand, request)
    }
}
