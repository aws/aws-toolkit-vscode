/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as AWS from 'aws-sdk'
import * as logger from '../logger/logger'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { Timeout, waitTimeout, waitUntil } from '../utilities/timeoutUtils'
import { showMessageWithCancel } from '../utilities/messages'
import { assertHasProps, ClassToInterfaceType, isNonNullable, RequiredProps } from '../utilities/tsUtils'
import { AsyncCollection, toCollection } from '../utilities/asyncCollection'
import { pageableToCollection } from '../utilities/collectionUtils'
import { DevSettings } from '../settings'
import { CodeCatalyst } from 'aws-sdk'
import { ToolkitError } from '../errors'
import { SsoConnection } from '../../credentials/auth'
import { TokenProvider } from '../../credentials/sdkV2Compat'

// REMOVE ME SOON: only used for development
interface CodeCatalystConfig {
    readonly region: string
    readonly endpoint: string
    readonly hostname: string
    readonly gitHostname: string
}

export function getCodeCatalystConfig(): CodeCatalystConfig {
    const stage = DevSettings.instance.get('cawsStage', 'prod')

    if (stage === 'gamma') {
        return {
            region: 'us-west-2',
            endpoint: 'https://public.codecatalyst-gamma.global.api.aws',
            hostname: 'integ.stage.REMOVED.codes',
            gitHostname: 'git.gamma.source.caws.REMOVED',
        }
    } else {
        return {
            region: 'us-east-1',
            endpoint: 'https://public.codecatalyst.global.api.aws',
            hostname: 'codecatalyst.aws',
            gitHostname: 'codecatalyst.aws',
        }
    }
}

export interface DevEnvironment extends CodeCatalyst.DevEnvironmentSummary {
    readonly type: 'devEnvironment'
    readonly id: string
    readonly org: Pick<CodeCatalystOrg, 'name'>
    readonly project: Pick<CodeCatalystProject, 'name'>
}

/** CodeCatalyst developer environment session. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CodeCatalystDevEnvSession extends CodeCatalyst.StartDevEnvironmentResponse {}

export interface CodeCatalystOrg extends CodeCatalyst.SpaceSummary {
    readonly type: 'org'
    readonly name: string
}

export interface CodeCatalystProject extends CodeCatalyst.ProjectSummary {
    readonly type: 'project'
    readonly name: string
    readonly org: Pick<CodeCatalystOrg, 'name'>
}

export interface CodeCatalystRepo extends CodeCatalyst.ListSourceRepositoriesItem {
    readonly type: 'repo'
    readonly name: string
    readonly org: Pick<CodeCatalystOrg, 'name'>
    readonly project: Pick<CodeCatalystProject, 'name'>
}

export interface CodeCatalystBranch extends CodeCatalyst.ListSourceRepositoryBranchesItem {
    readonly type: 'branch'
    readonly name: string
    readonly repo: Pick<CodeCatalystRepo, 'name'>
    readonly org: Pick<CodeCatalystOrg, 'name'>
    readonly project: Pick<CodeCatalystProject, 'name'>
}

export type CodeCatalystResource =
    | CodeCatalystOrg
    | CodeCatalystProject
    | CodeCatalystRepo
    | CodeCatalystBranch
    | DevEnvironment

function toDevEnv(spaceName: string, projectName: string, summary: CodeCatalyst.DevEnvironmentSummary): DevEnvironment {
    return {
        type: 'devEnvironment',
        org: { name: spaceName },
        project: { name: projectName },
        ...summary,
    }
}

function toBranch(
    org: string,
    project: string,
    repo: string,
    branch: CodeCatalyst.ListSourceRepositoryBranchesItem
): CodeCatalystBranch {
    assertHasProps(branch, 'name')

    return {
        type: 'branch',
        repo: { name: repo },
        org: { name: org },
        project: { name: project },
        ...branch,
    }
}

async function createCodeCatalystClient(
    connection: SsoConnection,
    regionCode = getCodeCatalystConfig().region,
    endpoint = getCodeCatalystConfig().endpoint
): Promise<CodeCatalyst> {
    const c = await globals.sdkClientBuilder.createAwsService(CodeCatalyst, {
        region: regionCode,
        correctClockSkew: true,
        endpoint: endpoint,
        token: new TokenProvider(connection),
    } as ServiceConfigurationOptions)

    return c
}

export type UserDetails = RequiredProps<
    CodeCatalyst.GetUserDetailsResponse,
    'userId' | 'userName' | 'displayName' | 'primaryEmail'
>

// CodeCatalyst client has two variants: 'logged-in' and 'not logged-in'
// The 'not logged-in' variant is a subtype and has restricted functionality
// These characteristics appear in the Smithy model, but the SDK codegen is unable to model this

export interface CodeCatalystClient extends ClassToInterfaceType<CodeCatalystClientInternal> {
    readonly identity: { readonly id: string; readonly name: string }
}

export type CodeCatalystClientFactory = () => Promise<CodeCatalystClient>

/**
 * Factory to create a new `CodeCatalystClient`. Call `onCredentialsChanged()` before making requests.
 */
