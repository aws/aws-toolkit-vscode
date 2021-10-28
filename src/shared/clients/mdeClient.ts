/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import * as mde from '../../../types/clientmde'
import apiConfig = require('../../../types/REMOVED.normal.json')
import { ext } from '../../shared/extensionGlobals'
import * as settings from '../../shared/settingsConfiguration'
import * as logger from '../logger/logger'
import { Timeout, waitTimeout, waitUntil } from '../utilities/timeoutUtils'
import { showMessageWithCancel, showViewLogsMessage } from '../utilities/messages'
import * as nls from 'vscode-nls'
import { Window } from '../vscode/window'

const localize = nls.loadMessageBundle()

export const MDE_REGION = 'us-west-2'
export function mdeEndpoint(): string {
    const s = new settings.DefaultSettingsConfiguration()
    try {
        return s.readDevSetting('aws.dev.mde.betaEndpoint')
    } catch (err) {
        // XXX: hardcode this for Cloud9/Hightide testing.
        return 'https://gamma.moontide.us-west-2.amazonaws.com/'
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MdeEnvironment extends mde.EnvironmentSummary {}
export interface MdeSession extends mde.SessionSummary, Omit<mde.StartSessionResponse, 'id'> {}

async function createMdeClient(regionCode: string = MDE_REGION, endpoint: string = mdeEndpoint()): Promise<mde> {
    const c = (await ext.sdkClientBuilder.createAwsService(AWS.Service, {
        // apiConfig is internal and not in the TS declaration file
        apiConfig: apiConfig,
        region: regionCode,
        // credentials: credentials,
        correctClockSkew: true,
        endpoint: endpoint,
    } as ServiceConfigurationOptions)) as mde
    // c.setupRequestListeners()
    return c
}

export class MdeClient {
    private readonly log: logger.Logger

    public constructor(public readonly regionCode: string, private readonly endpoint: string, private sdkClient: mde) {
        this.log = logger.getLogger()
    }

    /**
     * Factory to create a new `MdeClient`.
     *
     * @note Call `onCredentialsChanged()` before making requests.
     */
    public static async create(regionCode: string = MDE_REGION, endpoint: string = mdeEndpoint()): Promise<MdeClient> {
        MdeClient.assertExtInitialized()
        const sdkClient = await createMdeClient(regionCode, endpoint)
        const c = new MdeClient(regionCode, endpoint, sdkClient)
        return c
    }

    private static assertExtInitialized() {
        if (!ext.sdkClientBuilder) {
            throw Error('ext.sdkClientBuilder must be initialized first')
        }
    }

    public async onCredentialsChanged(username: string | undefined) {
        MdeClient.assertExtInitialized()
        this.sdkClient = await createMdeClient(this.regionCode, this.endpoint)
    }

    public async call<T>(req: AWS.Request<T, AWS.AWSError>, silent: boolean = false, defaultVal?: T): Promise<T> {
        const log = this.log
        return new Promise<T>((resolve, reject) => {
            req.send(function (err, data) {
                if (err) {
                    log.error('API request failed: %O', err)
                    if (silent && defaultVal) {
                        resolve(defaultVal)
                    } else if (silent) {
                        resolve({ length: 0, items: undefined } as unknown as T)
                    } else {
                        reject(err)
                    }
                }
                log.verbose('API response: %O', data)
                resolve(data)
            })
        })
    }

    public async *listEnvironments(
        args: mde.ListEnvironmentsRequest
    ): AsyncIterableIterator<MdeEnvironment | undefined> {
        const r = await this.call(this.sdkClient.listEnvironments(args))
        for (const i of r.environmentSummaries ?? []) {
            yield i
        }
    }

    public async createEnvironment(args: mde.CreateEnvironmentRequest): Promise<MdeEnvironment | undefined> {
        const r = await this.call(this.sdkClient.createEnvironment(args))
        return r
    }

    public async getEnvironmentMetadata(
        args: mde.GetEnvironmentMetadataRequest
    ): Promise<mde.GetEnvironmentMetadataResponse | undefined> {
        const r = await this.call(this.sdkClient.getEnvironmentMetadata(args))
        return r
    }

    public async startEnvironment(
        args: mde.StartEnvironmentRequest
    ): Promise<mde.StartEnvironmentResponse | undefined> {
        const r = await this.call(this.sdkClient.startEnvironment(args))
        return r
    }

    public async stopEnvironment(args: mde.StopEnvironmentRequest): Promise<mde.StopEnvironmentResponse | undefined> {
        const r = await this.call(this.sdkClient.stopEnvironment(args))
        return r
    }

    /**
     * Waits for the MDE environment to be available (and starts it if needed),
     * creaes a new session, and returns the session when available.
     */
    public async startSession(
        args: Pick<MdeEnvironment, 'id'>,
        window = Window.vscode()
    ): Promise<MdeSession | undefined> {
        const TIMEOUT_LENGTH = 120000
        const timeout = new Timeout(TIMEOUT_LENGTH)
        const progress = await showMessageWithCancel(localize('AWS.mde.startMde.message', 'MDE'), timeout)
        progress.report({ message: localize('AWS.mde.startMde.checking', 'checking status...') })

        let startErr: Error
        const pollMde = waitUntil(
            async () => {
                // Technically this will continue to be called until it reaches its
                // own timeout, need a better way to 'cancel' a `waitUntil`.
                if (timeout.completed) {
                    return
                }

                const mdeMeta = await this.getEnvironmentMetadata({ environmentId: args.id })

                if (mdeMeta?.status === 'STOPPED') {
                    progress.report({ message: localize('AWS.mde.startMde.stopStart', 'resuming environment...') })
                    await this.startEnvironment({ environmentId: args.id })
                } else if (mdeMeta?.status === 'STOPPING') {
                    progress.report({
                        message: localize('AWS.mde.startMde.resuming', 'waiting for environment to stop...'),
                    })
                } else {
                    progress.report({
                        message: localize('AWS.mde.startMde.starting', 'waiting for environment...'),
                    })
                }

                if (mdeMeta?.status !== 'RUNNING') {
                    return undefined
                }

                try {
                    const session = await this.call(
                        this.sdkClient.startSession({
                            environmentId: args.id,
                            sessionConfiguration: {
                                ssh: {},
                            },
                        })
                    )
                    return session
                } catch (e) {
                    startErr = e as Error
                    return undefined
                }
            },
            { interval: 5000, timeout: TIMEOUT_LENGTH, truthy: true }
        )

        const session = await waitTimeout(pollMde, timeout, {
            onExpire: () => {
                if (startErr) {
                    showViewLogsMessage(
                        localize('AWS.mde.sessionFailed', 'Failed to start session for MDE environment: {0}', args.id),
                        window
                    )
                } else {
                    window.showErrorMessage(
                        localize('AWS.mde.startFailed', 'Timeout waiting for MDE environment: {0}', args.id)
                    )
                }
            },
            onCancel: () => undefined,
        })

        return !session
            ? undefined
            : {
                  ...session,
                  id: session.id,
                  startedAt: new Date(),
                  status: 'CONNECTED',
              }
    }

    public async deleteEnvironment(
        args: mde.DeleteEnvironmentRequest
    ): Promise<mde.DeleteEnvironmentResponse | undefined> {
        const r = await this.call(this.sdkClient.deleteEnvironment(args))
        return r
    }

    public async tagResource(resourceArn: string, tags: mde.TagMap): Promise<void> {
        await this.call(
            this.sdkClient.tagResource({
                resourceArn,
                tags,
            })
        )
    }

    public async untagResource(resourceArn: string, tagKeys: string[]): Promise<void> {
        await this.call(
            this.sdkClient.untagResource({
                resourceArn,
                tagKeys,
            })
        )
    }
}
