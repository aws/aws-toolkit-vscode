/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials, Service } from 'aws-sdk'
import * as os from 'os'
import * as vscode from 'vscode'
import { pluginVersion } from '../extensionUtilities'
import { ext } from '../extensionGlobals'
import { getLogger } from '../logger'
import * as ClientTelemetry from './clienttelemetry'
import { MetricDatum } from './clienttelemetry'
import apiConfig = require('./service-2.json')
import { TelemetryClient } from './telemetryClient'
import { TelemetryFeedback } from './telemetryFeedback'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'

export class DefaultTelemetryClient implements TelemetryClient {
    public static readonly DEFAULT_IDENTITY_POOL = 'us-east-1:820fd6d1-95c0-4ca4-bffb-3f01d32da842'
    public static readonly DEFAULT_TELEMETRY_ENDPOINT = 'https://client-telemetry.us-east-1.amazonaws.com'

    private static readonly PRODUCT_NAME = 'AWS Toolkit For VS Code'

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

            await this.client
                .postMetrics({
                    AWSProduct: DefaultTelemetryClient.PRODUCT_NAME,
                    AWSProductVersion: pluginVersion,
                    ClientID: this.clientId,
                    OS: os.platform(),
                    OSVersion: os.release(),
                    ParentProduct: vscode.env.appName,
                    ParentProductVersion: vscode.version,
                    MetricData: batch,
                })
                .promise()
            this.logger.info(`Successfully sent a telemetry batch of ${batch.length}`)

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
                    AWSProduct: DefaultTelemetryClient.PRODUCT_NAME,
                    AWSProductVersion: pluginVersion,
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
            (await ext.sdkClientBuilder.createAwsService(
                Service,
                {
                    // apiConfig is internal and not in the TS declaration file
                    apiConfig: apiConfig,
                    region: region,
                    credentials: credentials,
                    correctClockSkew: true,
                    endpoint: DefaultTelemetryClient.DEFAULT_TELEMETRY_ENDPOINT,
                } as ServiceConfigurationOptions,
                undefined,
                false
            )) as ClientTelemetry
        )
    }
}
