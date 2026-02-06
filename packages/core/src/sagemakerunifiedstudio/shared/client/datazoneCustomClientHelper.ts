/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../../shared/logger/logger'
import {
    DataZone,
    DataZoneClientConfig,
    ListDomainsCommand,
    GetDomainCommand,
    SearchGroupProfilesCommand,
    SearchUserProfilesCommand,
    DomainSummary,
    DomainStatus,
    GetDomainOutput,
    GroupProfileSummary,
    UserProfileSummary,
    GroupSearchType,
    UserSearchType,
} from '@amzn/datazone-custom-client'
import { CredentialsProvider } from '../../../auth/providers/credentials'
import { ToolkitError } from '../../../shared/errors'
import { SmusUtils, isIamDomain } from '../smusUtils'
import { DevSettings } from '../../../shared/settings'

import { SmusErrorCodes } from '../smusUtils'

/**
 * Error codes for DataZone operations
 * @deprecated Use SmusErrorCodes instead
 */
export const DataZoneErrorCode = {
    NoGroupProfileFound: SmusErrorCodes.NoGroupProfileFound,
    NoUserProfileFound: SmusErrorCodes.NoUserProfileFound,
} as const

/**
 * Helper client for interacting with AWS DataZone Custom API
 */
export class DataZoneCustomClientHelper {
    private datazoneCustomClient: DataZone | undefined
    private static instances = new Map<string, DataZoneCustomClientHelper>()
    private readonly logger = getLogger('smus')

    private constructor(
        private readonly credentialProvider: CredentialsProvider,
        private readonly region: string
    ) {}

    /**
     * Gets a singleton instance of the DataZoneCustomClientHelper
     * @returns DataZoneCustomClientHelper instance
     */
    public static getInstance(credentialProvider: CredentialsProvider, region: string): DataZoneCustomClientHelper {
        const logger = getLogger('smus')

        const instanceKey = `${region}`

        // Check if we already have an instance for this instanceKey
        if (DataZoneCustomClientHelper.instances.has(instanceKey)) {
            const existingInstance = DataZoneCustomClientHelper.instances.get(instanceKey)!
            logger.debug(`DataZoneCustomClientHelper: Using existing instance for instanceKey ${instanceKey}`)
            return existingInstance
        }

        // Create new instance
        logger.debug('DataZoneCustomClientHelper: Creating new instance')
        const instance = new DataZoneCustomClientHelper(credentialProvider, region)
        DataZoneCustomClientHelper.instances.set(instanceKey, instance)

        logger.debug(`DataZoneCustomClientHelper: Created instance with instanceKey ${instanceKey}`)

        return instance
    }

    /**
     * Disposes all instances and cleans up resources
     */
    public static dispose(): void {
        const logger = getLogger('smus')
        logger.debug('DataZoneCustomClientHelper: Disposing all instances')

        for (const [key, instance] of DataZoneCustomClientHelper.instances.entries()) {
            instance.datazoneCustomClient = undefined
            logger.debug(`DataZoneCustomClientHelper: Disposed instance for: ${key}`)
        }

        DataZoneCustomClientHelper.instances.clear()
    }

    /**
     * Gets the AWS region
     * @returns AWS region
     */
    public getRegion(): string {
        return this.region
    }

    /**
     * Gets the DataZone client, initializing it if necessary
     */
    private async getDataZoneCustomClient(): Promise<DataZone> {
        if (!this.datazoneCustomClient) {
            try {
                this.logger.info('DataZoneCustomClientHelper: Creating authenticated DataZone client')

                // Create credential provider function for auto-refresh
                const awsCredentialProvider = async () => {
                    const credentials = await this.credentialProvider.getCredentials()
                    return {
                        accessKeyId: credentials.accessKeyId,
                        secretAccessKey: credentials.secretAccessKey,
                        sessionToken: credentials.sessionToken,
                        expiration: credentials.expiration,
                    }
                }

                // Use user setting for endpoint if provided, otherwise use default api.aws endpoint
                // Note: The SDK v3 ruleset incorrectly uses amazonaws.com suffix, but DataZone uses api.aws
                const devSettings = DevSettings.instance
                const customEndpoint = devSettings.get('endpoints', {})['datazone']
                const endpoint = customEndpoint || `https://datazone.${this.region}.api.aws`
                this.logger.info(
                    `DataZoneCustomClientHelper: Using DataZone endpoint: ${endpoint}${customEndpoint ? ' (custom)' : ' (default)'}`
                )

                const clientConfig: DataZoneClientConfig = {
                    region: this.region,
                    credentials: awsCredentialProvider,
                    endpoint: endpoint,
                }

                this.datazoneCustomClient = new DataZone(clientConfig)

                this.logger.info('DataZoneCustomClientHelper: Successfully created authenticated DataZone client')
            } catch (err) {
                this.logger.error('DataZoneCustomClientHelper: Failed to create DataZone client: %s', err as Error)
                throw err
            }
        }
        return this.datazoneCustomClient
    }

