/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import got, { HTTPError } from 'got'
import globals from '../extensionGlobals'
import { getLogger } from '../logger/logger'
import { getCodeCatalystDevEnvId } from '../vscode/env'
import { UserActivity } from '../extensionUtilities'

const environmentAuthToken = '__MDE_ENV_API_AUTHORIZATION_TOKEN'
const environmentEndpoint = process.env['__MDE_ENVIRONMENT_API'] ?? 'http://127.0.0.1:1339'

/**
 * Client to the MDE quasi-IMDS localhost endpoint.
 */
export class DevEnvClient implements vscode.Disposable {
    static #instance: DevEnvClient
    private readonly timer
    private LastSeenStatus = ''
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
            getLogger().debug('codecatalyst: DevEnvClient started')
            this.timer = globals.clock.setInterval(async () => {
                const r = await this.getStatus()
                if (this.LastSeenStatus !== r.status) {
                    const newStatus = r.status ?? 'NULL'
                    getLogger().info(
                        'codecatalyst: DevEnvClient: status change (old=%s new=%s)%s%s',
                        this.LastSeenStatus,
                        newStatus,
                        r.actionId ? ` action=${r.actionId}` : '',
                        r.message ? `: "${r.message}"` : ''
                    )
                    if (this.onStatusChangeFn) {
                        this.onStatusChangeFn(this.LastSeenStatus, newStatus)
                    }
                    this.LastSeenStatus = newStatus ?? 'NULL'
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
     * Notifies the MDE API of user activity.
     *
     * WARNING: Use {@link DevEnvActivity} instead of calling this directly.
     */
    async updateActivity(timestamp: number = Date.now()): Promise<number> {
        await this.got.put('activity', { json: { timestamp: timestamp.toString() } })
        return timestamp
    }

    /**
     * Gets the latest user activity timestamp from MDE API.
     *
     * WARNING: Use {@link DevEnvActivity} instead of calling this directly.
     */
    async getActivity(): Promise<number | undefined> {
        const response = await this.got<GetActivityResponse>('activity')
        return response.body.timestamp ? parseInt(response.body.timestamp) : undefined
    }
}

/**
 * Posts user activity timestamps to the dev env "/activity" API, which are used by MDE to decide
 * when the user was last active, and thus prevent auto-shutdown of the dev env.
 */
export class DevEnvActivity implements vscode.Disposable {
    private activityUpdatedEmitter = new vscode.EventEmitter<number>()
    private ideActivityListener: vscode.Disposable | undefined
    /** The last known activity timestamp, but there could be a newer one on the server. */
    private lastLocalActivity: number | undefined
    private extensionUserActivity: UserActivity
    private static _defaultUserActivity: UserActivity | undefined

    static readonly activityUpdateDelay = 10_000

    /** Gets a new DevEnvActivity, or undefined if service is failed. */
    static async create(
        client: DevEnvClient,
        extensionUserActivity?: UserActivity
    ): Promise<DevEnvActivity | undefined> {
        try {
            await client.getActivity()
            getLogger().debug('codecatalyst: DevEnvActivity: Activity API is enabled')
        } catch (e) {
            const error = e instanceof HTTPError ? e.response.body : e
            getLogger().error(`codecatalyst: DevEnvActivity: Activity API failed: %s`, error)
            return undefined
        }

        return new DevEnvActivity(client, extensionUserActivity)
    }

    private constructor(
        private readonly client: DevEnvClient,
        extensionUserActivity?: UserActivity
    ) {
        this.extensionUserActivity = extensionUserActivity ?? this.defaultUserActivity
    }

    private get defaultUserActivity(): UserActivity {
        return (DevEnvActivity._defaultUserActivity ??= new UserActivity(DevEnvActivity.activityUpdateDelay))
    }

    /** Send activity timestamp to the MDE environment endpoint. */
    async sendActivityUpdate(timestamp: number = Date.now()): Promise<number> {
        await this.client.updateActivity()
        getLogger().debug('codecatalyst: DevEnvActivity: heartbeat sent')
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

    /**
     * Subscribes to the "user activity sent" event.
     *
     * @param callback Called when event is fired.
     * @param callback.timestamp Timestamp (milliseconds since 1970), see {@link Date.now}
     */
    onActivityUpdate(callback: (timestamp: number) => any) {
        this.activityUpdatedEmitter.event(callback)
    }

    /**
     * Sends an activity timestamp to Dev Env when there is user activity, throttled to once every {@link DevEnvActivity.activityUpdateDelay}.
     */
    setUpdateActivityOnIdeActivity(doUpdate: boolean) {
        this.ideActivityListener?.dispose()
        this.ideActivityListener = undefined

        if (!doUpdate) {
            // Stop updating the activity heartbeat
            return
        }

        if (this.ideActivityListener) {
            return
        }

        this.ideActivityListener = this.extensionUserActivity.onUserActivity(async () => {
            await this.sendActivityUpdate()
        })
    }

    dispose() {
        this.setUpdateActivityOnIdeActivity(false)
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
