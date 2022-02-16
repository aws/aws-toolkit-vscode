/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as AWS from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
// TEMPORARY: graphql
import * as gql from 'graphql-request'
import * as gqltypes from 'graphql-request/dist/types'
import * as caws from '../../../types/clientcodeaws'
import * as logger from '../logger/logger'
import { SettingsConfiguration } from '../settingsConfiguration'
import apiConfig = require('../../../types/REMOVED.json')
import globals from '../extensionGlobals'
import { Timeout, waitTimeout, waitUntil } from '../utilities/timeoutUtils'
import { MDE_START_TIMEOUT } from './mdeClient'
import * as nls from 'vscode-nls'
import { showMessageWithCancel } from '../utilities/messages'

const localize = nls.loadMessageBundle()

export const useGraphql = false

export const cawsRegion = 'us-east-1' // Try "us-west-2" for beta/integ/gamma.
export const cawsEndpoint = 'https://public.api-gamma.REMOVED.codes' // gamma web: https://integ.stage.REMOVED.codes/
export const cawsEndpointGql = 'https://public.api-gamma.REMOVED.codes/graphql'
export const cawsHostname = 'REMOVED.codes' // 'REMOVED.execute-api.us-east-1.amazonaws.cominteg.codedemo.REMOVED'
export const cawsGitHostname = `git.service.${cawsHostname}`
export const cawsHelpUrl = `https://${cawsHostname}/help`

/** CAWS-MDE developer environment. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CawsDevEnv extends caws.DevelopmentWorkspaceSummary {
    readonly id: string // Alias of developmentWorkspaceId.
    readonly description?: string
    readonly org: CawsOrg
    readonly project: CawsProject
}
/** CAWS-MDE developer environment session. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CawsDevEnvSession extends caws.StartSessionDevelopmentWorkspaceOutput {}

export interface CawsOrg extends caws.OrganizationSummary {
    readonly id: string // TODO: why doesn't OrganizationSummary have this already?
    readonly name: string
}
export interface CawsProject extends caws.ProjectSummary {
    readonly org: CawsOrg
    readonly id: string // TODO: why doesn't ProjectSummary have this already?
    readonly name: string
}
export interface CawsRepo extends caws.SourceRepositorySummary {
    readonly org: CawsOrg
    readonly project: CawsProject
}

async function createCawsClient(
    authCookie: string | undefined,
    apiKey: string,
    regionCode: string = cawsRegion,
    endpoint: string = cawsEndpoint
): Promise<caws> {
    const c = (await globals.sdkClientBuilder.createAwsService(AWS.Service, {
        // apiConfig is internal and not in the TS declaration file
        apiConfig: apiConfig,
        region: regionCode,
        // credentials: credentials,
        correctClockSkew: true,
        endpoint: endpoint,
    } as ServiceConfigurationOptions)) as caws
    c.setupRequestListeners = r => {
        r.httpRequest.headers['x-api-key'] = apiKey
        // r.httpRequest.headers['cookie'] = authCookie
        if (authCookie) {
            // TODO: remove this after CAWS backend implements full authentication story.
            r.httpRequest.headers['cookie'] = authCookie
        }
    }
    // c.setupRequestListeners()
    return c
}

function createGqlClient(
    apiKey: string,
    authCookie: string = '',
    endpoint: string = cawsEndpointGql
): gql.GraphQLClient {
    const client = new gql.GraphQLClient(endpoint, {
        headers: {
            'x-api-key': apiKey,
            ...(authCookie ? { cookie: authCookie } : {}),
        },
    })
    return client
}

/**
 * Executes a graphql query/mutation and returns the result.
 */
async function gqlRequest<T>(
    gqlClient: gql.GraphQLClient,
    q: string,
    args: gqltypes.Variables
): Promise<T | undefined> {
    try {
        const resp = await gqlClient.rawRequest(q, { input: args })
        const reqId = resp.headers.get('x-request-id')
        logger.getLogger().verbose('graphql response (%d):\n  x-request-id: %s  \n  %O', resp.status, reqId, resp.data)
        if (!resp.data) {
            return undefined
        }
        // There is always one top-level key, we want the child object.
        const r = resp.data[Object.keys(resp.data)[0]]
        return r as T
    } catch (e) {
        const err = e as any
        const reqId = err?.response?.headers?.get ? err.response.headers.get('x-request-id') : undefined
        delete err.request // Redundant, and may contain private info.
        if (err.response) {
            delete err.message // Redundant, and prints unwanted info.
            delete err.response.headers // Noisy.
        }
        logger.getLogger().error('graphql request failed:\n  x-request-id: %s\n  %O', reqId, err.response)
    }
}