export async function createClient(
    connection: SsoConnection,
    regionCode = getCodeCatalystConfig().region,
    endpoint = getCodeCatalystConfig().endpoint
): Promise<CodeCatalystClient> {
    const sdkClient = await createCodeCatalystClient(connection, regionCode, endpoint)
    const c = new CodeCatalystClientInternal(connection, sdkClient)
    await c.verifySession()

    return c
}

// XXX: the backend currently rejects empty strings for `alias` so the field must be removed if falsey
function fixAliasInRequest<
    T extends CodeCatalyst.CreateDevEnvironmentRequest | CodeCatalyst.UpdateDevEnvironmentRequest
>(request: T): T {
    if (!request.alias) {
        delete request.alias
    }

    return request
}

class CodeCatalystClientInternal {
    private userDetails?: UserDetails
    private readonly log: logger.Logger

    /**
     * Maps bearer tokens to CAWS identities via `verifySession`
     *
     * It's assumed that an identity will never change over the lifetime of a token
     */
    private static identityCache = new Map<string, string>()

    /**
     * Maps CAWS identities to user details via  `getUserDetails`
     *
     * User details _might_ change at some point, however, this is an uncommon occurence.
     * Cached user details are cleared when the access token is refreshed.
     */
    private static userDetailsCache = new Map<UserDetails['userId'], UserDetails>()

    public constructor(private readonly connection: SsoConnection, private readonly sdkClient: CodeCatalyst) {
        this.log = logger.getLogger()
    }

    public get regionCode() {
        return this.sdkClient.config.region!
    }

    public get identity(): CodeCatalystClient['identity'] {
        if (!this.userDetails) {
            throw new Error('CodeCatalyst client is not connected')
        }

        return { id: this.userDetails.userId, name: this.userDetails.userName }
    }

