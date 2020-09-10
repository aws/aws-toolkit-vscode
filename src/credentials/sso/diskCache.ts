/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as crypto from 'crypto'
import { SsoCache } from './ssoCache'
import { ClientRegistration } from './clientRegistration'
import { join } from 'path'
import { homedir } from 'os'
import { AccessToken } from './accessToken'

export class DiskCache implements SsoCache {
    private cacheDir: string = join(homedir(), '.aws', 'sso', 'cache')

    loadClientRegistration(ssoRegion: string): ClientRegistration | null {
        const registration = JSON.parse(
            fs.readFileSync(join(this.cacheDir, `aws-toolkit-vscode-client-id-${ssoRegion}.json`)).toString()
        )
        if (registration && this.isNotExpired(registration)) {
            return registration
        } else {
            return null
        }
    }

    saveClientRegistration(ssoRegion: string, registration: ClientRegistration) {
        fs.mkdirSync(join(homedir(), '.aws', 'sso'), { recursive: true })
        fs.mkdirSync(this.cacheDir, { recursive: true })
        fs.writeFileSync(
            join(this.cacheDir, `aws-toolkit-vscode-client-id-${ssoRegion}.json`),
            JSON.stringify(registration),
            { mode: 0o600 }
        )
    }
    invalidateClientRegistration(ssoRegion: string) {
        if (this.registrationExists(ssoRegion)) {
            fs.unlinkSync(join(this.cacheDir, `aws-toolkit-vscode-client-id-${ssoRegion}.json`))
        }
    }
    loadAccessToken(ssoUrl: string) {
        if (this.tokenExists(ssoUrl)) {
            return JSON.parse(fs.readFileSync(join(this.cacheDir, this.accessTokenCache(ssoUrl))).toString())
        }
    }

    saveAccessToken(ssoUrl: string, accessToken: AccessToken) {
        const fileName = this.accessTokenCache(ssoUrl)
        fs.writeFileSync(join(this.cacheDir, `${fileName}.json`), JSON.stringify(accessToken), { mode: 0o600 })
    }

    invalidateAccessToken(ssoUrl: string) {
        if (this.tokenExists(ssoUrl)) {
            fs.unlinkSync(join(this.cacheDir, this.accessTokenCache(ssoUrl)))
        }
    }

    private registrationExists(ssoRegion: string): boolean {
        return fs.existsSync(join(this.cacheDir, `aws-toolkit-vscode-client-id-${ssoRegion}.json`))
    }

    private accessTokenCache(ssoUrl: string): string {
        // According to the SEP 'SSO Login Token Flow' the access token should be cached as
        // the SHA1 hash of the bytes of the UTF-8 encoded startUrl value with .json appended to the end.
        const encoded = encodeURI(ssoUrl)
        let shasum = crypto.createHash('sha1')
        shasum.update(encoded)
        return shasum.digest('hex')
    }

    private tokenExists(ssoUrl: string): boolean {
        return fs.existsSync(join(this.cacheDir, this.accessTokenCache(ssoUrl)))
    }

    // Treat the token or client registration as expired if within 15 minutes of expiration.
    private isNotExpired(token: any): boolean {
        return Date.parse(token.expiresAt) - 900000 > Date.now()
    }
}