export class CawsClient {
    private username: string | undefined
    private readonly log: logger.Logger
    private apiKey: string

    public constructor(
        private settings: SettingsConfiguration,
        private readonly regionCode: string,
        private readonly endpoint: string,
        private sdkClient: caws,
        private gqlClient: gql.GraphQLClient,
        private authCookie?: string
    ) {
        this.log = logger.getLogger()
        this.apiKey = this.settings.readDevSetting('aws.dev.caws.apiKey', 'string', true) ?? ''
    }

    /**
     * Factory to create a new `CawsClient`. Call `onCredentialsChanged()` before making requests.
     */
    public static async create(
        settings: SettingsConfiguration,
        regionCode: string = cawsRegion,
        endpoint: string = cawsEndpoint,
        authCookie?: string
    ): Promise<CawsClient> {
        CawsClient.assertExtInitialized()
        const sdkClient = await createCawsClient(authCookie, 'xxx', regionCode, endpoint)
        const gqlClient = createGqlClient('xxx', authCookie)
        const c = new CawsClient(settings, regionCode, endpoint, sdkClient, gqlClient, authCookie)
        return c
    }

    private static assertExtInitialized() {
        if (!globals.sdkClientBuilder) {
            throw Error('ext.sdkClientBuilder must be initialized first')
        }
    }

    /**
     * Rebuilds/reconnects CAWS clients with new credentials (or undefined to
     * disconnect/logout).
     *
     * @param username   CODE.AWS username, from `verifySession()`.
     * @param authCookie   User secret, undefined means disconnected/logout.
     * @returns
     */
    public async onCredentialsChanged(username: string | undefined, authCookie: string | undefined) {
        CawsClient.assertExtInitialized()
        this.authCookie = authCookie
        this.username = username
        this.sdkClient = await createCawsClient(authCookie, this.apiKey, this.regionCode, this.endpoint)
        this.gqlClient = createGqlClient(this.apiKey, this.authCookie)
    }

    public connected(): boolean {
        return !!(this.authCookie && this.username)
    }

    public user(): string {
        if (!this.username) {
            throw Error('username is not set, call verifySession() first')
        }
        return this.username
    }

