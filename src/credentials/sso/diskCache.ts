/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import { SsoCache } from './ssoCache'
import { SsoClientRegistration } from './ssoClientRegistration'
import { join as joinPath } from 'path'
import { homedir } from 'os'
import { SsoAccessToken } from './ssoAccessToken'
import { getSHA1StringHash } from '../../shared/utilities/textUtilities'

export class DiskCache implements SsoCache {
    private cacheDir: string = joinPath(homedir(), '.aws', 'sso', 'cache')
    // Treat the token or client registration as expired if within 15 minutes of expiration.
    private TIME_ADDED_BEFORE_EXPIRY = 900000

    public loadClientRegistration(ssoRegion: string): SsoClientRegistration | undefined {
        if (!this.registrationExists(ssoRegion)) {
            return undefined
        }
        const registration = JSON.parse(
            fs.readFileSync(joinPath(this.cacheDir, this.registrationFilename(ssoRegion))).toString()
        )
        if (registration && this.isNotExpired(registration)) {
            return registration
        }
        return undefined
    }

    public saveClientRegistration(ssoRegion: string, registration: SsoClientRegistration): void {
        // fs.mkdirSync(joinPath(homedir(), '.aws', 'sso'), { recursive: true })
        fs.mkdirSync(this.cacheDir, { recursive: true })
        // According to the Spec: 'SSO Login Token Flow': the file permissions for the cached client registration
        // must be 0600 (owner read and write)
        fs.writeFileSync(joinPath(this.cacheDir, this.registrationFilename(ssoRegion)), JSON.stringify(registration), {
            mode: 0o600,
        })
    }
    public invalidateClientRegistration(ssoRegion: string): void {
        if (this.registrationExists(ssoRegion)) {
            fs.unlinkSync(joinPath(this.cacheDir, this.registrationFilename(ssoRegion)))
        }
    }
    public loadAccessToken(ssoUrl: string): SsoAccessToken | undefined {
        if (this.tokenExists(ssoUrl)) {
            return JSON.parse(fs.readFileSync(joinPath(this.cacheDir, this.accessTokenCache(ssoUrl))).toString())
        }
        return undefined
    }

    public saveAccessToken(ssoUrl: string, accessToken: SsoAccessToken): void {
        const fileName = this.accessTokenCache(ssoUrl)
        fs.writeFileSync(joinPath(this.cacheDir, `${fileName}.json`), JSON.stringify(accessToken), { mode: 0o600 })
    }

    public invalidateAccessToken(ssoUrl: string): void {
        if (this.tokenExists(ssoUrl)) {
            fs.unlinkSync(joinPath(this.cacheDir, this.accessTokenCache(ssoUrl)))
        }
    }

    private accessTokenCache(ssoUrl: string): string {
        // According to the Spec: 'SSO Login Token Flow' the access token should be cached as
        // the SHA1 hash of the bytes of the UTF-8 encoded startUrl value with .json appended to the end.
        const encoded = encodeURI(ssoUrl)
        return getSHA1StringHash(encoded)
    }

    private registrationExists(ssoRegion: string): boolean {
        return fs.existsSync(joinPath(this.cacheDir, this.registrationFilename(ssoRegion)))
    }

    private tokenExists(ssoUrl: string): boolean {
        return fs.existsSync(joinPath(this.cacheDir, this.accessTokenCache(ssoUrl)))
    }

    private isNotExpired(token: any): boolean {
        return Date.parse(token.expiresAt) - this.TIME_ADDED_BEFORE_EXPIRY > Date.now()
    }

    private registrationFilename(ssoRegion: string): string {
        return `aws-toolkit-vscode-client-id-${ssoRegion}.json`
    }
}
