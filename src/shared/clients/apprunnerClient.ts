/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */



import {
    AppRunner,
    CreateConnectionCommandInput,
    CreateConnectionCommandOutput,
    CreateServiceCommandInput,
    CreateServiceCommandOutput,
    DeleteServiceCommandInput,
    DeleteServiceCommandOutput,
    DescribeServiceCommandInput,
    DescribeServiceCommandOutput,
    ListConnectionsCommandInput,
    ListConnectionsCommandOutput,
    ListOperationsCommandInput,
    ListOperationsCommandOutput,
    ListServicesCommandInput,
    ListServicesCommandOutput,
    PauseServiceCommandInput,
    PauseServiceCommandOutput,
    ResumeServiceCommandInput,
    ResumeServiceCommandOutput,
    StartDeploymentCommandInput,
    StartDeploymentCommandOutput,
    UpdateServiceCommandInput,
    UpdateServiceCommandOutput,
} from "@aws-sdk/client-apprunner";

import globals from '../extensionGlobals'

import { ClassToInterfaceType } from '../utilities/tsUtils'

export type AppRunnerClient = ClassToInterfaceType<DefaultAppRunnerClient>

export class DefaultAppRunnerClient {
    public constructor(public readonly regionCode: string) {}

    public async createService(request: CreateServiceCommandInput): Promise<CreateServiceCommandOutput> {
        return (await this.createSdkClient()).createService(request).promise()
    }

    public async listServices(request: ListServicesCommandInput): Promise<ListServicesCommandOutput> {
        return (await this.createSdkClient()).listServices(request).promise()
    }

    public async pauseService(request: PauseServiceCommandInput): Promise<PauseServiceCommandOutput> {
        return (await this.createSdkClient()).pauseService(request).promise()
    }

    public async resumeService(request: ResumeServiceCommandInput): Promise<ResumeServiceCommandOutput> {
        return (await this.createSdkClient()).resumeService(request).promise()
    }

    public async updateService(request: UpdateServiceCommandInput): Promise<UpdateServiceCommandOutput> {
        return (await this.createSdkClient()).updateService(request).promise()
    }

    public async createConnection(
        request: CreateConnectionCommandInput
    ): Promise<CreateConnectionCommandOutput> {
        return (await this.createSdkClient()).createConnection(request).promise()
    }

    public async listConnections(
        request: ListConnectionsCommandInput = {}
    ): Promise<ListConnectionsCommandOutput> {
        return (await this.createSdkClient()).listConnections(request).promise()
    }

    public async describeService(
        request: DescribeServiceCommandInput
    ): Promise<DescribeServiceCommandOutput> {
        return (await this.createSdkClient()).describeService(request).promise()
    }

    public async startDeployment(
        request: StartDeploymentCommandInput
    ): Promise<StartDeploymentCommandOutput> {
        return (await this.createSdkClient()).startDeployment(request).promise()
    }

    public async listOperations(request: ListOperationsCommandInput): Promise<ListOperationsCommandOutput> {
        return (await this.createSdkClient()).listOperations(request).promise()
    }

    public async deleteService(request: DeleteServiceCommandInput): Promise<DeleteServiceCommandOutput> {
        return (await this.createSdkClient()).deleteService(request).promise()
    }

    protected async createSdkClient(): Promise<AppRunner> {
        return await globals.sdkClientBuilder.createAwsService(AppRunner, undefined, this.regionCode)
    }
}