    private async call<T>(req: AWS.Request<T, AWS.AWSError>, silent: true, defaultVal: T): Promise<T>
    private async call<T>(req: AWS.Request<T, AWS.AWSError>, silent: false): Promise<T>
    private async call<T>(req: AWS.Request<T, AWS.AWSError>, silent: boolean, defaultVal?: T): Promise<T> {
        const log = this.log
        const bearerToken = (await this.connection.getToken()).accessToken
        req.httpRequest.headers['Authorization'] = `Bearer ${bearerToken}`

        return new Promise<T>((resolve, reject) => {
            req.send(function (e, data) {
                const r = req as any
                if (e) {
                    if (e.code === 'AccessDeniedException' || e.statusCode === 401) {
                        CodeCatalystClientInternal.identityCache.delete(bearerToken)
                    }

                    const allHeaders = r?.response?.httpResponse?.headers
                    const logHeaders = {}
                    // Selected headers which are useful for logging.
                    const logHeaderNames = [
                        // 'access-control-expose-headers',
                        // 'cache-control',
                        // 'strict-transport-security',
                        'x-amz-apigw-id',
                        'x-amz-cf-id',
                        'x-amz-cf-pop',
                        'x-amzn-remapped-content-length',
                        'x-amzn-remapped-x-amzn-requestid',
                        'x-amzn-requestid',
                        'x-amzn-served-from',
                        'x-amzn-trace-id',
                        'x-cache',
                        'x-request-id', // <- Request id for caws/fusi!
                    ]
                    if (allHeaders && Object.keys(allHeaders).length > 0) {
                        for (const k of logHeaderNames) {
                            ;(logHeaders as any)[k] = (k in allHeaders ? allHeaders : logHeaderNames)[k]
                        }
                    }

                    // Stack is noisy and useless in production.
                    const errNoStack = { ...e }
                    delete errNoStack.stack
                    // Remove confusing "requestId" field (= "x-amzn-requestid" header)
                    // because for caws/fusi, "x-request-id" is more relevant.
                    // All of the various request-ids can be found in the logged headers.
                    delete errNoStack.requestId

                    if (r.operation || r.params) {
                        log.error(
                            'API request failed: %s\nparams: %O\nerror: %O\nheaders: %O',
                            r.operation,
                            r.params,
                            errNoStack,
                            logHeaders
                        )
                    } else {
                        log.error('API request failed:%O\nheaders: %O', req, logHeaders)
                    }
                    if (silent) {
                        if (defaultVal === undefined) {
                            throw Error()
                        }
                        resolve(defaultVal)
                    } else {
                        reject(e)
                    }
                    return
                }
                log.verbose('API request (%s):\nparams: %O\nresponse: %O', r.operation ?? '?', r.params ?? '?', data)
                resolve(data)
            })
        })
    }

    /**
     * Creates a PAT.
     *
     * @param args.name Name of the token
     * @param args.expires PAT expires on this date, or undefined.
     * @returns PAT secret
     */
    public async createAccessToken(
        args: CodeCatalyst.CreateAccessTokenRequest
    ): Promise<CodeCatalyst.CreateAccessTokenResponse> {
        try {
            return this.call(this.sdkClient.createAccessToken(args), false)
        } catch (e) {
            if ((e as Error).name === 'ServiceQuotaExceededException') {
                throw new ToolkitError('Access token limit exceeded', { code: 'ServiceQuotaExceeded' })
            }
            throw e
        }
    }

    public async getSubscription(
        request: CodeCatalyst.GetSubscriptionRequest
    ): Promise<CodeCatalyst.GetSubscriptionResponse> {
        return this.call(this.sdkClient.getSubscription(request), false)
    }

    /**
     * Gets identity properties of the current authenticated principal, and
     * stores the id for use in later calls.
     */
    public async verifySession(): Promise<UserDetails> {
        const id = await this.getUserId()
        this.userDetails = CodeCatalystClientInternal.userDetailsCache.get(id) ?? (await this.getUserDetails({ id }))
        CodeCatalystClientInternal.userDetailsCache.set(id, this.userDetails)

        return { ...this.userDetails }
    }

    private async getUserId(): Promise<string> {
        const { accessToken, expiresAt } = await this.connection.getToken()
        if (CodeCatalystClientInternal.identityCache.has(accessToken)) {
            return CodeCatalystClientInternal.identityCache.get(accessToken)!
        }

        const resp = await this.call(this.sdkClient.verifySession(), false)
        assertHasProps(resp, 'identity')

        CodeCatalystClientInternal.identityCache.set(accessToken, resp.identity)
        setTimeout(() => {
            CodeCatalystClientInternal.identityCache.delete(accessToken)
            CodeCatalystClientInternal.userDetailsCache.delete(resp.identity)
        }, expiresAt.getTime() - Date.now())

        return resp.identity
    }

    public async getBearerToken(): Promise<string> {
        return (await this.connection.getToken()).accessToken
    }

    private async getUserDetails(args: CodeCatalyst.GetUserDetailsRequest) {
        const resp = await this.call(this.sdkClient.getUserDetails(args), false)
        assertHasProps(resp, 'userId', 'userName', 'displayName', 'primaryEmail')

        return { ...resp, version: resp.version } as const
    }

