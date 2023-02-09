/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import got from 'got'
import { getCodeCatalystDevEnvId } from '../vscode/env'

const environmentAuthToken = '__MDE_ENV_API_AUTHORIZATION_TOKEN'
const environmentEndpoint = 'http://127.0.0.1:1339'

export class DevEnvClient {
    public constructor(private readonly endpoint: string = environmentEndpoint) {}

    public get id(): string | undefined {
        return getCodeCatalystDevEnvId()
    }

    public isCodeCatalystDevEnv(): boolean {
        return !!this.id
    }

    // Start an action
    public async startDevfile(request: StartDevfileRequest): Promise<void> {
        await this.got.post('start', { json: request })
    }

    // Create a devfile for the project
    public async createDevfile(request: CreateDevfileRequest): Promise<CreateDevfileResponse> {
        const response = await this.got.post<CreateDevfileResponse>('devfile/create', { json: request })

        return response.body
    }

    // Get status and action type
    public async getStatus(): Promise<GetStatusResponse> {
        const response = await this.got<GetStatusResponse>('status')

        return response.body
    }

    private get authToken(): string | undefined {
        return process.env[environmentAuthToken]
    }

    private readonly got = got.extend({
        prefixUrl: this.endpoint,
        responseType: 'json',
        // `Authorization` _should_ have two parameters (RFC 7235), MDE should probably fix that
        headers: { Authorization: this.authToken },
    })
}

export interface GetStatusResponse {
    actionId?: string
    message?: string
    status?: Status
    location?: string // relative to the currently mounted project
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
