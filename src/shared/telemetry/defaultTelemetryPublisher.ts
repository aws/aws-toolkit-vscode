/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { CognitoIdentity, CognitoIdentityCredentials } from 'aws-sdk'
import { DefaultTelemetryClient } from './defaultTelemetryClient'
import { TelemetryClient } from './telemetryClient'
import { TelemetryEvent } from './telemetryEvent'
import { TelemetryPublisher } from './telemetryPublisher'

export interface IdentityPublisherTuple {
    cognitoIdentityId: string,
    publisher: TelemetryPublisher
}

export class DefaultTelemetryPublisher implements TelemetryPublisher {
    private static readonly DEFAULT_MAX_BATCH_SIZE = 20

    private readonly _eventQueue: TelemetryEvent[]

    public constructor(
        private readonly clientId: string,
        private readonly region: string,
        private readonly credentials: AWS.Credentials,
        private telemetryClient?: TelemetryClient
    ) {
        this._eventQueue = []
    }

    public enqueue(...events: TelemetryEvent[]): void {
        this._eventQueue.push(...events)
    }

    public get queue(): ReadonlyArray<TelemetryEvent> {
        return this._eventQueue
    }

    public async flush(): Promise<void> {
        if (this.telemetryClient === undefined) {
            await this.init()
        }

        while (this._eventQueue.length !== 0) {
            const batch = this._eventQueue
                .splice(0, DefaultTelemetryPublisher.DEFAULT_MAX_BATCH_SIZE) as TelemetryEvent[]

            if (this.telemetryClient === undefined) {
                return
            }

            const failedBatch = await this.telemetryClient.postMetrics(batch)
            if (failedBatch !== undefined) {
                this.enqueue(...failedBatch)

                // retry next time
                return
            }
        }
    }

    public async init(): Promise<void> {
        this.telemetryClient = await DefaultTelemetryClient.createDefaultClient(
            this.clientId,
            this.region,
            this.credentials
        )
    }

    public static async fromDefaultIdentityPool(
        clientId: string
    ): Promise<IdentityPublisherTuple> {
        return this.fromIdentityPool(clientId, DefaultTelemetryClient.DEFAULT_IDENTITY_POOL)
    }

    /**
     * Create a telemetry publisher from the given clientId and identityPool
     * @return A tuple containing the new identityId and the telemetry publisher
     */
    public static async fromIdentityPool(
        clientId: string,
        identityPool: string
    ): Promise<IdentityPublisherTuple> {
        const region = identityPool.split(':')[0]
        try {
            const res = await new CognitoIdentity({
                region: region
            }).getId({
                IdentityPoolId: identityPool
            }).promise()
            const err = res.$response.error
            if (err) {
                return Promise.reject(`SDK error: ${err}`)
            }
            const identityId = res.IdentityId
            if (!identityId) {
                throw new Error('identityId returned by Cognito call was null')
            }

            return {
                cognitoIdentityId: identityId,
                publisher: DefaultTelemetryPublisher.fromIdentityId(clientId, identityId)
            }
        } catch (err) {
            return Promise.reject(`Failed to get an Cognito identity for telemetry: ${err}`)
        }
    }

    public static fromIdentityId(
        clientId: string,
        identityId: string
    ): DefaultTelemetryPublisher {
        const region = identityId.split(':')[0]
        const cognitoCredentials = new CognitoIdentityCredentials(
            { IdentityId: identityId },
            { region: region }
        )

        return new this(clientId, region, cognitoCredentials)
    }
}
