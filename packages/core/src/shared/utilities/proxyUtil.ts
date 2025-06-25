/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { getLogger } from '../logger/logger'

interface ProxyConfig {
    proxyUrl: string | undefined
    noProxy: string | undefined
    proxyStrictSSL: boolean | true
    certificateAuthority: string | undefined
}

/**
 * Utility class for handling proxy configuration
 */
export class ProxyUtil {
    private static readonly logger = getLogger('proxyUtil')

    /**
     * Sets proxy environment variables based on VS Code settings for use with the Flare Language Server
     *
     * See documentation here for setting the environement variables which are inherited by Flare LS process:
     * https://github.com/aws/language-server-runtimes/blob/main/runtimes/docs/proxy.md
     */
    public static async configureProxyForLanguageServer(): Promise<void> {
        try {
            const proxyConfig = this.getProxyConfiguration()

            await this.setProxyEnvironmentVariables(proxyConfig)
        } catch (err) {
            this.logger.error(`Failed to configure proxy: ${err}`)
        }
    }

    /**
     * Gets proxy configuration from VS Code settings
     */
    private static getProxyConfiguration(): ProxyConfig {
        const httpConfig = vscode.workspace.getConfiguration('http')
        const proxyUrl = httpConfig.get<string>('proxy')
        this.logger.debug(`Proxy URL Setting in VSCode Settings: ${proxyUrl}`)

        const noProxy = httpConfig.get<string>('noProxy')
        if (noProxy) {
            this.logger.info(`Using noProxy from VS Code settings: ${noProxy}`)
        }

        const proxyStrictSSL = httpConfig.get<boolean>('proxyStrictSSL', true)

        const amazonQConfig = vscode.workspace.getConfiguration('amazonQ')
        const proxySettings = amazonQConfig.get<{
            certificateAuthority?: string
        }>('proxy', {})

        return {
            proxyUrl,
            noProxy,
            proxyStrictSSL,
            certificateAuthority: proxySettings.certificateAuthority,
        }
    }

    /**
     * Sets environment variables based on proxy configuration
     */
    private static async setProxyEnvironmentVariables(config: ProxyConfig): Promise<void> {
        // Always enable experimental proxy support for better handling of both explicit and transparent proxies
        process.env.EXPERIMENTAL_HTTP_PROXY_SUPPORT = 'true'

        const proxyUrl = config.proxyUrl
        // Set proxy environment variables
        if (proxyUrl) {
            process.env.HTTPS_PROXY = proxyUrl
            process.env.HTTP_PROXY = proxyUrl
            this.logger.debug(`Set proxy environment variables: ${proxyUrl}`)
        }

        // set NO_PROXY vals
        const noProxy = config.noProxy
        if (noProxy) {
            process.env.NO_PROXY = noProxy
            this.logger.debug(`Set NO_PROXY environment variable: ${noProxy}`)
        }

        const strictSSL = config.proxyStrictSSL
        // Handle SSL certificate verification
        if (!strictSSL) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
            this.logger.info('SSL verification disabled via VS Code settings')
            return // No need to set CA certs when SSL verification is disabled
        }

        // Set certificate bundle environment variables if user configured
        if (config.certificateAuthority) {
            process.env.NODE_EXTRA_CA_CERTS = config.certificateAuthority
            process.env.AWS_CA_BUNDLE = config.certificateAuthority
            this.logger.debug(`Set certificate bundle path: ${config.certificateAuthority}`)
        }
    }
}
