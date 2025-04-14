/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as AWS from 'aws-sdk'
import * as logger from '../logger/logger'
import { CancellationError, Timeout, waitTimeout, waitUntil } from '../utilities/timeoutUtils'
import { isUserCancelledError } from '../../shared/errors'
import { showMessageWithCancel } from '../utilities/messages'
import {
    assertHasProps,
    ClassToInterfaceType,
    hasProps,
    isDefined,
    isNonNullable,
    RequiredProps,
} from '../utilities/tsUtils'
import { AsyncCollection, toCollection } from '../utilities/asyncCollection'
import { joinAll, pageableToCollection } from '../utilities/collectionUtils'
import { CodeCatalyst } from 'aws-sdk'
import { ToolkitError } from '../errors'
import { Uri } from 'vscode'
import { GetSourceRepositoryCloneUrlsRequest } from 'aws-sdk/clients/codecatalyst'
import {
    CodeCatalystClient as CodeCatalystSDKClient,
    CreateAccessTokenCommand,
    CreateAccessTokenRequest,
    CreateAccessTokenResponse,
    CreateDevEnvironmentCommand,
    CreateDevEnvironmentCommandOutput,
    CreateDevEnvironmentRequest,
    CreateProjectCommand,
    CreateProjectRequest,
    CreateSourceRepositoryBranchCommand,
    CreateSourceRepositoryBranchRequest,
    CreateSourceRepositoryBranchResponse,
    DeleteDevEnvironmentCommand,
    DeleteDevEnvironmentRequest,
    DeleteDevEnvironmentResponse,
    DevEnvironmentRepositorySummary,
    DevEnvironmentSummary,
    GetDevEnvironmentCommand,
    GetDevEnvironmentRequest,
    GetDevEnvironmentResponse,
    GetProjectCommand,
    GetProjectCommandOutput,
    GetProjectRequest,
    GetSourceRepositoryCloneUrlsCommand,
    GetSourceRepositoryCloneUrlsResponse,
    GetSpaceCommand,
    GetSpaceCommandOutput,
    GetSpaceRequest,
    GetSubscriptionCommand,
    GetSubscriptionRequest,
    GetUserDetailsCommand,
    GetUserDetailsCommandOutput,
    GetUserDetailsRequest,
    ListDevEnvironmentsCommand,
    ListDevEnvironmentsRequest,
    ListDevEnvironmentsResponse,
    ListProjectsCommand,
    ListProjectsRequest,
    ListProjectsResponse,
    ListSourceRepositoriesCommand,
    ListSourceRepositoriesItem,
    ListSourceRepositoriesRequest,
    ListSourceRepositoriesResponse,
    ListSourceRepositoryBranchesCommand,
    ListSourceRepositoryBranchesRequest,
    ListSpacesCommand,
    ListSpacesRequest,
    ListSpacesResponse,
    PersistentStorage,
    ProjectSummary,
    SpaceSummary,
    StartDevEnvironmentCommand,
    StartDevEnvironmentRequest,
    StartDevEnvironmentResponse,
    StartDevEnvironmentSessionCommand,
    StartDevEnvironmentSessionRequest,
    StartDevEnvironmentSessionResponse,
    StopDevEnvironmentCommand,
    StopDevEnvironmentRequest,
    StopDevEnvironmentResponse,
    UpdateDevEnvironmentCommand,
    UpdateDevEnvironmentRequest,
    UpdateDevEnvironmentResponse,
    VerifySessionCommand,
    VerifySessionCommandOutput,
} from '@aws-sdk/client-codecatalyst'
import { SsoConnection } from '../../auth/connection'
import { DevSettings } from '../settings'
import { getServiceEnvVarConfig } from '../vscode/env'
import { ClientWrapper } from './clientWrapper'
import { ServiceException } from '@aws-sdk/smithy-client'
import { AccessDeniedException } from '@aws-sdk/client-sso-oidc'
import { TokenIdentityProvider } from '@aws-sdk/types'

