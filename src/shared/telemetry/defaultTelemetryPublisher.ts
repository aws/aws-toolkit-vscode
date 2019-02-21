/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { CognitoIdentity, CognitoIdentityCredentials } from 'aws-sdk'
import { DefaultTelemetryClient } from './defaultTelemetryClient'
import { TelemetryClient } from './telemetryClient'
import { TelemetryEvent, TelemetryEventArray } from './telemetryEvent'
import { TelemetryPublisher } from './telemetryPublisher'

export class DefaultTelemetryPublisher implements TelemetryPublisher {
    private static readonly DEFAULT_MAX_BATCH_SIZE = 20
    private telemetryClient?: TelemetryClient
    private readonly clientId: string
    private readonly region: string
    private readonly credentials: AWS.Credentials
    private readonly eventQueue: TelemetryEventArray = new TelemetryEventArray()

    public constructor(
        clientId: string,
        region: string,
        credentials: AWS.Credentials,
        telemetryClient?: TelemetryClient
    ) {
        this.clientId = clientId
        this.region = region
        this.credentials = credentials
        this.telemetryClient = telemetryClient
    }

    public enqueue(events: TelemetryEvent[]) {
        this.eventQueue.push(...events)
    }

    public getQueue(): ReadonlyArray<TelemetryEvent> {
        return this.eventQueue
    }

    public async flush() {
        if (this.telemetryClient === undefined) {
            await this.createDefaultTelemetryClient()
        }

        while (this.eventQueue.length !== 0) {
            const batch = this.eventQueue
                .splice(0, DefaultTelemetryPublisher.DEFAULT_MAX_BATCH_SIZE) as TelemetryEventArray

            const failedBatch = await this.telemetryClient!!.postMetrics(batch)
            if (failedBatch !== undefined) {
                this.enqueue(failedBatch)

                // retry next time
                return
            }
        }
    }

    public async createDefaultTelemetryClient() {
        this.telemetryClient = await DefaultTelemetryClient.createDefaultClient(
            this.clientId,
            this.region,
            this.credentials
        )
    }

    public static async fromDefaultIdentityPool(clientId: string) {
        return this.fromIdentityPool(clientId, DefaultTelemetryClient.DEFAULT_IDENTITY_POOL)
    }

    /**
     * Create a telemetry publisher from the given clientId and identityPool
     * @return A tuple containing the new identityId and the telemetry publisher
     */
    public static async fromIdentityPool(clientId: string, identityPool: string)
        : Promise<[string, TelemetryPublisher]> {
        const region = identityPool.split(':')[0]
        try {
            const res = await new CognitoIdentity({
                region: region
            }).getId({
                IdentityPoolId: identityPool
            }).promise()
            const err = res.$response.error
            if (err) {
                return Promise.reject('SDK deserialization error')
            }
            const identityId = res.IdentityId

            return [identityId!!, DefaultTelemetryPublisher.fromIdentityId(clientId, identityId!!)]
        } catch (err) {
            return Promise.reject('Failed to get an Cognito identity for telemetry')
        }
    }

    public static fromIdentityId(clientId: string, identityId: string) {
        const region = identityId.split(':')[0]
        const cognitoCredentials = new CognitoIdentityCredentials(
            { IdentityId: identityId },
            { region: region }
        )

        return new this(clientId, region, cognitoCredentials)
    }
}
