/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import { SsoCache } from './ssoCache'
import { SsoClientRegistration } from './ssoClientRegistration'
import { join } from 'path'
import { homedir } from 'os'
import { SsoAccessToken } from './ssoAccessToken'
import { getSHA1StringHash } from '../../shared/utilities/textUtilities'
import { getLogger } from '../../shared/logger'

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
            getLogger().error(error)
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
            getLogger().error(error)
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
        // According to the Spec: 'SSO Login Token Flow' the access token should be cached as
        // the SHA1 hash of the bytes of the UTF-8 encoded startUrl value with .json appended to the end.
        // Using the SHA1 hash is no longer recommended, but this hash is used to specifically comply with the
        // Spec and is used only to name a file. It is advised to use a more secure hash in most other cases.
        const encoded = encodeURI(ssoUrl)
        return join(this.cacheDir, getSHA1StringHash(encoded) + `.json`)
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