const requiredDevEnvProps = [
    'id',
    'status',
    'inactivityTimeoutMinutes',
    'repositories',
    'instanceType',
    'lastUpdatedTime',
] as const
type RequiredDevEnvProps = (typeof requiredDevEnvProps)[number]

export interface CodeCatalystConfig {
    readonly region: string
    readonly endpoint: string
    readonly hostname: string
    readonly gitHostname: string
}

export const defaultServiceConfig: CodeCatalystConfig = {
    region: 'us-east-1',
    endpoint: 'https://codecatalyst.global.api.aws',
    hostname: 'codecatalyst.aws',
    gitHostname: 'codecatalyst.aws',
}

export function getCodeCatalystConfig(): CodeCatalystConfig {
    return {
        ...DevSettings.instance.getServiceConfig('codecatalystService', defaultServiceConfig),

        // Environment variable overrides
        ...getServiceEnvVarConfig('codecatalyst', Object.keys(defaultServiceConfig)),
    }
}

interface CodeCatalystDevEnvironmentSummary extends RequiredProps<DevEnvironmentSummary, RequiredDevEnvProps> {
    readonly persistentStorage: RequiredProps<PersistentStorage, 'sizeInGiB'>
    readonly repositories: RequiredProps<DevEnvironmentRepositorySummary, 'repositoryName'>[]
}

export interface DevEnvironment extends CodeCatalystDevEnvironmentSummary {
    readonly type: 'devEnvironment'
    readonly id: string
    readonly org: Pick<CodeCatalystOrg, 'name'>
    readonly project: Pick<CodeCatalystProject, 'name'>
    readonly repositories: RequiredProps<DevEnvironmentRepositorySummary, 'repositoryName'>[]
}

/** CodeCatalyst developer environment session. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CodeCatalystDevEnvSession extends CodeCatalyst.StartDevEnvironmentResponse {}

export interface CodeCatalystOrg extends SpaceSummary {
    readonly type: 'org'
    readonly name: string
}

export interface CodeCatalystProject extends CodeCatalyst.ProjectSummary {
    readonly type: 'project'
    readonly name: string
    readonly org: Pick<CodeCatalystOrg, 'name'>
}

export interface CodeCatalystRepo extends ListSourceRepositoriesItem {
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

function toDevEnv(spaceName: string, projectName: string, summary: CodeCatalystDevEnvironmentSummary): DevEnvironment {
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

function createCodeCatalystClient(
    tokenProvider: TokenIdentityProvider,
    regionCode: string,
    endpoint: string
): CodeCatalystSDKClient {
    // Avoid using cached client so that we can inject fresh bearer token provider.
    return globals.sdkClientBuilderV3.createAwsService({
        serviceClient: CodeCatalystSDKClient,
        clientOptions: {
            region: regionCode,
            endpoint: endpoint,
            token: tokenProvider,
        },
    })
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

const onAccessDeniedExceptionEmitter = new vscode.EventEmitter<boolean>()
export const onAccessDeniedException = onAccessDeniedExceptionEmitter.event

interface AuthOptions {
    showReauthPrompt?: boolean
}
export type CodeCatalystClientFactory = () => Promise<CodeCatalystClient>
/**
 * Factory to create a new `CodeCatalystClient`. Call `onCredentialsChanged()` before making requests.
 */
export async function createClient(
    connection: SsoConnection,
    regionCode = getCodeCatalystConfig().region,
    endpoint = getCodeCatalystConfig().endpoint,
    authOptions: AuthOptions = {}
): Promise<CodeCatalystClient> {
    const sdkv3Client = createCodeCatalystClient(getTokenProvider(connection), regionCode, endpoint)
    const c = new CodeCatalystClientInternal(connection, sdkv3Client, regionCode)
    try {
        await c.verifySession()
    } catch (e) {
        if (!(e instanceof ToolkitError) || e.code !== 'AccessDeniedException') {
            throw e
        }
        onAccessDeniedExceptionEmitter.fire(authOptions.showReauthPrompt ?? true)

        // Throw a "cancel" error to prevent further execution.
        throw new ToolkitError('CodeCatalyst scope is expired', { code: 'ScopeExpiration', cancelled: true })
    }

    return c
}