    public async getSpace(request: CodeCatalyst.GetSpaceRequest): Promise<CodeCatalystOrg> {
        const resp = await this.call(this.sdkClient.getSpace(request), false)

        return { ...resp, type: 'org' }
    }

    public async getProject(request: CodeCatalyst.GetProjectRequest): Promise<CodeCatalystProject> {
        const resp = await this.call(this.sdkClient.getProject(request), false)

        return { ...resp, type: 'project', org: { name: request.spaceName } }
    }

    /**
     * Gets a list of all spaces (orgs) for the current CodeCatalyst user.
     */
    public listSpaces(request: CodeCatalyst.ListSpacesRequest = {}): AsyncCollection<CodeCatalystOrg[]> {
        const requester = async (request: CodeCatalyst.ListSpacesRequest) =>
            this.call(this.sdkClient.listSpaces(request), true, { items: [] })
        const collection = pageableToCollection(requester, request, 'nextToken', 'items')

        return collection.map(summaries => summaries?.map(s => ({ type: 'org', ...s })) ?? [])
    }

    /**
     * Gets a list of all projects for the given CodeCatalyst user.
     */
    public listProjects(request: CodeCatalyst.ListProjectsRequest): AsyncCollection<CodeCatalystProject[]> {
        const requester = async (request: CodeCatalyst.ListProjectsRequest) =>
            this.call(this.sdkClient.listProjects(request), true, { items: [] })
        const collection = pageableToCollection(requester, request, 'nextToken', 'items')

        return collection.map(
            summaries =>
                summaries?.map(s => ({
                    type: 'project',
                    org: { name: request.spaceName },
                    ...s,
                })) ?? []
        )
    }

    /**
     * Gets a flat list of all devenvs for the given CodeCatalyst project.
     */
    public listDevEnvironments(proj: CodeCatalystProject): AsyncCollection<DevEnvironment[]> {
        const initRequest = { spaceName: proj.org.name, projectName: proj.name }
        const requester = async (request: CodeCatalyst.ListDevEnvironmentsRequest) =>
            this.call(this.sdkClient.listDevEnvironments(request), true, {
                // spaceName: proj.org.name,
                // projectName: proj.name,
                items: [],
            })
        const collection = pageableToCollection(requester, initRequest, 'nextToken', 'items')

        return collection.map(envs => envs.map(s => toDevEnv(proj.org.name, proj.name, s)))
    }

    /**
     * Gets a flat list of all repos for the given CodeCatalyst user.
     */
    public listSourceRepositories(
        request: CodeCatalyst.ListSourceRepositoriesRequest
    ): AsyncCollection<CodeCatalystRepo[]> {
        const requester = async (request: CodeCatalyst.ListSourceRepositoriesRequest) =>
            this.call(this.sdkClient.listSourceRepositories(request), true, { items: [] })
        const collection = pageableToCollection(requester, request, 'nextToken', 'items')
        return collection.map(
            summaries =>
                summaries?.map(s => ({
                    type: 'repo',
                    org: { name: request.spaceName },
                    project: { name: request.projectName },
                    ...s,
                })) ?? []
        )
    }

    public listBranches(
        request: CodeCatalyst.ListSourceRepositoryBranchesRequest
    ): AsyncCollection<CodeCatalystBranch[]> {
        const requester = async (request: CodeCatalyst.ListSourceRepositoryBranchesRequest) =>
            this.call(this.sdkClient.listSourceRepositoryBranches(request), true, { items: [] })
        const collection = pageableToCollection(requester, request, 'nextToken', 'items')

        return collection
            .filter(isNonNullable)
            .map(items =>
                items.map(b => toBranch(request.spaceName, request.projectName, request.sourceRepositoryName, b))
            )
    }

