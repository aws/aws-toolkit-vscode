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
import apiConfig = require('../../../types/REMOVED.api.json')
import globals from '../extensionGlobals'

export const useGraphql = false

export const cawsRegion = 'us-east-1'
export const cawsEndpoint = 'https://public.api-gamma.REMOVED.codes'
export const cawsEndpointGql = 'https://public.api-gamma.REMOVED.codes/graphql'
export const cawsHostname = 'REMOVED.codes' // 'REMOVED.execute-api.us-east-1.amazonaws.cominteg.codedemo.REMOVED'
export const cawsGitHostname = `git.service.${cawsHostname}`
export const cawsHelpUrl = `https://${cawsHostname}/help`

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

export interface CawsOrg extends caws.OrganizationSummary {
    readonly id: string // TODO: why doesn't OrganizationSummary have this already?
}
export interface CawsProject extends caws.ProjectSummary {
    readonly org: CawsOrg
    readonly id: string // TODO: why doesn't ProjectSummary have this already?
}
export interface CawsRepo extends caws.SourceRepositorySummary {
    readonly org: CawsOrg
    readonly project: CawsProject
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
        // const apiKey = this.apiKey
        // req.on('build', function () {
        //     req.httpRequest.headers['x-api-key'] = apiKey
        //     req.httpRequest.headers['cookie'] = authCookie
        // })
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
            if (o?.self && (o.self as any).userName) {
                this.username = (o?.self as any).userName
            } else {
                this.username = o?.self
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
        kind: 'org' | 'project' | 'repo'
    ): AsyncIterableIterator<vscode.QuickPickItem> {
        if (kind === 'org') {
            yield* this.mapToQuickpick(this.listOrgs())
        } else if (kind === 'project') {
            yield* this.mapToQuickpick(this.listProjects(this.user()))
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
                    id: '', // TODO: not provided by CAWS yet.
                    ...org,
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

        // TODO: Add telemetry
    }

    /**
     * Maps CawsFoo objects to `vscode.QuickPickItem` objects.
     */
    public async *mapToQuickpick(
        items: AsyncIterableIterator<CawsRepo> | AsyncIterableIterator<CawsProject> | AsyncIterableIterator<CawsOrg>
    ): AsyncIterableIterator<vscode.QuickPickItem> {
        for await (const o of items) {
            let label: string
            if ((o as CawsRepo).project) {
                label = this.createRepoLabel(o as CawsRepo)
            } else if ((o as CawsProject).org) {
                label = `${(o as CawsProject).org.name} / ${(o as CawsProject).name}`
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
    public async toCawsGitUri(r: CawsRepo): Promise<string> {
        const pat = await this.createAccessToken({ name: this.user(), expires: undefined })
        if (!pat?.secret) {
            throw Error('CODE.AWS: Failed to create personal access token (PAT)')
        }

        return `https://${this.user()}:${pat.secret}@${cawsGitHostname}/v1/${r.org.name}/${r.project.name}/${r.name}`
    }
}