// TODO: move this to sso auth folder?
function getTokenProvider(connection: SsoConnection): TokenIdentityProvider {
    return async (_) => {
        const token = await connection.getToken()
        return {
            token: token.accessToken,
            expiration: token.expiresAt,
        }
    }
}

// XXX: the backend currently rejects empty strings for `alias` so the field must be removed if falsey
function fixAliasInRequest<T extends CreateDevEnvironmentRequest | UpdateDevEnvironmentRequest>(request: T): T {
    if (!request.alias) {
        delete request.alias
    }

    return request
}

class CodeCatalystClientInternal extends ClientWrapper<CodeCatalystSDKClient> {
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

    public constructor(
        private readonly connection: SsoConnection,
        private readonly sdkClientV3: CodeCatalystSDKClient,
        regionCode: string
    ) {
        super(regionCode, CodeCatalystSDKClient)
        this.log = logger.getLogger()
    }

    protected override getClient(): CodeCatalystSDKClient {
        return this.sdkClientV3
    }

    public get identity(): CodeCatalystClient['identity'] {
        if (!this.userDetails) {
            throw new Error('CodeCatalyst client is not connected')
        }

        return { id: this.userDetails.userId, name: this.userDetails.userName }
    }

    protected override async onError(e: Error): Promise<void> {
        const bearerToken = (await this.connection.getToken()).accessToken
        if (e instanceof ServiceException && isAccessDeniedError(e)) {
            CodeCatalystClientInternal.identityCache.delete(bearerToken)
        }

        function isAccessDeniedError(e: ServiceException): boolean {
            return (
                e.$response?.statusCode === 403 ||
                e.$response?.statusCode === 401 ||
                e.name === AccessDeniedException.name
            )
        }
    }

    /**
     * Creates a PAT.
     *
     * @param args.name Name of the token
     * @param args.expires PAT expires on this date, or undefined.
     * @returns PAT secret
     */
    public async createAccessToken(
        args: CreateAccessTokenRequest
    ): Promise<RequiredProps<CreateAccessTokenResponse, 'secret'>> {
        try {
            return await this.makeRequest(CreateAccessTokenCommand, args)
        } catch (e) {
            if ((e as Error).name === 'ServiceQuotaExceededException') {
                throw new ToolkitError('Access token limit exceeded', { cause: e as Error })
            }
            throw e
        }
    }

    public async getSubscription(request: GetSubscriptionRequest): Promise<CodeCatalyst.GetSubscriptionResponse> {
        return this.makeRequest(GetSubscriptionCommand, request)
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

        const r: VerifySessionCommandOutput = await this.makeRequest(VerifySessionCommand, {})
        assertHasProps(r, 'identity')

        CodeCatalystClientInternal.identityCache.set(accessToken, r.identity)
        setTimeout(() => {
            CodeCatalystClientInternal.identityCache.delete(accessToken)
            CodeCatalystClientInternal.userDetailsCache.delete(r.identity)
        }, expiresAt.getTime() - Date.now())

        return r.identity
    }

    public async getBearerToken(): Promise<string> {
        return (await this.connection.getToken()).accessToken
    }

    private async getUserDetails(args: GetUserDetailsRequest) {
        const resp: GetUserDetailsCommandOutput = await this.makeRequest(GetUserDetailsCommand, args)
        assertHasProps(resp, 'userId', 'userName', 'displayName', 'primaryEmail')

        return { ...resp, version: resp.version } as const
    }

    public async getSpace(request: GetSpaceRequest): Promise<CodeCatalystOrg> {
        const resp: GetSpaceCommandOutput = await this.makeRequest(GetSpaceCommand, request)
        assertHasProps(resp, 'name', 'regionName')
        return { ...resp, type: 'org' }
    }

