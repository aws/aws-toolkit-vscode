/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger/logger'
import { codeWhispererClient } from '../client/codewhisperer'
import { AuthUtil } from './authUtil'

export async function checkMcpConfiguration(): Promise<boolean> {
    try {
        if (!AuthUtil.instance.isConnected()) {
            return true
        }

        const userClient = await codeWhispererClient.createUserSdkClient()
        const profileArn = AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn
        if (!profileArn) {
            return true
        }

        const response = await retryWithBackoff(() => userClient.getProfile({ profileArn }).promise())
        const mcpConfig = response.profile?.optInFeatures?.mcpConfiguration?.toggle
        const isMcpEnabled = mcpConfig === 'ON'

        getLogger().debug(`MCP configuration toggle: ${mcpConfig}, mcpAdmin flag set to: ${isMcpEnabled}`)
        return isMcpEnabled
    } catch (error) {
        getLogger().debug(`Failed to check MCP configuration from profile: ${error}. Setting mcpAdmin to false.`)
        return true
    }
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: any

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error

            // Only retry on specific retryable exceptions
            const errorCode = (error as any).code || (error as any).name
            const statusCode = (error as any).statusCode

            // Don't retry on client errors (4xx) except ThrottlingException
            if (statusCode >= 400 && statusCode < 500 && errorCode !== 'ThrottlingException') {
                throw error
            }

            // Only retry on retryable exceptions
            const retryableExceptions = [
                'ThrottlingException',
                'InternalServerException',
                'ServiceUnavailableException',
            ]
            if (!retryableExceptions.includes(errorCode) && statusCode !== 500 && statusCode !== 503) {
                throw error
            }

            if (attempt < maxRetries - 1) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 3000) // Cap at 3s
                getLogger().debug(`GetProfile attempt ${attempt + 1} failed, retrying in ${delay}ms: ${error}`)
                await new Promise((resolve) => setTimeout(resolve, delay))
            }
        }
    }

    throw lastError
}
