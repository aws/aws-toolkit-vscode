/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CognitoIdentity, CognitoIdentityCredentials } from 'aws-sdk'
import { MetricDatum } from './clienttelemetry'
import { DefaultTelemetryClient } from './telemetryClient'
import { TelemetryClient, TelemetryFeedback } from './telemetryClient'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export interface IdentityPublisherTuple {
    cognitoIdentityId: string
    publisher: TelemetryPublisher
}

export type TelemetryPublisher = ClassToInterfaceType<DefaultTelemetryPublisher>

export class DefaultTelemetryPublisher implements TelemetryPublisher {
    private static readonly defaultMaxBatchSize = 20

    private readonly _eventQueue: MetricDatum[]

    public constructor(
        private readonly clientId: string,
        private readonly region: string,
        private readonly credentials: AWS.Credentials,
        private telemetryClient?: TelemetryClient
    ) {
        this._eventQueue = []
    }

    public async postFeedback(feedback: TelemetryFeedback): Promise<void> {
        if (this.telemetryClient === undefined) {
            await this.init()
        }

        if (this.telemetryClient === undefined) {
            throw new Error('Failed to instantiate telemetry client')
        }

        return this.telemetryClient.postFeedback(feedback)
    }

    public enqueue(...events: MetricDatum[]): void {
        this._eventQueue.push(...events)
    }

    public get queue(): ReadonlyArray<MetricDatum> {
        return this._eventQueue
    }

    public async flush(): Promise<void> {
        if (this.telemetryClient === undefined) {
            await this.init()
        }

        while (this._eventQueue.length !== 0) {
            const batch = this._eventQueue.splice(0, DefaultTelemetryPublisher.defaultMaxBatchSize)

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

    public static async fromDefaultIdentityPool(clientId: string): Promise<IdentityPublisherTuple> {
        return this.fromIdentityPool(clientId, DefaultTelemetryClient.config.identityPool)
    }

    /**
     * Create a telemetry publisher from the given clientId and identityPool
     * @return A tuple containing the new identityId and the telemetry publisher
     */
    public static async fromIdentityPool(clientId: string, identityPool: string): Promise<IdentityPublisherTuple> {
        const region = identityPool.split(':')[0]
        try {
            const res = await new CognitoIdentity({
                region: region,
            })
                .getId({
                    IdentityPoolId: identityPool,
                })
                .promise()
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
                publisher: DefaultTelemetryPublisher.fromIdentityId(clientId, identityId),
            }
        } catch (err) {
            return Promise.reject(`Failed to get an Cognito identity for telemetry: ${err}`)
        }
    }

    public static fromIdentityId(clientId: string, identityId: string): DefaultTelemetryPublisher {
        const region = identityId.split(':')[0]
        const cognitoCredentials = new CognitoIdentityCredentials({ IdentityId: identityId }, { region: region })

        return new this(clientId, region, cognitoCredentials)
    }
}