    public async getProject(request: RequiredProps<GetProjectRequest, 'spaceName'>): Promise<CodeCatalystProject> {
        const resp: GetProjectCommandOutput = await this.makeRequest(GetProjectCommand, request)
        assertHasProps(resp, 'name')
        return { ...resp, type: 'project', org: { name: request.spaceName } }
    }

    /**
     * Gets a list of all spaces (orgs) for the current CodeCatalyst user.
     */
    public listSpaces(request: ListSpacesRequest = {}): AsyncCollection<CodeCatalystOrg[]> {
        const requester: (request: ListSpacesRequest) => Promise<ListSpacesResponse> = async (request) =>
            this.makeRequest(ListSpacesCommand, request, { fallbackValue: { items: [] } })
        const collection = pageableToCollection(requester, request, 'nextToken', 'items').filter(isDefined)
        // ts doesn't recognize nested assertion, so we add cast.This is safe because we assert it in the same line.
        return collection.map((summaries) => summaries.filter(hasName).map(toOrg))

        function toOrg<T extends RequiredProps<SpaceSummary, 'name'>>(s: T): CodeCatalystOrg {
            return {
                type: 'org',
                ...s,
            }
        }
    }

    /**
     * Gets a list of all projects for the given CodeCatalyst user.
     */
    public listProjects(
        request: RequiredProps<ListProjectsRequest, 'spaceName'>
    ): AsyncCollection<CodeCatalystProject[]> {
        // Only get projects the user is a member of.
        request.filters = [
            ...(request.filters ?? []),
            {
                key: 'hasAccessTo',
                values: ['true'],
            },
        ]

        const requester: (request: ListProjectsRequest) => Promise<ListProjectsResponse> = (request) =>
            this.makeRequest(ListProjectsCommand, request, { fallbackValue: { items: [] } })

        const collection = pageableToCollection(requester, request, 'nextToken', 'items')
        return collection.filter(isDefined).map((summaries) => summaries.filter(hasName).map(toProject))

        function toProject<T extends RequiredProps<ProjectSummary, 'name'>>(s: T): CodeCatalystProject {
            return {
                type: 'project',
                org: { name: request.spaceName },
                ...s,
            }
        }
    }

    /**
     * Gets a flat list of all devenvs for the given CodeCatalyst project.
     */
    public listDevEnvironments(proj: CodeCatalystProject): AsyncCollection<DevEnvironment[]> {
        const initRequest = { spaceName: proj.org.name, projectName: proj.name }
        const requester: (request: ListDevEnvironmentsRequest) => Promise<ListDevEnvironmentsResponse> = (request) =>
            this.makeRequest(ListDevEnvironmentsCommand, request, { fallbackValue: { items: [] } })
        const collection = pageableToCollection(requester, initRequest, 'nextToken' as never, 'items').filter(isDefined)
        // ts unable to recognize nested assertion here, so we need to cast. This is safe because we assert it in the same line.
        return collection.map((envs) => {
            const filteredEnvs = envs.filter(isValidEnvSummary)
            const mappedEnvs = filteredEnvs.map((s) => toDevEnv(proj.org.name, proj.name, s))
            return mappedEnvs
        })
    }

    /**
     * Gets a flat list of all repos for the given CodeCatalyst user.
     * @param thirdParty If you want to include 3P (eg github) results in
     *                   your output.
     */
    public listSourceRepositories(
        request: RequiredProps<ListSourceRepositoriesRequest, 'spaceName' | 'projectName'>,
        thirdParty: boolean = true
    ): AsyncCollection<CodeCatalystRepo[]> {
        const requester = async (r: typeof request) => {
            const allRepositories: Promise<ListSourceRepositoriesResponse> = this.makeRequest(
                ListSourceRepositoriesCommand,
                r,
                { fallbackValue: { items: [] } }
            )
            let finalRepositories = allRepositories

            // Filter out 3P repos
            if (!thirdParty) {
                finalRepositories = allRepositories.then(async (repos) => {
                    repos.items = await excludeThirdPartyRepos(
                        this,
                        request.spaceName,
                        request.projectName,
                        repos.items?.filter(hasName)
                    )
                    return repos
                })
            }

            return finalRepositories
        }

        const collection = pageableToCollection(requester, request, 'nextToken', 'items')
        return collection.filter(isDefined).map((summaries) => summaries.filter(hasName).map(toCodeCatalystRepo))

        function toCodeCatalystRepo(s: RequiredProps<ListSourceRepositoriesItem, 'name'>): CodeCatalystRepo {
            return {
                type: 'repo',
                org: { name: request.spaceName },
                project: { name: request.projectName },
                ...s,
            }
        }
    }

