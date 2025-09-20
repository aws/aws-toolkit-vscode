/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger/logger'
import { ToolkitError } from '../../shared/errors'
import { isSageMaker } from '../../shared/extensionUtilities'
import { getResourceMetadata } from './utils/resourceMetadataUtils'
import fetch from 'node-fetch'

/**
 * Represents SSO instance information retrieved from DataZone
 */
export interface SsoInstanceInfo {
    issuerUrl: string
    ssoInstanceId: string
    clientId: string
    region: string
}

/**
 * Response from DataZone /sso/login endpoint
 */
interface DataZoneSsoLoginResponse {
    redirectUrl: string
}

/**
 * Credential expiry time constants for SMUS providers (in milliseconds)
 */
export const SmusCredentialExpiry = {
    /** Domain Execution Role (DER) credentials expiry time: 10 minutes */
    derExpiryMs: 10 * 60 * 1000,
    /** Project Role credentials expiry time: 10 minutes */
    projectExpiryMs: 10 * 60 * 1000,
    /** Connection credentials expiry time: 10 minutes */
    connectionExpiryMs: 10 * 60 * 1000,
} as const

/**
 * Error codes for SMUS-related operations
 */
export const SmusErrorCodes = {
    /** Error code for when no active SMUS connection is available */
    NoActiveConnection: 'NoActiveConnection',
    /** Error code for when API calls timeout */
    ApiTimeout: 'ApiTimeout',
    /** Error code for when SMUS login fails */
    SmusLoginFailed: 'SmusLoginFailed',
    /** Error code for when redeeming access token fails */
    RedeemAccessTokenFailed: 'RedeemAccessTokenFailed',
    /** Error code for when connection establish fails */
    FailedAuthConnecton: 'FailedAuthConnecton',
    /** Error code for when user cancels an operation */
    UserCancelled: 'UserCancelled',
    /** Error code for when domain account Id is missing */
    AccountIdNotFound: 'AccountIdNotFound',
    /** Error code for when resource ARN is missing */
    ResourceArnNotFound: 'ResourceArnNotFound',
    /** Error code for when fails to get domain account Id */
    GetDomainAccountIdFailed: 'GetDomainAccountIdFailed',
    /** Error code for when fails to get project account Id */
    GetProjectAccountIdFailed: 'GetProjectAccountIdFailed',
    /** Error code for when region is missing */
    RegionNotFound: 'RegionNotFound',
} as const

/**
 * Timeout constants for SMUS API calls (in milliseconds)
 */
export const SmusTimeouts = {
    /** Default timeout for API calls: 10 seconds */
    apiCallTimeoutMs: 10 * 1000,
} as const

/**
 * Interface for AWS credential objects that need validation
 */
interface CredentialObject {
    accessKeyId?: unknown
    secretAccessKey?: unknown
    sessionToken?: unknown
    expiration?: unknown
}

/**
 * Validates AWS credential fields and throws appropriate errors if invalid
 * @param credentials The credential object to validate
 * @param errorCode The error code to use in ToolkitError
 * @param contextMessage The context message for error messages (e.g., "API response", "project credential response")
 * @throws ToolkitError if any credential field is invalid
 */
export function validateCredentialFields(
    credentials: CredentialObject,
    errorCode: string,
    contextMessage: string,
    validateExpireTime: boolean = false
): void {
    if (!credentials.accessKeyId || typeof credentials.accessKeyId !== 'string') {
        throw new ToolkitError(`Invalid accessKeyId in ${contextMessage}: ${typeof credentials.accessKeyId}`, {
            code: errorCode,
        })
    }
    if (!credentials.secretAccessKey || typeof credentials.secretAccessKey !== 'string') {
        throw new ToolkitError(`Invalid secretAccessKey in ${contextMessage}: ${typeof credentials.secretAccessKey}`, {
            code: errorCode,
        })
    }
    if (!credentials.sessionToken || typeof credentials.sessionToken !== 'string') {
        throw new ToolkitError(`Invalid sessionToken in ${contextMessage}: ${typeof credentials.sessionToken}`, {
            code: errorCode,
        })
    }
    if (validateExpireTime) {
        if (!credentials.expiration || !(credentials.expiration instanceof Date)) {
            throw new ToolkitError(`Invalid expireTime in ${contextMessage}: ${typeof credentials.expiration}`, {
                code: errorCode,
            })
        }
    }
}

/**
 * Utility class for SageMaker Unified Studio domain URL parsing and validation
 */
export class SmusUtils {
    private static readonly logger = getLogger()

