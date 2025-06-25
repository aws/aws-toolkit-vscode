/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { getLogger } from '../logger/logger'
import { tmpdir } from 'os'
import { join } from 'path'
import * as nodefs from 'fs' // eslint-disable-line no-restricted-imports

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

        // Load built-in bundle and system OS trust store
        process.env.NODE_OPTIONS = '--use-system-ca'

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
        } else {
            // Fallback to system certificates if no custom CA is configured
            await this.setSystemCertificates()
        }
    }

    /**
     * Sets system certificates as fallback when no custom CA is configured
     */
    private static async setSystemCertificates(): Promise<void> {
        try {
            const tls = await import('tls')
            // @ts-ignore Get system certificates
            const systemCerts = tls.getCACertificates('system')
            // @ts-ignore Get any existing extra certificates
            const extraCerts = tls.getCACertificates('extra')
            const allCerts = [...systemCerts, ...extraCerts]
            if (allCerts && allCerts.length > 0) {
                this.logger.debug(`Found ${allCerts.length} certificates in system's trust store`)

                const tempDir = join(tmpdir(), 'aws-toolkit-vscode')
                if (!nodefs.existsSync(tempDir)) {
                    nodefs.mkdirSync(tempDir, { recursive: true })
                }

                const certPath = join(tempDir, 'vscode-ca-certs.pem')
                const certContent = allCerts.join('\n')

                nodefs.writeFileSync(certPath, certContent)
                process.env.NODE_EXTRA_CA_CERTS = certPath
                process.env.AWS_CA_BUNDLE = certPath
                this.logger.debug(`Set system certificate bundle path: ${certPath}`)
            }
        } catch (err) {
            this.logger.error(`Failed to extract system certificates: ${err}`)
        }
    }
}