    public listBranches(
        request: RequiredProps<
            ListSourceRepositoryBranchesRequest,
            'spaceName' | 'projectName' | 'sourceRepositoryName'
        >
    ): AsyncCollection<CodeCatalystBranch[]> {
        const requester = async (r: typeof request) =>
            this.makeRequest(ListSourceRepositoryBranchesCommand, r, { fallbackValue: { items: [] } })
        const collection = pageableToCollection(requester, request, 'nextToken' as never, 'items')

        return collection
            .filter(isNonNullable)
            .map((items) =>
                items.map((b) => toBranch(request.spaceName, request.projectName, request.sourceRepositoryName, b))
            )
    }

    /**
     * Lists ALL of the given resource in the current account
     *
     * @param thirdParty If you want 3P repos in the result.
     */
    public listResources(resourceType: 'org'): AsyncCollection<CodeCatalystOrg[]>
    public listResources(resourceType: 'project'): AsyncCollection<CodeCatalystProject[]>
    public listResources(resourceType: 'repo', thirdParty?: boolean): AsyncCollection<CodeCatalystRepo[]>
    public listResources(resourceType: 'devEnvironment'): AsyncCollection<DevEnvironment[]>
    public listResources(
        resourceType: CodeCatalystResource['type'],
        ...args: any[]
    ): AsyncCollection<CodeCatalystResource[]> {
        function mapInner<T, U>(
            collection: AsyncCollection<T[]>,
            fn: (element: T) => AsyncCollection<U[]>
        ): AsyncCollection<U[]> {
            return toCollection(() => joinAll(collection.flatten().map(fn)))
        }

        switch (resourceType) {
            case 'org':
                return this.listSpaces()
            case 'project':
                return mapInner(this.listResources('org'), (o) => this.listProjects({ spaceName: o.name }))
            case 'repo':
                return mapInner(this.listResources('project'), (p) =>
                    this.listSourceRepositories({ projectName: p.name, spaceName: p.org.name }, ...args)
                )
            case 'branch':
                throw new Error('Listing branches is not currently supported')
            case 'devEnvironment':
                return mapInner(this.listResources('project'), (p) => this.listDevEnvironments(p))
        }
    }

    public async createSourceBranch(
        args: CreateSourceRepositoryBranchRequest
    ): Promise<CreateSourceRepositoryBranchResponse> {
        return this.makeRequest(CreateSourceRepositoryBranchCommand, args)
    }

    /**
     * Gets the git source host URL for the given CodeCatalyst or third-party repo.
     */
    public async getRepoCloneUrl(args: GetSourceRepositoryCloneUrlsRequest): Promise<string> {
        const r: GetSourceRepositoryCloneUrlsResponse = await this.makeRequest(
            GetSourceRepositoryCloneUrlsCommand,
            args
        )
        assertHasProps(r, 'https')
        // The git extension skips over credential providers if the username is included in the authority
        const uri = Uri.parse(r.https)
        return uri.with({ authority: uri.authority.replace(/.*@/, '') }).toString()
    }