    /**
     * Lists domains in DataZone with pagination support
     * @param options Options for listing domains
     * @returns Paginated list of DataZone domains with nextToken
     */
    public async listDomains(options?: {
        maxResults?: number
        status?: string
        nextToken?: string
    }): Promise<{ domains: DomainSummary[]; nextToken?: string }> {
        try {
            this.logger.info(`DataZoneCustomClientHelper: Listing domains in region ${this.region}`)

            const datazoneCustomClient = await this.getDataZoneCustomClient()

            // Call DataZone API to list domains with pagination
            const command = new ListDomainsCommand({
                maxResults: options?.maxResults,
                status: options?.status as DomainStatus,
                nextToken: options?.nextToken,
            })
            const response = await datazoneCustomClient.send(command)

            const domains = response.items || []

            if (domains.length === 0) {
                this.logger.info(`DataZoneCustomClientHelper: No domains found`)
            } else {
                this.logger.debug(`DataZoneCustomClientHelper: Found ${domains.length} domains`)
            }

            return { domains, nextToken: response.nextToken }
        } catch (err) {
            this.logger.error('DataZoneCustomClientHelper: Failed to list domains: %s', (err as Error).message)
            throw err
        }
    }

    /**
     * Fetches all domains by handling pagination automatically
     * @param options Options for listing domains (excluding nextToken which is handled internally)
     * @returns Promise resolving to an array of all DataZone domains
     */
    public async fetchAllDomains(options?: { status?: string }): Promise<DomainSummary[]> {
        try {
            let allDomains: DomainSummary[] = []
            let nextToken: string | undefined
            do {
                const maxResultsPerPage = 25
                const response = await this.listDomains({
                    ...options,
                    nextToken,
                    maxResults: maxResultsPerPage,
                })
                allDomains = [...allDomains, ...response.domains]
                nextToken = response.nextToken
            } while (nextToken)

            this.logger.debug(`DataZoneCustomClientHelper: Fetched a total of ${allDomains.length} domains`)
            return allDomains
        } catch (err) {
            this.logger.error('DataZoneCustomClientHelper: Failed to fetch all domains: %s', (err as Error).message)
            throw err
        }
    }

    /**
     * Gets the domain with IAM authentication mode using pagination with early termination
     * @returns Promise resolving to the DataZone domain or undefined if not found
     */
    public async getIamDomain(): Promise<DomainSummary | undefined> {
        const logger = getLogger('smus')

        try {
            logger.info('DataZoneCustomClientHelper: Getting the domain info')

            let nextToken: string | undefined
            let totalDomainsChecked = 0
            const maxResultsPerPage = 25

            // Paginate through domains and check each page for IAM domain
            do {
                const response = await this.listDomains({
                    status: 'AVAILABLE',
                    nextToken,
                    maxResults: maxResultsPerPage,
                })

                const { domains } = response
                totalDomainsChecked += domains.length

                logger.debug(
                    `DataZoneCustomClientHelper: Checking ${domains.length} domains in current page (total checked: ${totalDomainsChecked})`
                )

                // Check each domain in the current page for IAM domain
                for (const domain of domains) {
                    // Log the complete domain object for debugging
                    logger.debug(`DataZoneCustomClientHelper: Domain ${domain.id} full response: %O`, domain)

                    const isIam = isIamDomain({
                        domainVersion: domain.domainVersion,
                        iamSignIns: domain.iamSignIns,
                        domainId: domain.id,
                    })

                    if (isIam) {
                        logger.info(`DataZoneCustomClientHelper: Found IAM domain, id: ${domain.id} (${domain.name})`)
                        return domain
                    }
                }

                nextToken = response.nextToken
            } while (nextToken)

            logger.info(
                `DataZoneCustomClientHelper: No IAM domain found after checking all ${totalDomainsChecked} domains`
            )
            return undefined
        } catch (err) {
            logger.error('DataZoneCustomClientHelper: Failed to get domain info: %s', err as Error)
            throw new Error(`Failed to get domain info: ${(err as Error).message}`)
        }
    }

    /**
     * Gets a specific domain by its ID
     * @param domainId The ID of the domain to retrieve
     * @returns Promise resolving to the GetDomainOutput
     */
    public async getDomain(domainId: string): Promise<GetDomainOutput> {
        try {
            this.logger.debug(`DataZoneCustomClientHelper: Getting domain with ID: ${domainId}`)

            const datazoneCustomClient = await this.getDataZoneCustomClient()

            const command = new GetDomainCommand({
                identifier: domainId,
            })
            const response = await datazoneCustomClient.send(command)

            this.logger.debug(`DataZoneCustomClientHelper: Successfully retrieved domain: ${domainId}`)
            return response
        } catch (err) {
            this.logger.error('DataZoneCustomClientHelper: Failed to get domain: %s', (err as Error).message)
            throw err
        }
    }