    /**
     * Extracts the domain ID from a SageMaker Unified Studio domain URL
     * @param domainUrl The SageMaker Unified Studio domain URL
     * @returns The extracted domain ID or undefined if not found
     */
    public static extractDomainIdFromUrl(domainUrl: string): string | undefined {
        try {
            // Domain URL format: https://dzd_d3hr1nfjbtwui1.sagemaker.us-east-2.on.aws
            const url = new URL(domainUrl)
            const hostname = url.hostname

            // Extract domain ID from hostname (dzd_d3hr1nfjbtwui1 or dzd-d3hr1nfjbtwui1)
            const domainIdMatch = hostname.match(/^(dzd[-_][a-zA-Z0-9_-]{1,36})\./)
            return domainIdMatch?.[1]
        } catch (error) {
            this.logger.error('Failed to extract domain ID from URL: %s', error as Error)
            return undefined
        }
    }

    /**
     * Extracts the AWS region from a SageMaker Unified Studio domain URL
     * @param domainUrl The SageMaker Unified Studio domain URL
     * @param fallbackRegion Fallback region if extraction fails (default: 'us-east-1')
     * @returns The extracted AWS region or the fallback region if not found
     */
    public static extractRegionFromUrl(domainUrl: string, fallbackRegion: string = 'us-east-1'): string {
        try {
            // Domain URL formats:
            // - https://dzd_d3hr1nfjbtwui1.sagemaker.us-east-2.on.aws
            // - https://dzd_4gickdfsxtoxg0.sagemaker-gamma.us-west-2.on.aws
            const url = new URL(domainUrl)
            const hostname = url.hostname

            // Extract region from hostname, handling both prod and non-prod stages
            // Pattern matches: .sagemaker[-stage].{region}.on.aws
            const regionMatch = hostname.match(/\.sagemaker(?:-[a-z]+)?\.([a-z0-9-]+)\.on\.aws$/)
            return regionMatch?.[1] || fallbackRegion
        } catch (error) {
            this.logger.error('Failed to extract region from URL: %s', error as Error)
            return fallbackRegion
        }
    }

    /**
     * Extracts both domain ID and region from a SageMaker Unified Studio domain URL
     * @param domainUrl The SageMaker Unified Studio domain URL
     * @param fallbackRegion Fallback region if extraction fails (default: 'us-east-1')
     * @returns Object containing domainId and region
     */
    public static extractDomainInfoFromUrl(
        domainUrl: string,
        fallbackRegion: string = 'us-east-1'
    ): { domainId: string | undefined; region: string } {
        return {
            domainId: this.extractDomainIdFromUrl(domainUrl),
            region: this.extractRegionFromUrl(domainUrl, fallbackRegion),
        }
    }

    /**
     * Validates the domain URL format for SageMaker Unified Studio
     * @param value The URL to validate
     * @returns Error message if invalid, undefined if valid
     */
    public static validateDomainUrl(value: string): string | undefined {
        if (!value || value.trim() === '') {
            return 'Domain URL is required'
        }

        const trimmedValue = value.trim()

        // Check HTTPS requirement
        if (!trimmedValue.startsWith('https://')) {
            return 'Domain URL must use HTTPS (https://)'
        }

        // Check basic URL format
        try {
            const url = new URL(trimmedValue)

            // Check if it looks like a SageMaker Unified Studio domain
            if (!url.hostname.includes('sagemaker') || !url.hostname.includes('on.aws')) {
                return 'URL must be a valid SageMaker Unified Studio domain (e.g., https://dzd_xxxxxxxxx.sagemaker.us-east-1.on.aws)'
            }

            // Extract domain ID to validate
            const domainId = this.extractDomainIdFromUrl(trimmedValue)

            if (!domainId) {
                return 'URL must contain a valid domain ID (starting with dzd- or dzd_)'
            }

            return undefined // Valid
        } catch (err) {
            return 'Invalid URL format'
        }
    }

    /**
     * Makes HTTP call to DataZone /sso/login endpoint
     * @param domainUrl The SageMaker Unified Studio domain URL
     * @param domainId The extracted domain ID
     * @returns Promise resolving to the login response
     * @throws ToolkitError if the API call fails
     */
    private static async callDataZoneLogin(domainUrl: string, domainId: string): Promise<DataZoneSsoLoginResponse> {
        const loginUrl = new URL('/sso/login', domainUrl)
        const requestBody = {
            domainId: domainId,
        }

        try {
            const response = await fetch(loginUrl.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'User-Agent': 'aws-toolkit-vscode',
                },
                body: JSON.stringify(requestBody),
                timeout: SmusTimeouts.apiCallTimeoutMs,
            })

            if (!response.ok) {
                throw new ToolkitError(`SMUS login failed: ${response.status} ${response.statusText}`, {
                    code: SmusErrorCodes.SmusLoginFailed,
                })
            }