    public async createDevEnvironment(
        args: RequiredProps<CreateDevEnvironmentRequest, 'projectName' | 'spaceName'>
    ): Promise<DevEnvironment> {
        const request = fixAliasInRequest(args)
        const response: CreateDevEnvironmentCommandOutput = await this.makeRequest(CreateDevEnvironmentCommand, request)
        assertHasProps(response, 'id')

        return this.getDevEnvironment({
            id: response.id,
            projectName: args.projectName,
            spaceName: args.spaceName,
        })
    }

    public async startDevEnvironment(args: StartDevEnvironmentRequest): Promise<StartDevEnvironmentResponse> {
        return this.makeRequest(StartDevEnvironmentCommand, args)
    }

    public async createProject(
        args: RequiredProps<CreateProjectRequest, 'displayName' | 'spaceName'>
    ): Promise<CodeCatalystProject> {
        await this.makeRequest(CreateProjectCommand, args)

        return { ...args, name: args.displayName, type: 'project', org: { name: args.spaceName } }
    }

    public async startDevEnvironmentSession(
        args: StartDevEnvironmentSessionRequest
    ): Promise<StartDevEnvironmentSessionResponse & { sessionId: string }> {
        const r: StartDevEnvironmentSessionResponse = await this.makeRequest(StartDevEnvironmentSessionCommand, args)
        if (!r.sessionId) {
            throw new TypeError('got falsy dev environment "sessionId"')
        }
        return { ...r, sessionId: r.sessionId }
    }

    public async stopDevEnvironment(args: StopDevEnvironmentRequest): Promise<StopDevEnvironmentResponse> {
        return this.makeRequest(StopDevEnvironmentCommand, args)
    }

    public async getDevEnvironment(
        args: RequiredProps<GetDevEnvironmentRequest, 'spaceName' | 'projectName'>
    ): Promise<DevEnvironment> {
        const a = { ...args }
        delete (a as any).ides
        delete (a as any).repositories

        const r: GetDevEnvironmentResponse = await this.makeRequest(GetDevEnvironmentCommand, a)
        const summary = { ...args, ...r }
        if (!isValidEnvSummary(summary)) {
            throw new ToolkitError(`GetDevEnvironment failed due to response missing required properties`)
        }

        return toDevEnv(args.spaceName, args.projectName, summary)
    }

    public async deleteDevEnvironment(args: DeleteDevEnvironmentRequest): Promise<DeleteDevEnvironmentResponse> {
        return this.makeRequest(DeleteDevEnvironmentCommand, args)
    }

    public updateDevEnvironment(args: UpdateDevEnvironmentRequest): Promise<UpdateDevEnvironmentResponse> {
        const request = fixAliasInRequest(args)
        return this.makeRequest(UpdateDevEnvironmentCommand, request)
    }

