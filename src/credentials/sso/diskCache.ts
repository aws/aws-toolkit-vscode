/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { getLogger } from '../../shared/logger'
import { SsoAccessToken, SsoCache } from './sso'
import { SsoClientRegistration } from './ssoClientRegistration'

export class DiskCache implements SsoCache {
    public constructor(private cacheDir: string = join(homedir(), '.aws', 'sso', 'cache')) {}

    // Treat the token or client registration as expired if within 15 minutes of expiration.
    private TOKEN_EXPIRATION_BUFFER_MS = 900000

    public loadClientRegistration(ssoRegion: string): SsoClientRegistration | undefined {
        if (!this.registrationExists(ssoRegion)) {
            return undefined
        }
        try {
            const registration = JSON.parse(fs.readFileSync(this.registrationCache(ssoRegion)).toString())
            if (registration && this.isNotExpired(registration)) {
                return registration
            }
        } catch (error) {
            getLogger().error(error as Error)
        }

        return undefined
    }

    public saveClientRegistration(ssoRegion: string, registration: SsoClientRegistration): void {
        fs.mkdirSync(this.cacheDir, { recursive: true })
        // According to the Spec: 'SSO Login Token Flow': the file permissions for the cached client registration
        // must be 0600 (owner read and write)
        fs.writeFileSync(this.registrationCache(ssoRegion), JSON.stringify(registration), {
            mode: 0o600,
        })
    }
    public invalidateClientRegistration(ssoRegion: string): void {
        if (this.registrationExists(ssoRegion)) {
            fs.unlinkSync(this.registrationCache(ssoRegion))
        }
    }
    public loadAccessToken(ssoUrl: string): SsoAccessToken | undefined {
        if (!this.tokenExists(ssoUrl)) {
            return undefined
        }
        try {
            const accessToken = JSON.parse(fs.readFileSync(this.accessTokenCache(ssoUrl)).toString())
            if (accessToken && this.isNotExpired(accessToken)) {
                return accessToken
            }
        } catch (error) {
            getLogger().error(error as Error)
        }
        return undefined
    }

    public saveAccessToken(ssoUrl: string, accessToken: SsoAccessToken): void {
        fs.writeFileSync(this.accessTokenCache(ssoUrl), JSON.stringify(accessToken), { mode: 0o600 })
    }

    public invalidateAccessToken(ssoUrl: string): void {
        if (this.tokenExists(ssoUrl)) {
            fs.unlinkSync(this.accessTokenCache(ssoUrl))
        }
    }

    private accessTokenCache(ssoUrl: string): string {
        const encoded = encodeURI(ssoUrl)
        // Per the spec: 'SSO Login Token Flow' the access token must be
        // cached as the SHA1 hash of the bytes of the UTF-8 encoded
        // startUrl value with ".json" appended to the end.

        const shasum = crypto.createHash('sha1')
        // Suppress warning because:
        //   1. SHA1 is prescribed by the AWS SSO spec
        //   2. the hashed startUrl value is not a secret
        shasum.update(encoded) // lgtm[js/weak-cryptographic-algorithm]
        const hashedUrl = shasum.digest('hex') // lgtm[js/weak-cryptographic-algorithm]

        return join(this.cacheDir, `${hashedUrl}.json`)
    }

    private registrationExists(ssoRegion: string): boolean {
        return fs.existsSync(this.registrationCache(ssoRegion))
    }

    private tokenExists(ssoUrl: string): boolean {
        return fs.existsSync(this.accessTokenCache(ssoUrl))
    }

    private isNotExpired(token: any): boolean {
        return Date.parse(token.expiresAt) - this.TOKEN_EXPIRATION_BUFFER_MS > Date.now()
    }

    private registrationCache(ssoRegion: string): string {
        return join(this.cacheDir, `aws-toolkit-vscode-client-id-${ssoRegion}.json`)
    }
}
