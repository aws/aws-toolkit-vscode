/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import got, { HTTPError } from 'got'
import globals from '../extensionGlobals'
import { getLogger } from '../logger/logger'
import { getCodeCatalystDevEnvId } from '../vscode/env'
import { ExtensionUserActivity } from '../extensionUtilities'

const environmentAuthToken = '__MDE_ENV_API_AUTHORIZATION_TOKEN'
const environmentEndpoint = process.env['__MDE_ENVIRONMENT_API'] ?? 'http://127.0.0.1:1339'

/**
 * Client to the MDE quasi-IMDS localhost endpoint.
 */
export class DevEnvClient implements vscode.Disposable {
    static #instance: DevEnvClient
    private readonly timer
    private lastStatus = ''
    private onStatusChangeFn: undefined | ((oldStatus: string, newStatus: string) => void)

    /** Singleton instance (to avoid multiple polling workers). */
    public static get instance() {
        return (this.#instance ??= new this())
    }

    /** @internal */
    public constructor(private readonly endpoint: string = environmentEndpoint) {
        if (!this.id) {
            getLogger().debug('codecatalyst: DevEnvClient skipped (local)')
            this.timer = undefined
        } else {
            getLogger().info('codecatalyst: DevEnvClient started')
            this.timer = globals.clock.setInterval(async () => {
                const r = await this.getStatus()
                if (this.lastStatus !== r.status) {
                    const newStatus = r.status ?? 'NULL'
                    getLogger().info(
                        'codecatalyst: DevEnvClient: status change (old=%s new=%s)%s%s',
                        this.lastStatus,
                        newStatus,
                        r.actionId ? ` action=${r.actionId}` : '',
                        r.message ? `: "${r.message}"` : ''
                    )
                    if (this.onStatusChangeFn) {
                        this.onStatusChangeFn(this.lastStatus, newStatus)
                    }
                    this.lastStatus = newStatus ?? 'NULL'
                }
            }, 1000)
        }
    }

    public onStatusChange(fn: (oldStatus: string, newStatus: string) => void) {
        this.onStatusChangeFn = fn
    }

    public dispose() {
        if (this.timer) {
            globals.clock.clearInterval(this.timer)
        }
    }

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
    //
    // Example:
    //      { status: 'IMAGES-UPDATE-AVAILABLE', location: 'devfile.yaml' }
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

    /**
     * WARNING: You should use {@link DevEnvActivity} unless you have a reason not to.
     */
    async updateActivity(timestamp: number = Date.now()): Promise<number> {
        await this.got.put('activity', { json: { timestamp: timestamp.toString() } })
        return timestamp
    }

    /**
     * WARNING: You should use {@link DevEnvActivity} unless you have a reason not to.
     */
    async getActivity(): Promise<number | undefined> {
        const response = await this.got<GetActivityResponse>('activity')
        return response.body.timestamp ? parseInt(response.body.timestamp) : undefined
    }
}

/**
 * This allows you to easily work with Dev Env user activity timestamps.
 *
 * An activity is a timestamp that the server uses to
 * determine when the user was last active.
 */
export class DevEnvActivity implements vscode.Disposable {
    private activityUpdatedEmitter = new vscode.EventEmitter<number>()
    private ideActivityListener: vscode.Disposable | undefined
    /** The last known activity timestamp, but there could be a newer one on the server. */
    private lastLocalActivity: number | undefined
    private extensionUserActivity: ExtensionUserActivity

    static readonly activityUpdateDelay = 10_000

    /**
     * Returns an instance if the activity mechanism is confirmed to be working.
     */
    static async instanceIfActivityTrackingEnabled(
        client: DevEnvClient,
        extensionUserActivity?: ExtensionUserActivity
    ): Promise<DevEnvActivity | undefined> {
        try {
            await client.getActivity()
            getLogger().debug('codecatalyst: DevEnvActivity: Activity API is enabled')
        } catch (e) {
            const error = e instanceof HTTPError ? e.response.body : e
            getLogger().error(`codecatalyst: DevEnvActivity: Activity API failed:%s`, error)
            return undefined
        }

        return new DevEnvActivity(client, extensionUserActivity)
    }

    private constructor(private readonly client: DevEnvClient, extensionUserActivity?: ExtensionUserActivity) {
        this.extensionUserActivity =
            extensionUserActivity ?? new ExtensionUserActivity(DevEnvActivity.activityUpdateDelay)
    }

    /** Send activity timestamp to the Dev Env */
    async sendActivityUpdate(timestamp: number = Date.now()): Promise<number> {
        await this.client.updateActivity()
        getLogger().debug(`codecatalyst: DevEnvActivity: heartbeat sent at ${timestamp}`)
        this.lastLocalActivity = timestamp
        this.activityUpdatedEmitter.fire(timestamp)
        return timestamp
    }

    /** Get the latest activity timestamp from the Dev Env */
    async getLatestActivity(): Promise<number | undefined> {
        const lastServerActivity = await this.client.getActivity()

        // A single Dev Env can have multiple clients connected to it.
        // So if one client updates the timestamp, it will be different from what the
        // other clients assumed the last activity was.
        if (lastServerActivity && lastServerActivity !== this.lastLocalActivity) {
            this.activityUpdatedEmitter.fire(lastServerActivity)
        }

        this.lastLocalActivity = lastServerActivity
        return this.lastLocalActivity
    }

    /** true, if the latest activity on the server is different from what this client has as the latest */
    async isLocalActivityStale(): Promise<boolean> {
        return (await this.getLatestActivity()) !== this.lastLocalActivity
    }

    /** Runs the given callback when the activity is updated */
    onActivityUpdate(callback: (timestamp: number) => any) {
        this.updateActivityOnIdeActivity()
        this.activityUpdatedEmitter.event(callback)
    }

    /** Stops sending activity timestamps to the dev env on user ide activity. */
    stopUpdatingActivityOnIdeActivity() {
        this.ideActivityListener?.dispose()
        this.ideActivityListener = undefined
    }

    /**
     * Sends an activity timestamp to Dev Env when there is user activity, throttled to once every {@link DevEnvActivity.activityUpdateDelay}.
     */
    private updateActivityOnIdeActivity() {
        if (this.ideActivityListener) {
            return
        }

        this.ideActivityListener = this.extensionUserActivity.onUserActivity(async () => {
            await this.sendActivityUpdate()
        })
    }

    dispose() {
        this.stopUpdatingActivityOnIdeActivity()
    }
}

export interface GetActivityResponse {
    timestamp?: string
}

export interface UpdateActivityRequest {
    timestamp?: string
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

export type Status =
    | 'PENDING'
    | 'STABLE'
    | 'CHANGED'
    /**
     * The image on-disk in the DE is different from the one in the container registry.
     * Client should call "/devfile/pull" to pull the latest image from the registry.
     */
    | 'IMAGES-UPDATE-AVAILABLE'