    /**
     * Best-effort attempt to start a devenv given an ID, showing a progress notification with a cancel button
     * TODO: may combine this progress stuff into some larger construct
     *
     * The cancel button does not abort the start, but rather alerts any callers that any operations that rely
     * on the dev environment starting should not progress.
     */
    public async startDevEnvironmentWithProgress(
        args: RequiredProps<StartDevEnvironmentRequest, 'id' | 'spaceName' | 'projectName'>,
        timeout: Timeout = new Timeout(1000 * 60 * 60)
    ): Promise<DevEnvironment> {
        // Track the status changes chronologically so that we can
        // 1. reason about hysterisis (weird flip-flops)
        // 2. have visibility in the logs
        const statuses = new Array<{ status: string; start: number }>()
        let alias: string | undefined
        let startAttempts = 0

        function statusesToString() {
            let s = ''
            for (let i = 0; i < statuses.length; i++) {
                const item = statuses[i]
                const nextItem = i < statuses.length - 1 ? statuses[i + 1] : undefined
                const nextTime = nextItem ? nextItem.start : Date.now()
                const elapsed = nextTime - item.start
                s += `${s ? ' ' : ''}${item.status}/${elapsed}ms`
            }
            return `[${s}]`
        }

        function getName(): string {
            const fullname = alias ? alias : args.id
            const shortname = fullname.substring(0, 19) + (fullname.length > 20 ? '…' : '')
            return shortname
        }

        function failedStartMsg(serviceMsg?: string) {
            const LastSeenStatus = statuses[statuses.length - 1]?.status
            const serviceMsg_ = serviceMsg ? `${serviceMsg}: ` : ''
            return `Dev Environment failed to start (${LastSeenStatus}): ${serviceMsg_}${getName()}`
        }

        const doLog = (kind: 'debug' | 'error' | 'info', msg: string) => {
            const fmt = `${msg} (time: %ds${
                startAttempts <= 1 ? '' : ', startAttempts: ' + startAttempts.toString()
            }): %s %s`
            if (kind === 'debug') {
                this.log.debug(fmt, timeout.elapsedTime / 1000, getName(), statusesToString())
            } else if (kind === 'error') {
                this.log.error(fmt, timeout.elapsedTime / 1000, getName(), statusesToString())
            } else {
                this.log.info(fmt, timeout.elapsedTime / 1000, getName(), statusesToString())
            }
        }

        const progress = await showMessageWithCancel(
            localize('AWS.CodeCatalyst.devenv.message', 'CodeCatalyst'),
            timeout
        )
        progress.report({ message: localize('AWS.CodeCatalyst.devenv.checking', 'Checking status...') })

        try {
            const devenv = await this.getDevEnvironment(args)
            alias = devenv.alias
            statuses.push({ status: devenv.status, start: Date.now() })
            if (devenv.status === 'RUNNING') {
                doLog('debug', 'devenv RUNNING')
                timeout.cancel()
                // "Debounce" in case caller did not check if the environment was already running.
                return devenv
            }
        } catch {
            // Continue.
        }

        doLog('debug', 'devenv not started, waiting')

        const pollDevEnv = waitUntil(
            async () => {
                if (timeout.completed) {
                    // TODO: need a better way to "cancel" a `waitUntil`.
                    throw new CancellationError('user')
                }

                const LastSeenStatus = statuses[statuses.length - 1]
                const elapsed = Date.now() - LastSeenStatus.start
                const resp = await this.getDevEnvironment(args)
                const serviceReason = (resp.statusReason ?? '').trim()
                alias = resp.alias

                if (
                    startAttempts > 2 &&
                    elapsed > 10000 &&
                    ['STOPPED', 'FAILED'].includes(LastSeenStatus.status) &&
                    ['STOPPED', 'FAILED'].includes(resp.status)
                ) {
                    const fails = statuses.filter((o) => o.status === 'FAILED').length
                    const code = fails === 0 ? 'BadDevEnvState' : 'FailedDevEnv'

                    if (serviceReason !== '') {
                        // Service gave a status reason like "Compute limit exceeded", show it to the user.
                        throw new ToolkitError(failedStartMsg(resp.statusReason), { code: code })
                    }

                    // If still STOPPED/FAILED after 10+ seconds, don't keep retrying for 1 hour...
                    throw new ToolkitError(failedStartMsg(), { code: code })
                } else if (['STOPPED', 'FAILED'].includes(resp.status)) {
                    progress.report({
                        message: localize('AWS.CodeCatalyst.devenv.resuming', 'Resuming Dev Environment...'),
                    })
                    try {
                        startAttempts++
                        await this.startDevEnvironment(args)
                    } catch (e) {
                        const err = e as AWS.AWSError
                        // - ServiceQuotaExceededException: account billing limit reached
                        // - ValidationException: "… creation has failed, cannot start"
                        // - ConflictException: "Cannot start … because update process is still going on"
                        //   (can happen after "Update Dev Environment")
                        if (err.code === 'ServiceQuotaExceededException') {
                            throw new ToolkitError('Dev Environment failed: quota exceeded', {
                                code: 'ServiceQuotaExceeded',
                                cause: err,
                            })
                        }
                        doLog('info', `devenv not started (${err.code}), waiting`)
                        // Continue retrying...
                    }
                } else if (resp.status === 'STOPPING') {
                    progress.report({
                        message: localize('AWS.CodeCatalyst.devenv.stopping', 'Waiting for Dev Environment to stop...'),
                    })
                } else {
                    progress.report({
                        message: localize('AWS.CodeCatalyst.devenv.starting', 'Opening Dev Environment...'),
                    })
                }

                if (LastSeenStatus?.status !== resp.status) {
                    statuses.push({ status: resp.status, start: Date.now() })
                    if (resp.status !== 'RUNNING') {
                        doLog('debug', `devenv not started, waiting`)
                    }
                }
                return resp.status === 'RUNNING' ? resp : undefined
            },
            // note: the `waitUntil` will resolve prior to the real timeout if it is refreshed
            { interval: 1000, timeout: timeout.remainingTime, truthy: true }
        )

        const devenv = await waitTimeout(pollDevEnv, timeout).catch((e) => {
            if (isUserCancelledError(e)) {
                doLog('info', 'devenv failed to start (user cancelled)')
                e.message = failedStartMsg()
                throw e
            } else if (e instanceof ToolkitError) {
                doLog('error', 'devenv failed to start')
                throw e
            }

            doLog('error', 'devenv failed to start')
            throw new ToolkitError(failedStartMsg(), { code: 'Unknown', cause: e })
        })

        if (!devenv) {
            doLog('error', 'devenv failed to start (timeout)')
            throw new ToolkitError(failedStartMsg(), { code: 'Timeout' })
        }
        doLog('info', 'devenv started')

        return devenv
    }
}

