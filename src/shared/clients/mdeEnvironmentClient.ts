/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassToInterfaceType } from '../utilities/tsUtils'
const got = require('got')

export const MDE_ENVIRONMENT_ENDPOINT = 'http://127.0.0.1:1339'

export type MdeEnvironmentClient = ClassToInterfaceType<DefaultMdeEnvironmentClient>
export class DefaultMdeEnvironmentClient {
    public constructor(private endpoint: string = MDE_ENVIRONMENT_ENDPOINT) {}

    // Start an action
    public async startDevfile(request: StartDevfileRequest): Promise<any> {
        await got.post(`${this.endpoint}/start`, {
            json: request,
            responseType: 'json',
        })
    }

    // Create a devfile for the project
    public async createDevfile(request: CreateDevfileRequest): Promise<CreateDevfileResponse> {
        const response = await got.post(`${this.endpoint}/devfile/create`, {
            json: request,
            responseType: 'json',
        })
        return response.body
    }

    // Get status and action type
    public async getStatus(): Promise<GetStatusResponse> {
        const response = await got(`${this.endpoint}/status`, { responseType: 'json' })
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

export type Status = 'PENDING' | 'STABLE' | 'CHANGED' | string
