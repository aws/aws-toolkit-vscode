/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto'
import { homedir } from 'os'
import { join } from 'path'
import { getLogger } from '../../shared/logger/logger'
import { createDiskCache, KeyedCache, mapCache } from '../../shared/utilities/cacheUtils'
import { stripUndefined } from '../../shared/utilities/collectionUtils'
import { hasProps, selectFrom } from '../../shared/utilities/tsUtils'
import { SsoToken, ClientRegistration } from './model'

interface RegistrationKey {
    readonly region: string
    readonly scopes?: string[]
}

export interface SsoAccess {
    readonly token: SsoToken
    readonly region: string
    readonly startUrl: string
    readonly registration?: ClientRegistration
}

export interface SsoCache {
    readonly token: KeyedCache<SsoAccess>
    readonly registration: KeyedCache<ClientRegistration, RegistrationKey>
}

const cacheDir = join(homedir(), '.aws', 'sso', 'cache')

export function getCache(directory = cacheDir): SsoCache {
    return {
        token: getTokenCache(directory),
        registration: getRegistrationCache(directory),
    }
}

export function getRegistrationCache(directory = cacheDir): KeyedCache<ClientRegistration, RegistrationKey> {
    const hashScopes = (scopes: string[]) => {
        const shasum = crypto.createHash('sha256')
        scopes.forEach(s => shasum.update(s))
        return shasum.digest('hex')
    }

    const getTarget = (key: RegistrationKey) => {
        const suffix = `${key.region}${key.scopes && key.scopes.length > 0 ? `-${hashScopes(key.scopes)}` : ''}`
        return join(directory, `aws-toolkit-vscode-client-id-${suffix}.json`)
    }

    // Compatability for older Toolkit versions (format on disk is unchanged)
    type StoredRegistration = Omit<ClientRegistration, 'expiresAt'> & { readonly expiresAt: string }
    const read = (data: StoredRegistration) => ({ ...data, expiresAt: new Date(data.expiresAt) })
    const write = (data: ClientRegistration) => ({ ...data, expiresAt: data.expiresAt.toISOString() })

    const logger = (message: string) => getLogger().debug(`SSO registration cache: ${message}`)
    const cache: KeyedCache<StoredRegistration, RegistrationKey> = createDiskCache(getTarget, logger)

    return mapCache(cache, read, write)
}

export function getTokenCache(directory = cacheDir): KeyedCache<SsoAccess> {
    // Older specs do not store the registration
    type MaybeRegistration = Partial<Omit<ClientRegistration, 'expiresAt'> & { readonly registrationExpiresAt: string }>

    // This is the format used by the SDKs (currently)
    type StoredToken = Omit<SsoToken, 'expiresAt'> &
        MaybeRegistration & {
            readonly startUrl: string
            readonly region: string
            readonly expiresAt: string
        }

    function read(data: StoredToken): SsoAccess {
        const registration = hasProps(data, 'clientId', 'clientSecret', 'registrationExpiresAt')
            ? {
                  ...selectFrom(data, 'clientId', 'clientSecret', 'scopes'),
                  expiresAt: new Date(data.registrationExpiresAt),
              }
            : undefined

        const token = {
            ...selectFrom(data, 'accessToken', 'refreshToken', 'tokenType'),
            expiresAt: new Date(data.expiresAt),
        }

        stripUndefined(token)

        return {
            token,
            registration,
            ...selectFrom(data, 'region', 'startUrl'),
        }
    }

    function write(data: SsoAccess): StoredToken {
        const registration =
            data.registration !== undefined
                ? selectFrom(data.registration, 'clientId', 'clientSecret', 'scopes')
                : undefined

        return {
            ...registration,
            ...selectFrom(data, 'region', 'startUrl'),
            ...selectFrom(data.token, 'accessToken', 'refreshToken'),
            expiresAt: data.token.expiresAt.toISOString(),
            registrationExpiresAt: data.registration?.expiresAt.toISOString(),
        }
    }

    const getTarget = (ssoUrl: string) => {
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

        return join(directory, `${hashedUrl}.json`)
    }

    const logger = (message: string) => getLogger().debug(`SSO token cache: ${message}`)
    const cache = createDiskCache<StoredToken, string>(getTarget, logger)

    return mapCache(cache, read, write)
}