            return (await response.json()) as DataZoneSsoLoginResponse
        } catch (error) {
            // Handle timeout errors specifically
            if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout'))) {
                throw new ToolkitError(
                    `DataZone login request timed out after ${SmusTimeouts.apiCallTimeoutMs / 1000} seconds`,
                    {
                        code: SmusErrorCodes.ApiTimeout,
                        cause: error,
                    }
                )
            }
            // Re-throw other errors as-is
            throw error
        }
    }

    /**
     * Gets SSO instance information by calling DataZone /sso/login endpoint
     * This extracts the proper SSO instance ID and issuer URL needed for OAuth client registration
     *
     * @param domainUrl The SageMaker Unified Studio domain URL
     * @returns Promise resolving to SSO instance information
     * @throws ToolkitError if the API call fails or response is invalid
     */
    public static async getSsoInstanceInfo(domainUrl: string): Promise<SsoInstanceInfo> {
        try {
            this.logger.info(`SMUS Auth: Getting SSO instance info from DataZone for domainurl: ${domainUrl}`)

            // Extract domain ID from the domain URL
            const domainId = this.extractDomainIdFromUrl(domainUrl)
            if (!domainId) {
                throw new ToolkitError('Invalid domain URL format', { code: 'InvalidDomainUrl' })
            }

            // Call DataZone /sso/login endpoint to get redirect URL with SSO instance info
            const loginData = await this.callDataZoneLogin(domainUrl, domainId)
            if (!loginData.redirectUrl) {
                throw new ToolkitError('No redirect URL received from DataZone login', { code: 'InvalidLoginResponse' })
            }

            // Parse the redirect URL to extract SSO instance information
            const redirectUrl = new URL(loginData.redirectUrl)
            const clientIdParam = redirectUrl.searchParams.get('client_id')
            if (!clientIdParam) {
                throw new ToolkitError('No client_id found in DataZone redirect URL', { code: 'InvalidRedirectUrl' })
            }

            // Decode the client_id ARN: arn:aws:sso::785498918019:application/ssoins-6684636af7e1a207/apl-5f60548b7f5677a2
            const decodedClientId = decodeURIComponent(clientIdParam)
            const arnParts = decodedClientId.split('/')
            if (arnParts.length < 2) {
                throw new ToolkitError('Invalid client_id ARN format', { code: 'InvalidArnFormat' })
            }

            const ssoInstanceId = arnParts[1] // Extract ssoins-6684636af7e1a207
            const issuerUrl = `https://identitycenter.amazonaws.com/${ssoInstanceId}`

            // Extract region from domain URL
            const region = this.extractRegionFromUrl(domainUrl)

            this.logger.info('SMUS Auth: Extracted SSO instance info: %s', ssoInstanceId)

            return {
                issuerUrl,
                ssoInstanceId,
                clientId: decodedClientId,
                region,
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            this.logger.error('SMUS Auth: Failed to get SSO instance info: %s', errorMsg)

            if (error instanceof ToolkitError) {
                throw error
            }

            throw new ToolkitError(`Failed to get SSO instance info: ${errorMsg}`, {
                code: 'SsoInstanceInfoFailed',
                cause: error instanceof Error ? error : undefined,
            })
        }
    }
    /**
     * Extracts SSO ID from a user ID in the format "user-<sso-id>"
     * @param userId The user ID to extract SSO ID from
     * @returns The extracted SSO ID
     * @throws Error if the userId format is invalid
     */
    public static extractSSOIdFromUserId(userId: string): string {
        const match = userId.match(/user-(.+)$/)
        if (!match) {
            this.logger.error(`Invalid UserId format: ${userId}`)
            throw new Error(`Invalid UserId format: ${userId}`)
        }
        return match[1]
    }

    /**
     * Checks if we're in SMUS space environment (should hide certain UI elements)
     * @returns True if in SMUS space environment with DataZone domain ID
     */
    public static isInSmusSpaceEnvironment(): boolean {
        const isSMUSspace = isSageMaker('SMUS') || isSageMaker('SMUS-SPACE-REMOTE-ACCESS')
        const resourceMetadata = getResourceMetadata()
        return isSMUSspace && !!resourceMetadata?.AdditionalMetadata?.DataZoneDomainId
    }
}

/**
 * Extracts the account ID from a SageMaker ARN.
 * Supports formats like:
 *   arn:aws:sagemaker:<region>:<account_id>:app/*
 *
 * @param arn - The full SageMaker ARN string
 * @returns The account ID from the ARN
 * @throws If the ARN format is invalid
 */
export function extractAccountIdFromSageMakerArn(arn: string): string {
    // Match the ARN components to extract account ID
    const regex = /^arn:aws:sagemaker:(?<region>[^:]+):(?<accountId>\d+):(app|space|domain)\/.+$/i
    const match = arn.match(regex)

    if (!match?.groups) {
        throw new ToolkitError(`Invalid SageMaker ARN format: "${arn}"`)
    }

    return match.groups.accountId
}