    /**
     * Searches for group profiles in the DataZone domain
     * @param domainIdentifier The domain identifier to search in
     * @param options Options for searching group profiles
     * @returns Promise resolving to group profile search results with pagination
     */
    public async searchGroupProfiles(
        domainIdentifier: string,
        options?: {
            groupType?: string
            searchText?: string
            maxResults?: number
            nextToken?: string
        }
    ): Promise<{ items: GroupProfileSummary[]; nextToken?: string }> {
        try {
            this.logger.debug(
                `DataZoneCustomClientHelper: Searching group profiles in domain ${domainIdentifier} with groupType: ${options?.groupType}, searchText: ${options?.searchText}`
            )

            const datazoneCustomClient = await this.getDataZoneCustomClient()

            // Call DataZone API to search group profiles
            const command = new SearchGroupProfilesCommand({
                domainIdentifier,
                groupType: options?.groupType as GroupSearchType,
                searchText: options?.searchText,
                maxResults: options?.maxResults,
                nextToken: options?.nextToken,
            })
            const response = await datazoneCustomClient.send(command)

            const items = response.items || []

            if (items.length === 0) {
                this.logger.debug(`DataZoneCustomClientHelper: No group profiles found`)
            } else {
                this.logger.debug(`DataZoneCustomClientHelper: Found ${items.length} group profiles`)
            }

            return { items, nextToken: response.nextToken }
        } catch (err) {
            this.logger.error('DataZoneCustomClientHelper: Failed to search group profiles: %s', (err as Error).message)
            throw err
        }
    }

    /**
     * Searches for user profiles in the DataZone domain
     * @param domainIdentifier The domain identifier to search in
     * @param options Options for searching user profiles
     * @returns Promise resolving to user profile search results with pagination
     */
    public async searchUserProfiles(
        domainIdentifier: string,
        options: {
            userType: string
            searchText?: string
            maxResults?: number
            nextToken?: string
        }
    ): Promise<{ items: UserProfileSummary[]; nextToken?: string }> {
        try {
            this.logger.debug(
                `DataZoneCustomClientHelper: Searching user profiles in domain ${domainIdentifier} with userType: ${options.userType}, searchText: ${options.searchText}`
            )

            const datazoneCustomClient = await this.getDataZoneCustomClient()

            // Call DataZone API to search user profiles
            const command = new SearchUserProfilesCommand({
                domainIdentifier,
                userType: options.userType as UserSearchType,
                searchText: options.searchText,
                maxResults: options.maxResults,
                nextToken: options.nextToken,
            })
            const response = await datazoneCustomClient.send(command)

            const items = response.items || []

            if (items.length === 0) {
                this.logger.debug(`DataZoneCustomClientHelper: No user profiles found`)
            } else {
                this.logger.debug(`DataZoneCustomClientHelper: Found ${items.length} user profiles`)
            }

            return { items, nextToken: response.nextToken }
        } catch (err) {
            this.logger.error('DataZoneCustomClientHelper: Failed to search user profiles: %s', (err as Error).message)
            throw err
        }
    }

    /**
     * Gets the group profile ID for a given IAM role ARN
     * @param domainIdentifier The domain identifier to search in
     * @param roleArn The base IAM role ARN (format: arn:aws:iam::ACCOUNT:role/ROLE_NAME)
     * @returns Promise resolving to the group profile ID
     * @throws ToolkitError with appropriate error code
     */
    public async getGroupProfileId(domainIdentifier: string, roleArn: string): Promise<string> {
        try {
            this.logger.debug(
                `DataZoneCustomClientHelper: Getting group profile ID for role ARN: ${roleArn} in domain ${domainIdentifier}`
            )

            // Use searchText to filter server-side for better performance
            const response = await this.searchGroupProfiles(domainIdentifier, {
                groupType: 'IAM_ROLE_SESSION_GROUP',
                searchText: roleArn,
                maxResults: 50,
            })

            this.logger.debug(
                `DataZoneCustomClientHelper: Received ${response.items.length} group profiles from search`
            )

            // Find exact match in filtered results
            for (const profile of response.items) {
                this.logger.debug(
                    `DataZoneCustomClientHelper: Checking group profile - ID: ${profile.id}, rolePrincipalArn: ${profile.rolePrincipalArn}, status: ${profile.status}`
                )

                if (profile.rolePrincipalArn === roleArn) {
                    this.logger.info(`DataZoneCustomClientHelper: Found matching group profile with ID: ${profile.id}`)
                    return profile.id!
                }
            }

            // No matching profile found
            this.logger.error(`DataZoneCustomClientHelper: No group profile found for IAM role: ${roleArn}`)
            throw new ToolkitError(`No group profile found for IAM role: ${roleArn}`, {
                code: SmusErrorCodes.NoGroupProfileFound,
            })
        } catch (err) {
            // Re-throw if it's already a ToolkitError
            if (err instanceof ToolkitError) {
                throw err
            }

            // Log and wrap other errors
            this.logger.error('DataZoneCustomClientHelper: Failed to get group profile ID: %s', (err as Error).message)
            throw ToolkitError.chain(err, 'Failed to get group profile ID')
        }
    }