    /**
     * Lists ALL of the given resource in the current account
     */
    public listResources(resourceType: 'org'): AsyncCollection<CodeCatalystOrg[]>
    public listResources(resourceType: 'project'): AsyncCollection<CodeCatalystProject[]>
    public listResources(resourceType: 'repo'): AsyncCollection<CodeCatalystRepo[]>
    public listResources(resourceType: 'devEnvironment'): AsyncCollection<DevEnvironment[]>
    public listResources(resourceType: CodeCatalystResource['type']): AsyncCollection<CodeCatalystResource[]> {
        // Don't really want to expose this apart of the `AsyncCollection` API yet
        // The semantics of concatenating async iterables is rather ambiguous
        // For example, an array of async iterables can be joined either in-order or out-of-order.
        // In-order concatenations only makes sense for finite iterables, though I'm unaware of any
        // convention to declare an iterable to be finite.
        function mapInner<T, U>(
            collection: AsyncCollection<T[]>,
            fn: (element: T) => AsyncCollection<U[]>
        ): AsyncCollection<U[]> {
            return toCollection(async function* () {
                for await (const element of await collection.promise()) {
                    yield* await Promise.all(element.map(e => fn(e).flatten().promise()))
                }
            })
        }

        switch (resourceType) {
            case 'org':
                return this.listSpaces()
            case 'project':
                return mapInner(this.listResources('org'), o => this.listProjects({ spaceName: o.name }))
            case 'repo':
                return mapInner(this.listResources('project'), p =>
                    this.listSourceRepositories({ projectName: p.name, spaceName: p.org.name })
                )
            case 'branch':
                throw new Error('Listing branches is not currently supported')
            case 'devEnvironment':
                return mapInner(this.listResources('project'), p => this.listDevEnvironments(p))
        }
    }

    public async createSourceBranch(
        args: CodeCatalyst.CreateSourceRepositoryBranchRequest
    ): Promise<CodeCatalyst.CreateSourceRepositoryBranchResponse> {
        return this.call(this.sdkClient.createSourceRepositoryBranch(args), false)
    }

    /**
     * Gets the git source host URL for the given CodeCatalyst repo.
     */
    public async getRepoCloneUrl(args: CodeCatalyst.GetSourceRepositoryCloneUrlsRequest): Promise<string> {
        const r = await this.call(this.sdkClient.getSourceRepositoryCloneUrls(args), false)

        // The git extension skips over credential providers if the username is included in the authority
        return `https://${r.https.replace(/.*@/, '')}`
    }

    public async createDevEnvironment(args: CodeCatalyst.CreateDevEnvironmentRequest): Promise<DevEnvironment> {
        const { id } = await this.call(this.sdkClient.createDevEnvironment(fixAliasInRequest(args)), false)

        return this.getDevEnvironment({
            id,
            projectName: args.projectName,
            spaceName: args.spaceName,
        })
    }

    public async startDevEnvironment(
        args: CodeCatalyst.StartDevEnvironmentRequest
    ): Promise<CodeCatalyst.StartDevEnvironmentResponse> {
        return this.call(this.sdkClient.startDevEnvironment(args), false)
    }

    public async createProject(args: CodeCatalyst.CreateProjectRequest): Promise<CodeCatalystProject> {
        await this.call(this.sdkClient.createProject(args), false)

        return { ...args, name: args.displayName, type: 'project', org: { name: args.spaceName } }
    }

    public async startDevEnvironmentSession(
        args: CodeCatalyst.StartDevEnvironmentSessionRequest
    ): Promise<CodeCatalyst.StartDevEnvironmentSessionResponse & { sessionId: string }> {
        const r = await this.call(this.sdkClient.startDevEnvironmentSession(args), false)
        if (!r.sessionId) {
            throw new TypeError('Received falsy development environment "sessionId"')
        }
        return { ...r, sessionId: r.sessionId }
    }

    public async stopDevEnvironment(
        args: CodeCatalyst.StopDevEnvironmentRequest
    ): Promise<CodeCatalyst.StopDevEnvironmentResponse> {
        return this.call(this.sdkClient.stopDevEnvironment(args), false)
    }