    public async call<T>(req: AWS.Request<T, AWS.AWSError>, silent: boolean = false, defaultVal?: T): Promise<T> {
        const log = this.log
        return new Promise<T>((resolve, reject) => {
            req.send(function (e, data) {
                const r = req as any
                if (e) {
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
                    if (silent && defaultVal) {
                        resolve(defaultVal)
                    } else if (silent) {
                        resolve({ length: 0, items: undefined } as unknown as T)
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
     * @param args.name CAWS username. Example: "justinmk"
     * @param args.expires PAT expires on this date, or undefined.
     * @returns PAT secret
     */
    public async createAccessToken(
        args: caws.CreateAccessTokenRequest
    ): Promise<caws.CreateAccessTokenResponse | undefined> {
        if (useGraphql) {
            const o = await gqlRequest<caws.CreateAccessTokenResponse>(
                this.gqlClient,
                `mutation ($input: CreateAccessTokenRequestInput!) {
                    createAccessToken(input: $input) {
                        secret
                        __typename
                    }
                }`,
                args
            )
            return o
        }

        const c = this.sdkClient
        const token = await this.call(c.createAccessToken(args))
        return token
    }

    /**
     * Gets identity properties of the current authenticated principal, and
     * stores the username for use in later calls.
     */
    public async verifySession(): Promise<caws.VerifySessionResponse | undefined> {
        if (!useGraphql) {
            const c = this.sdkClient
            const o = await this.call(c.verifySession())
            if (o?.identity) {
                const person = await this.call(c.getPerson({ id: o.identity }))
                this.username = person.userName
            }
            return o
        }

        const o = await gqlRequest<caws.VerifySessionResponse>(
            this.gqlClient,
            gql.gql`{ verifySession { identity, self { userName }} }`,
            {}
        )
        if (useGraphql && o?.self && (o.self as any).userName) {
            this.username = (o?.self as any).userName
        } else {
            this.username = o?.self
        }
        return o
    }

    /** Gets info about the current user */
    public async getUser(args: caws.GetPersonRequest): Promise<caws.GetPersonResponse | undefined> {
        const o = await gqlRequest<caws.GetPersonResponse>(
            this.gqlClient,
            gql.gql`query ($input: GetPersonRequestInput!) {
                getPerson(input: $input) {
                    displayName
                    userId
                    userName
                    version
                }
            }`,
            args
        )
        return o
    }

    public async *cawsItemsToQuickpickIter(
        kind: 'org' | 'project' | 'repo' | 'env'
    ): AsyncIterableIterator<vscode.QuickPickItem> {
        if (kind === 'org') {
            yield* this.mapToQuickpick(this.listOrgs())
        } else if (kind === 'project') {
            yield* this.mapToQuickpick(this.listProjects(this.user()))
        } else if (kind === 'env') {
            yield* this.mapToQuickpick(this.listDevEnvs(this.user()))
        } else {
            yield* this.mapToQuickpick(this.listRepos(this.user()))
        }
    }

    /**
     * Gets a list of all orgs for the current CAWS user.
     */
    public async *listOrgs(): AsyncIterableIterator<CawsOrg> {
        const c = this.sdkClient
        let orgs: caws.ListOrganizationsOutput | undefined
        const args: caws.ListOrganizationsInput = {}
        if (useGraphql) {
            orgs = await gqlRequest<caws.ListOrganizationsOutput>(
                this.gqlClient,
                `query ($input: ListOrganizationsInput!) {
                    listOrganizations(input: $input) {
                        items {
                            name
                            displayName
                            description
                            region
                        }
                    }
                }`,
                args
            )
        } else {
            orgs = await this.call(c.listOrganizations({}), true)
        }
        if (!orgs || !orgs.items) {
            return
        }
        for (const org of orgs.items) {
            if (org.name) {
                yield {
                    ...org,
                    id: '', // TODO: not provided by CAWS yet.
                    name: org.name,
                }
            }
        }
    }

    /**
     * Gets a list of all projects for the given CAWS user.
     */
    public async *listProjects(userid: string): AsyncIterableIterator<CawsProject> {
        for await (const org of this.listOrgs()) {
            if (!org.name) {
                continue
            }
            let projs: caws.ListProjectsOutput | undefined
            const args: caws.ListProjectsInput = { organizationName: org.name }
            if (useGraphql) {
                projs = await gqlRequest<caws.ListProjectsOutput>(
                    this.gqlClient,
                    `query ($input: ListProjectsInput!) {
                        listProjects(input: $input) {
                            items {
                                name
                                description
                                displayName
                                templateArn
                            }
                        }
                    }`,
                    args
                )
            } else {
                projs = await this.call(this.sdkClient.listProjects(args), true)
            }
            if (!projs) {
                continue
            }

            for (const p of projs.items ?? []) {
                if (p.name) {
                    yield {
                        id: '', // TODO: not provided by CAWS yet.
                        org: org,
                        ...p,
                        name: p.name,
                    }
                }
            }
        }
    }

    /**
     * Gets a flat list of all repos for the given CAWS user.
     */
    public async *listRepos(userid: string): AsyncIterableIterator<CawsRepo> {
        const c = this.sdkClient
        const projs = this.listProjects(userid)
        for await (const p of projs) {
            if (!p.org.name || !p.name) {
                continue
            }
            let repos: caws.ListProjectsOutput | undefined
            const args: caws.ListSourceRepositoriesInput = {
                organizationName: p.org.name,
                projectName: p.name,
            }
            if (useGraphql) {
                repos = await gqlRequest<caws.ListSourceRepositoriesOutput>(
                    this.gqlClient,
                    `query ($input: ListSourceRepositoriesInput!) {
                        listSourceRepositories(input: $input) {
                            items {
                                id
                                name
                                creationDate
                                defaultBranch
                                description
                                lastUpdatedTime
                                projectName
                            }
                        }
                    }`,
                    args
                )
            } else {
                repos = await this.call(c.listSourceRepositories(args), true)
            }

            // TODO: Yield all as one array instead of individuals?
            // Maps 1:1 with API calls
            for (const r of repos?.items ?? []) {
                if (r.name) {
                    yield {
                        org: p.org,
                        project: p,
                        ...r,
                    }
                }
            }
        }
    }

    /** CAWS-MDE */
    public async createDevEnv(args: caws.CreateDevelopmentWorkspaceInput): Promise<CawsDevEnv> {
        if (!args.ideRuntimes || args.ideRuntimes.length === 0) {
            throw Error('missing ideRuntimes')
        }
        const r = await this.call(this.sdkClient.createDevelopmentWorkspace(args))
        const env = await this.getDevEnv({
            developmentWorkspaceId: r.developmentWorkspaceId,
            organizationName: args.organizationName,
            projectName: args.projectName,
        })
        if (!env) {
            throw Error('created environment but failed to get it')
        }

        return {
            ...env,
            id: r.developmentWorkspaceId,
            creatorId: '',
            ide: args.ideRuntimes[0],
            lastUpdatedTime: new Date(),
            repositories: args.repositories,
            // status?: String // TODO: get status
        }
    }

    /** CAWS-MDE */
    public async startDevEnv(
        args: caws.StartDevelopmentWorkspaceInput
    ): Promise<caws.StartDevelopmentWorkspaceOutput | undefined> {
        const r = await this.call(this.sdkClient.startDevelopmentWorkspace(args))
        return r
    }

    /** CAWS-MDE */
    public async startDevEnvSession(
        args: caws.StartSessionDevelopmentWorkspaceInput
    ): Promise<caws.StartSessionDevelopmentWorkspaceOutput | undefined> {
        const r = await this.call(this.sdkClient.startSessionDevelopmentWorkspace(args))
        return r
    }

    /** CAWS-MDE: does not have this operation (yet?) */
    public async stopDevEnv(): Promise<void> {
        throw Error('CAWS-MDE does not have stopEnvironment currently')
    }

    /** CAWS-MDE */
    public async getDevEnv(args: caws.GetDevelopmentWorkspaceInput): Promise<CawsDevEnv | undefined> {
        const a = { ...args }
        delete (a as any).ideRuntimes
        delete (a as any).repositories
        const r = await this.call(this.sdkClient.getDevelopmentWorkspace(a))
        const desc = r.labels?.join(', ')

        const p = await this.call(
            this.sdkClient.getProject({
                name: args.projectName,
                organizationName: args.organizationName,
            })
        )
        const o = await this.call(
            this.sdkClient.getOrganization({
                name: args.organizationName,
            })
        )
        if (!o.name) {
            this.log.error('getDevEnv: missing fields on org: %O', o)
            throw Error('org response is missing fields')
        }
        if (!p.name) {
            this.log.error('getDevEnv: missing fields on project: %O', p)
            throw Error('project response is missing fields')
        }
        const org = {
            id: o.id ?? '',
            ...o,
            name: o.name,
        }
        const proj = {
            id: p.id ?? '',
            ...p,
            name: p.name,
            org: org,
        }

        return {
            id: a.developmentWorkspaceId,
            developmentWorkspaceId: a.developmentWorkspaceId,
            description: desc,
            ...r,
            org: org,
            project: proj,
        }
    }

    /** CAWS-MDE */
    public async deleteDevEnv(
        args: caws.DeleteDevelopmentWorkspaceInput
    ): Promise<caws.DeleteDevelopmentWorkspaceOutput | undefined> {
        const r = await this.call(this.sdkClient.deleteDevelopmentWorkspace(args))
        return r
    }

    /**
     * CAWS-MDE
     * Gets a flat list of all workspaces for the given CAWS user.
     */
    public async *listDevEnvs(userid: string): AsyncIterableIterator<CawsDevEnv> {
        const c = this.sdkClient
        const projs = this.listProjects(userid)
        for await (const p of projs) {
            if (!p.org.name || !p.name) {
                continue
            }
            const args: caws.ListDevelopmentWorkspaceInput = {
                organizationName: p.org.name,
                projectName: p.name,
            }
            const envs = await this.call(c.listDevelopmentWorkspace(args), true)

            for (const r of envs?.items ?? []) {
                if (r.developmentWorkspaceId) {
                    const desc = r.labels?.join(', ')
                    yield {
                        id: r.developmentWorkspaceId,
                        description: desc,
                        org: p.org,
                        project: p,
                        ...r,
                    }
                }
            }
        }
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
        args: caws.StartDevelopmentWorkspaceInput,
        status: string,
        timeout: Timeout = new Timeout(MDE_START_TIMEOUT)
    ): Promise<CawsDevEnv | undefined> {
        // 'debounce' in case caller did not check if the environment was already running
        if (status === 'RUNNING') {
            const resp = await this.getDevEnv(args)
            if (resp && resp.status === 'RUNNING') {
                return resp
            }
        }

        const progress = await showMessageWithCancel(localize('AWS.caws.startMde.message', 'CODE.AWS'), timeout)
        progress.report({ message: localize('AWS.caws.startMde.checking', 'checking status...') })

        const pollMde = waitUntil(
            async () => {
                // technically this will continue to be called until it reaches its own timeout, need a better way to 'cancel' a `waitUntil`
                if (timeout.completed) {
                    return
                }

                const resp = await this.getDevEnv(args)

                if (resp?.status === 'STOPPED') {
                    progress.report({ message: localize('AWS.caws.startMde.stopStart', 'resuming environment...') })
                    await this.startDevEnv(args)
                } else if (resp?.status === 'STOPPING') {
                    progress.report({
                        message: localize('AWS.caws.startMde.resuming', 'waiting for environment to stop...'),
                    })
                } else {
                    progress.report({
                        message: localize('AWS.caws.startMde.starting', 'waiting for environment...'),
                    })
                }

                return resp?.status === 'RUNNING' ? resp : undefined
            },
            // note: the `waitUntil` will resolve prior to the real timeout if it is refreshed
            { interval: 5000, timeout: timeout.remainingTime, truthy: true }
        )

        return waitTimeout(pollMde, timeout, {
            onExpire: () => (
                vscode.window.showErrorMessage(
                    localize(
                        'AWS.caws.startFailed',
                        'Timeout waiting for MDE environment: {0}',
                        args.developmentWorkspaceId
                    )
                ),
                undefined
            ),
            onCancel: () => undefined,
        })
    }

    /**
     * Maps CawsFoo objects to `vscode.QuickPickItem` objects.
     */
    public async *mapToQuickpick(
        items:
            | AsyncIterableIterator<CawsRepo>
            | AsyncIterableIterator<CawsProject>
            | AsyncIterableIterator<CawsOrg>
            | AsyncIterableIterator<CawsDevEnv>
    ): AsyncIterableIterator<vscode.QuickPickItem> {
        for await (const o of items) {
            let label: string
            if ((o as CawsRepo).project) {
                label = this.createRepoLabel(o as CawsRepo)
            } else if ((o as CawsProject).org) {
                label = `${(o as CawsProject).org.name} / ${(o as CawsProject).name}`
            } else if ((o as CawsDevEnv).developmentWorkspaceId) {
                label = `TODO: <org> / <project>`
            } else {
                label = `${(o as CawsOrg).name}`
            }

            yield {
                label: label,
                detail: o.description,
                description: o.id,
                // Extra state
                val: o,
            } as vscode.QuickPickItem
        }
    }

    public createRepoLabel(r: CawsRepo): string {
        return `${r.org.name} / ${r.project.name} / ${r.name}`
    }

    /**
     * Builds a web URL from the given CAWS object.
     */
    public toCawsUrl(o: CawsOrg | CawsProject | CawsRepo) {
        const prefix = `https://${cawsHostname}/organizations`
        let url: string
        if ((o as CawsRepo).project) {
            const r = o as CawsRepo
            url = `${prefix}/${r.org.name}/projects/${r.project.name}/source-repositories/${r.name}/view`
        } else if ((o as CawsProject).org) {
            const p = o as CawsProject
            url = `${prefix}/${p.org.name}/projects/${p.name}/view`
        } else {
            url = `${prefix}/${o.name}/view`
        }
        return url
    }

    public openCawsUrl(o: CawsOrg | CawsProject | CawsRepo) {
        const url = this.toCawsUrl(o)
        vscode.env.openExternal(vscode.Uri.parse(url))
    }

    /**
     * Creates a link for `git clone` usage
     * @param r CAWS repo
     */
    public async toCawsGitUri(org: string, project: string, repo: string): Promise<string> {
        const pat = await this.createAccessToken({ name: this.user(), expires: undefined })
        if (!pat?.secret) {
            throw Error('CODE.AWS: Failed to create personal access token (PAT)')
        }

        return `https://${this.user()}:${pat.secret}@${cawsGitHostname}/v1/${org}/${project}/${repo}`
    }
}