/**
 * Returns only the first-party repos from the given
 * list of repository items.
 */
export async function excludeThirdPartyRepos(
    client: CodeCatalystClient,
    spaceName: CodeCatalystOrg['name'],
    projectName: CodeCatalystProject['name'],
    items?: RequiredProps<ListSourceRepositoriesItem, 'name'>[]
): Promise<ListSourceRepositoriesItem[] | undefined> {
    if (items === undefined) {
        return items
    }

    // Filter out 3P repos.
    return (
        await Promise.all(
            items.map(async (item) => {
                return (await isThirdPartyRepo(client, {
                    spaceName,
                    projectName,
                    sourceRepositoryName: item.name,
                }))
                    ? undefined
                    : item
            })
        )
    ).filter(isDefined)
}

/**
 * Determines if a repo is third party (3P) compared to first party (1P).
 *
 * 1P is CodeCatalyst, 3P is something like Github.
 */
export async function isThirdPartyRepo(
    client: CodeCatalystClient,
    codeCatalystRepo: GetSourceRepositoryCloneUrlsRequest
): Promise<boolean> {
    const url = await client.getRepoCloneUrl(codeCatalystRepo)
    // TODO: Make more robust to work with getCodeCatalystConfig().
    return (
        !Uri.parse(url).authority.endsWith('codecatalyst.aws') &&
        !Uri.parse(url).authority.endsWith('caws.dev-tools.aws.dev')
    )
}

// These type guard wrappers are needed because type assertions fail
// to travel up function scope (see: https://github.com/microsoft/TypeScript/issues/9998)

function hasPersistentStorage<T extends DevEnvironmentSummary>(
    s: T
): s is T & { persistentStorage: { sizeInGiB: number } } {
    return hasProps(s, 'persistentStorage') && hasProps(s.persistentStorage, 'sizeInGiB')
}

function hasRepositories<T extends DevEnvironmentSummary>(
    s: T
): s is T & { repositories: RequiredProps<DevEnvironmentRepositorySummary, 'repositoryName'>[] } {
    return hasProps(s, 'repositories') && s.repositories.every((r) => hasProps(r, 'repositoryName'))
}

function hasName<T extends { name: string | undefined }>(s: T): s is RequiredProps<T, 'name'> {
    return hasProps(s, 'name')
}

function isValidEnvSummary(s: DevEnvironmentSummary): s is CodeCatalystDevEnvironmentSummary {
    return hasProps(s, ...requiredDevEnvProps) && hasPersistentStorage(s) && hasRepositories(s)
}
