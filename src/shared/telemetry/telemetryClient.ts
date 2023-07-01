/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Toolkit-local logic for telemetry.
 */

import { Credentials, Service } from 'aws-sdk'
import * as os from 'os'
import * as vscode from 'vscode'
import { extensionVersion, isAutomation } from '../vscode/env'
import { getLogger } from '../logger'
import * as ClientTelemetry from './clienttelemetry'
import { MetricDatum } from './clienttelemetry'
import apiConfig = require('./service-2.json')
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import globals from '../extensionGlobals'
import { DevSettings } from '../settings'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export const accountMetadataKey = 'awsAccount'
export const regionKey = 'awsRegion'
export const computeRegionKey = 'computeRegion'

export enum AccountStatus {
    NotApplicable = 'n/a',
    NotSet = 'not-set',
    Invalid = 'invalid',
}

export const metadataFieldName = {
    RESULT: 'result',
    DURATION: 'duration',
    REASON: 'reason',
}

export enum MetadataResult {
    Pass = 'Succeeded',
    Fail = 'Failed',
    Cancel = 'Cancelled',
}

interface TelemetryConfiguration {
    readonly endpoint: string
    readonly identityPool: string
}

export interface TelemetryFeedback {
    sentiment: ClientTelemetry.Sentiment
    comment: ClientTelemetry.Comment
}

export type TelemetryClient = ClassToInterfaceType<DefaultTelemetryClient>

export class DefaultTelemetryClient implements TelemetryClient {
    private static readonly defaultIdentityPool = 'us-east-1:820fd6d1-95c0-4ca4-bffb-3f01d32da842'
    private static readonly defaultTelemetryEndpoint = 'https://client-telemetry.us-east-1.amazonaws.com'
    private static readonly productName = 'AWS Toolkit For VS Code'

    private static initializeConfig(): TelemetryConfiguration {
        const settings = DevSettings.instance

        return {
            endpoint: settings.get('telemetryEndpoint', this.defaultTelemetryEndpoint),
            identityPool: settings.get('telemetryUserPool', this.defaultIdentityPool),
        }
    }

    public static config = DefaultTelemetryClient.initializeConfig()

    private readonly logger = getLogger()

    private constructor(private readonly clientId: string, private readonly client: ClientTelemetry) {}

    /**
     * Returns failed events
     * @param batch batch of events
     */
    public async postMetrics(batch: MetricDatum[]): Promise<MetricDatum[] | undefined> {
        try {
            // If our batching logic rejected all of the telemetry, don't try to post
            if (batch.length === 0) {
                return undefined
            }

            if (!isAutomation()) {
                await this.client
                    .postMetrics({
                        AWSProduct: DefaultTelemetryClient.productName,
                        AWSProductVersion: extensionVersion,
                        ClientID: this.clientId,
                        OS: os.platform(),
                        OSVersion: os.release(),
                        ParentProduct: vscode.env.appName,
                        ParentProductVersion: vscode.version,
                        MetricData: batch,
                    })
                    .promise()
                this.logger.info(`telemetry: sent batch (size=${batch.length})`)
            } else {
                this.logger.info(`telemetry: (test mode) dropped batch (size=${batch.length})`)
            }

            return undefined
        } catch (err) {
            this.logger.error(`Batch error: ${err}`)

            return batch
        }
    }

    public async postFeedback(feedback: TelemetryFeedback): Promise<void> {
        try {
            await this.client
                .postFeedback({
                    AWSProduct: DefaultTelemetryClient.productName,
                    AWSProductVersion: extensionVersion,
                    OS: os.platform(),
                    OSVersion: os.release(),
                    ParentProduct: vscode.env.appName,
                    ParentProductVersion: vscode.version,
                    Comment: feedback.comment,
                    Sentiment: feedback.sentiment,
                })
                .promise()
            this.logger.info('Successfully posted feedback')
        } catch (err) {
            this.logger.error(`Failed to post feedback: ${err}`)
            throw new Error(`Failed to post feedback: ${err}`)
        }
    }

    public static async createDefaultClient(
        clientId: string,
        region: string,
        credentials: Credentials
    ): Promise<DefaultTelemetryClient> {
        await credentials.getPromise()

        return new DefaultTelemetryClient(
            clientId,
            (await globals.sdkClientBuilder.createAwsService(
                Service,
                {
                    // apiConfig is internal and not in the TS declaration file
                    apiConfig: apiConfig,
                    region: region,
                    credentials: credentials,
                    correctClockSkew: true,
                    endpoint: DefaultTelemetryClient.config.endpoint,
                } as ServiceConfigurationOptions,
                undefined,
                false
            )) as ClientTelemetry
        )
    }
}