    /**
     * Gets the user profile ID for a given IAM role session
     * @param domainIdentifier The domain identifier to search in
     * @param roleArnWithSession The assumed role ARN with session name (format: arn:aws:sts::ACCOUNT:assumed-role/ROLE_NAME/SESSION_NAME)
     * @returns Promise resolving to the user profile ID
     * @throws ToolkitError with appropriate error code
     */
    public async getUserProfileIdForSession(domainIdentifier: string, roleArnWithSession: string): Promise<string> {
        try {
            this.logger.debug(
                `DataZoneCustomClientHelper: Getting user profile ID for role ARN with session: ${roleArnWithSession} in domain ${domainIdentifier}`
            )

            // Extract session name from the assumed role ARN
            // Format: arn:aws:sts::ACCOUNT:assumed-role/ROLE_NAME/SESSION_NAME
            const sessionName = SmusUtils.extractSessionNameFromArn(roleArnWithSession)
            if (!sessionName) {
                throw new ToolkitError(`Unable to extract session name from ARN: ${roleArnWithSession}`, {
                    code: SmusErrorCodes.NoUserProfileFound,
                })
            }

            // Convert assumed role ARN to IAM role ARN for matching
            // Format: arn:aws:sts::ACCOUNT:assumed-role/ROLE_NAME/SESSION_NAME -> arn:aws:iam::ACCOUNT:role/ROLE_NAME
            const iamRoleArn = SmusUtils.convertAssumedRoleArnToIamRoleArn(roleArnWithSession)
            if (!iamRoleArn) {
                throw new ToolkitError(`Unable to convert assumed role ARN to IAM role ARN: ${roleArnWithSession}`, {
                    code: SmusErrorCodes.NoUserProfileFound,
                })
            }

            this.logger.debug(
                `DataZoneCustomClientHelper: Extracted session name: ${sessionName}, IAM role ARN: ${iamRoleArn}`
            )

            // Use searchText to filter by role ARN on server side, then filter by session name on client side
            let nextToken: string | undefined
            let totalProfilesChecked = 0

            do {
                this.logger.debug(
                    `DataZoneCustomClientHelper: Calling searchUserProfiles with searchText: ${iamRoleArn}`
                )

                const response = await this.searchUserProfiles(domainIdentifier, {
                    userType: 'DATAZONE_IAM_USER',
                    searchText: iamRoleArn, // Server-side filter by role ARN
                    maxResults: 50,
                    nextToken,
                })

                totalProfilesChecked += response.items.length
                this.logger.debug(
                    `DataZoneCustomClientHelper: Received ${response.items.length} user profiles matching role ARN in current page (total checked: ${totalProfilesChecked})`
                )

                // Find exact match in current page using client-side filtering for session name
                // Server-side filtering by role ARN should have already reduced the result set significantly
                for (const profile of response.items) {
                    // Match based on session name (role ARN already filtered by searchText)
                    // principalId format: PRINCIPAL_ID:SESSION_NAME
                    const matchesSession = profile.details?.iam?.principalId?.includes(sessionName)

                    if (matchesSession) {
                        this.logger.info(
                            `DataZoneCustomClientHelper: Found matching user profile with ID: ${profile.id} (role: ${iamRoleArn}, session: ${sessionName}) after checking ${totalProfilesChecked} profiles`
                        )
                        return profile.id!
                    }
                }

                nextToken = response.nextToken
            } while (nextToken)

            // No matching profile found after checking all pages
            this.logger.error(
                `DataZoneCustomClientHelper: No user profile found for role: ${iamRoleArn} with session: ${sessionName} after checking ${totalProfilesChecked} profiles`
            )
            throw new ToolkitError(`No user profile found for role: ${iamRoleArn} with session: ${sessionName}`, {
                code: SmusErrorCodes.NoUserProfileFound,
            })
        } catch (err) {
            // Re-throw if it's already a ToolkitError
            if (err instanceof ToolkitError) {
                throw err
            }

            // Log and wrap other errors
            this.logger.error('DataZoneCustomClientHelper: Failed to get user profile ID: %s', (err as Error).message)
            throw ToolkitError.chain(err, 'Failed to get user profile ID')
        }
    }
}
