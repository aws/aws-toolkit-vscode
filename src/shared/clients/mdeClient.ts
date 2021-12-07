/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import * as mde from '../../../types/clientmde'
import apiConfig = require('../../../types/REMOVED.normal.json')
import * as settings from '../../shared/settingsConfiguration'
import * as logger from '../logger/logger'
import { Timeout, waitTimeout, waitUntil } from '../utilities/timeoutUtils'
import { showMessageWithCancel, showViewLogsMessage } from '../utilities/messages'
import * as nls from 'vscode-nls'
import { Window } from '../vscode/window'
import globals from '../extensionGlobals'

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
    const c = (await globals.sdkClientBuilder.createAwsService(AWS.Service, {
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

const DEFAULT_START_TIMEOUT_LENGTH = 120000

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
        if (!globals.sdkClientBuilder) {
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
     * Waits for environment's devfile to finish successfully. A failure usually means we won't be able to connect, so best
     * to abort early and notify the user that the environment failed. We then need to either restart or recreate the
     * environment depending on the context.
     */
    public async waitForDevfile(
        args: Pick<MdeEnvironment, 'id'>,
        timeout: Timeout = new Timeout(60000)
    ): Promise<mde.GetEnvironmentMetadataResponse> {
        const poll = waitUntil(
            async () => {
                if (timeout.completed) {
                    throw new Error('Timed out waiting for devfile')
                }

                const resp = await this.getEnvironmentMetadata({ environmentId: args.id })

                if (resp?.status !== 'RUNNING') {
                    throw new Error('Cannot wait for devfile to finish when environment is not running')
                }

                const devfile = resp?.actions?.devfile

                if (devfile?.status === 'FAILED' && devfile.message) {
                    throw new Error(`Devfile action failed: ${devfile.message}`)
                }

                return devfile?.status === 'SUCCESSFUL' ? resp : undefined
            },
            { interval: 5000, timeout: timeout.remainingTime, truthy: true }
        )

        const mdeEnv = await poll
        if (!mdeEnv) {
            throw new Error('Environment returned undefined')
        }

        return mdeEnv
    }

    /**
     * Best-effort attempt to start an MDE given an ID, showing a progress notifcation with a cancel button
     * TODO: may combine this progress stuff into some larger construct
     *
     * The cancel button does not abort the start, but rather alerts any callers that any operations that rely
     * on the MDE starting should not progress.
     *
     * @returns the environment on success, undefined otherwise
     */
    public async startEnvironmentWithProgress(
        args: Pick<MdeEnvironment, 'id' | 'status'>,
        timeout: Timeout = new Timeout(DEFAULT_START_TIMEOUT_LENGTH)
    ): Promise<MdeEnvironment | undefined> {
        // 'debounce' in case caller did not check if the environment was already running
        if (args.status === 'RUNNING') {
            const resp = await this.getEnvironmentMetadata({ environmentId: args.id })
            if (resp && resp.status === 'RUNNING') {
                return resp
            }
        }

        const progress = await showMessageWithCancel(localize('AWS.mde.startMde.message', 'MDE'), timeout)
        progress.report({ message: localize('AWS.mde.startMde.checking', 'checking status...') })

        const pollMde = waitUntil(
            async () => {
                // technically this will continue to be called until it reaches its own timeout, need a better way to 'cancel' a `waitUntil`
                if (timeout.completed) {
                    return
                }

                const resp = await this.getEnvironmentMetadata({ environmentId: args.id })

                if (resp?.status === 'STOPPED') {
                    progress.report({ message: localize('AWS.mde.startMde.stopStart', 'resuming environment...') })
                    await this.startEnvironment({ environmentId: args.id })
                } else if (resp?.status === 'STOPPING') {
                    progress.report({
                        message: localize('AWS.mde.startMde.resuming', 'waiting for environment to stop...'),
                    })
                } else {
                    progress.report({
                        message: localize('AWS.mde.startMde.starting', 'waiting for environment...'),
                    })
                }

                return resp?.status === 'RUNNING' ? resp : undefined
            },
            // note: the `waitUntil` will resolve prior to the real timeout if it is refreshed
            { interval: 5000, timeout: timeout.remainingTime, truthy: true }
        )

        return waitTimeout(pollMde, timeout, {
            onExpire: () => (
                Window.vscode().showErrorMessage(
                    localize('AWS.mde.startFailed', 'Timeout waiting for MDE environment: {0}', args.id)
                ),
                undefined
            ),
            onCancel: () => undefined,
        })
    }

    /**
     * Waits for the MDE environment to be available (and starts it if needed),
     * creaes a new session, and returns the session when available.
     */
    public async startSession(args: Pick<MdeEnvironment, 'id'>): Promise<MdeSession | undefined> {
        const runningMde = await this.startEnvironmentWithProgress(args)

        if (!runningMde) {
            return
        }

        try {
            const session = await this.call(
                this.sdkClient.startSession({
                    environmentId: runningMde.id,
                    sessionConfiguration: {
                        ssh: {},
                    },
                })
            )

            return {
                ...session,
                id: session.id,
                startedAt: new Date(),
                status: 'CONNECTED',
            }
        } catch (err) {
            showViewLogsMessage(
                localize('AWS.mde.sessionFailed', 'Failed to start session for MDE environment: {0}', args.id)
            )
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