    public async getDevEnvironment(args: CodeCatalyst.GetDevEnvironmentRequest): Promise<DevEnvironment> {
        const a = { ...args }
        delete (a as any).ides
        delete (a as any).repositories
        const r = await this.call(this.sdkClient.getDevEnvironment(a), false)

        return toDevEnv(args.spaceName, args.projectName, { ...args, ...r })
    }

    public async deleteDevEnvironment(
        args: CodeCatalyst.DeleteDevEnvironmentRequest
    ): Promise<CodeCatalyst.DeleteDevEnvironmentResponse> {
        return this.call(this.sdkClient.deleteDevEnvironment(args), false)
    }

    public updateDevEnvironment(
        args: CodeCatalyst.UpdateDevEnvironmentRequest
    ): Promise<CodeCatalyst.UpdateDevEnvironmentResponse> {
        return this.call(this.sdkClient.updateDevEnvironment(fixAliasInRequest(args)), false)
    }

    /**
     * Best-effort attempt to start a devenv given an ID, showing a progress notification with a cancel button
     * TODO: may combine this progress stuff into some larger construct
     *
     * The cancel button does not abort the start, but rather alerts any callers that any operations that rely
     * on the development environment starting should not progress.
     */
    public async startDevEnvironmentWithProgress(
        args: CodeCatalyst.StartDevEnvironmentRequest,
        status: string,
        timeout: Timeout = new Timeout(180000)
    ): Promise<DevEnvironment> {
        let lastStatus: undefined | string
        try {
            const devenv = await this.getDevEnvironment(args)
            lastStatus = devenv.status
            if (status === 'RUNNING' && lastStatus === 'RUNNING') {
                // "Debounce" in case caller did not check if the environment was already running.
                return devenv
            }
        } catch {
            lastStatus = undefined
        }

        const progress = await showMessageWithCancel(
            localize('AWS.CodeCatalyst.startMde.message', 'CodeCatalyst'),
            timeout
        )
        progress.report({ message: localize('AWS.CodeCatalyst.startMde.checking', 'checking status...') })

        const pollDevEnv = waitUntil(
            async () => {
                this.log.debug(
                    'devenv not started, waiting (time: %d seconds): %s',
                    timeout.elapsedTime / 1000,
                    args.id
                )
                // technically this will continue to be called until it reaches its own timeout, need a better way to 'cancel' a `waitUntil`
                if (timeout.completed) {
                    return
                }

                const resp = await this.getDevEnvironment(args)
                if (lastStatus === 'STARTING' && (resp.status === 'STOPPED' || resp.status === 'STOPPING')) {
                    throw new ToolkitError('Dev Environment failed to start', { code: 'BadDevEnvState' })
                }

                if (resp.status === 'STOPPED') {
                    progress.report({
                        message: localize('AWS.CodeCatalyst.startMde.stopStart', 'Resuming Dev Environment...'),
                    })
                    await this.startDevEnvironment(args)
                } else if (resp.status === 'STOPPING') {
                    progress.report({
                        message: localize(
                            'AWS.CodeCatalyst.startMde.resuming',
                            'Waiting for Dev Environment to stop...'
                        ),
                    })
                } else if (resp.status === 'FAILED') {
                    throw new ToolkitError('Dev Environment failed to start', { code: 'FailedDevEnv' })
                } else {
                    progress.report({
                        message: localize('AWS.CodeCatalyst.startMde.starting', 'Opening Dev Environment...'),
                    })
                }

                lastStatus = resp.status
                return resp.status === 'RUNNING' ? resp : undefined
            },
            // note: the `waitUntil` will resolve prior to the real timeout if it is refreshed
            { interval: 1000, timeout: timeout.remainingTime, truthy: true }
        )

        const devenv = await waitTimeout(pollDevEnv, timeout)
        if (!devenv) {
            throw new ToolkitError('Dev Environment failed to start', { code: 'Timeout' })
        }
        this.log.info('devenv started after %d seconds: %s', timeout.elapsedTime / 1000, args.id)

        return devenv
    }
}
