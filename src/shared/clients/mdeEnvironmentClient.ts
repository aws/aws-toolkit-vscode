/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassToInterfaceType } from '../utilities/tsUtils'
import got, { Got } from 'got'
import { getMdeEnvArn } from '../vscode/env'

const ENVIRONMENT_AUTH_TOKEN = '__MDE_ENV_API_AUTHORIZATION_TOKEN'
export const MDE_ENVIRONMENT_ENDPOINT = 'http://127.0.0.1:1339'

export type MdeEnvironmentClient = ClassToInterfaceType<DefaultMdeEnvironmentClient>
export class DefaultMdeEnvironmentClient {
    public constructor(private endpoint: string = MDE_ENVIRONMENT_ENDPOINT) {}

    public get arn(): string | undefined {
        return getMdeEnvArn()
    }

    private get authToken(): string | undefined {
        return process.env[ENVIRONMENT_AUTH_TOKEN]
    }

    private getGot(): Got {
        return got.extend({
            prefixUrl: this.endpoint,
            responseType: 'json',
            // `Authorization` _should_ have two parameters (RFC 7235), MDE should probably fix that
            headers: { Authorization: this.authToken },
        })
    }

    // Start an action
    public async startDevfile(request: StartDevfileRequest): Promise<void> {
        await this.getGot().post('start', { json: request })
    }

    // Create a devfile for the project
    public async createDevfile(request: CreateDevfileRequest): Promise<CreateDevfileResponse> {
        const response = await this.getGot().post<CreateDevfileResponse>('devfile/create', { json: request })
        return response.body
    }

    // Get status and action type
    public async getStatus(): Promise<GetStatusResponse> {
        const response = await this.getGot()<GetStatusResponse>('status')
        return response.body
    }
}

export interface GetStatusResponse {
    actionId?: string
    message?: string
    status?: Status
}

export interface CreateDevfileRequest {
    path?: string
}

export interface CreateDevfileResponse {
    // Location of the created devfile.
    location?: string
}

export interface StartDevfileRequest {
    // The devfile.yaml file path relative to /projects/
    location?: string

    // The home volumes will be deleted and created again with the content of the '/home' folder of each component container.
    recreateHomeVolumes?: boolean
}

export type Status = 'PENDING' | 'STABLE' | 'CHANGED'
