/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { getLogger } from '../logger/logger'

interface ProxyConfig {
    proxyUrl: string | undefined
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
    public static configureProxyForLanguageServer(): void {
        try {
            const proxyConfig = this.getProxyConfiguration()

            this.setProxyEnvironmentVariables(proxyConfig)
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

        const amazonQConfig = vscode.workspace.getConfiguration('amazonQ')
        const proxySettings = amazonQConfig.get<{
            certificateAuthority?: string
        }>('proxy', {})

        return {
            proxyUrl,
            certificateAuthority: proxySettings.certificateAuthority,
        }
    }

    /**
     * Sets environment variables based on proxy configuration
     */
    private static setProxyEnvironmentVariables(config: ProxyConfig): void {
        const proxyUrl = config.proxyUrl
        // Set proxy environment variables
        if (proxyUrl) {
            process.env.HTTPS_PROXY = proxyUrl
            process.env.HTTP_PROXY = proxyUrl
            this.logger.debug(`Set proxy environment variables: ${proxyUrl}`)
        }

        // Set certificate bundle environment variables if configured
        if (config.certificateAuthority) {
            process.env.NODE_EXTRA_CA_CERTS = config.certificateAuthority
            process.env.AWS_CA_BUNDLE = config.certificateAuthority
            this.logger.debug(`Set certificate bundle path: ${config.certificateAuthority}`)
        }
    }
}
