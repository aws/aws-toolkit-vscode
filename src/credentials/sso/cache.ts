/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto'
import * as path from 'path'
import { getLogger } from '../../shared/logger/logger'
import { createDiskCache, KeyedCache, mapCache } from '../../shared/utilities/cacheUtils'
import { stripUndefined } from '../../shared/utilities/collectionUtils'
import { hasProps, selectFrom } from '../../shared/utilities/tsUtils'
import { SsoToken, ClientRegistration } from './model'
import { SystemUtilities } from '../../shared/systemUtilities'
import { DevSettings } from '../../shared/settings'
import { statSync, Stats, readdirSync, unlinkSync } from 'fs'

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

const defaultCacheDir = path.join(SystemUtilities.getHomeDirectory(), '.aws', 'sso', 'cache')
export const getCacheDir = () => DevSettings.instance.get('ssoCacheDirectory', defaultCacheDir)

export function getCache(directory = getCacheDir(), statFunc = getFileStats): SsoCache {
    try {
        deleteOldFiles(directory, statFunc)
    } catch (e) {
        getLogger().warn('auth: error deleting old files in sso cache: %s', e)
    }

    return {
        token: getTokenCache(directory),
        registration: getRegistrationCache(directory),
    }
}

function deleteOldFiles(directory: string, statFunc: typeof getFileStats) {
    if (!isDirSafeToDeleteFrom(directory)) {
        getLogger().warn(`Skipped deleting files in directory: ${path.resolve(directory)}`)
        return
    }

    const fileNames = readdirSync(directory)
    fileNames.forEach(fileName => {
        const filePath = path.join(directory, fileName)
        if (path.extname(filePath) === '.json' && isOldFile(filePath, statFunc)) {
            unlinkSync(filePath)
            getLogger().warn(`auth: removed old cache file: ${filePath}`)
        }
    })
}

export function isDirSafeToDeleteFrom(dirPath: string): boolean {
    const resolvedPath = path.resolve(dirPath)
    const isRoot = resolvedPath === path.resolve('/')
    const isCwd = resolvedPath === path.resolve('.')
    const isAbsolute = path.isAbsolute(dirPath)
    const pathDepth = resolvedPath.split(path.sep).length

    const isSafe = !isRoot && !isCwd && isAbsolute && pathDepth >= 5
    return isSafe
}

export function getRegistrationCache(directory = getCacheDir()): KeyedCache<ClientRegistration, RegistrationKey> {
    // Compatability for older Toolkit versions (format on disk is unchanged)
    type StoredRegistration = Omit<ClientRegistration, 'expiresAt'> & { readonly expiresAt: string }
    const read = (data: StoredRegistration) => ({ ...data, expiresAt: new Date(data.expiresAt) })
    const write = (data: ClientRegistration) => ({ ...data, expiresAt: data.expiresAt.toISOString() })

    const logger = (message: string) => getLogger().debug(`SSO registration cache: ${message}`)
    const cache: KeyedCache<StoredRegistration, RegistrationKey> = createDiskCache(
        (registrationKey: RegistrationKey) => getRegistrationCacheFile(directory, registrationKey),
        logger
    )

    return mapCache(cache, read, write)
}

export function getTokenCache(directory = getCacheDir()): KeyedCache<SsoAccess> {
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

    const logger = (message: string) => getLogger().debug(`SSO token cache: ${message}`)
    const cache = createDiskCache<StoredToken, string>((ssoUrl: string) => getTokenCacheFile(directory, ssoUrl), logger)

    return mapCache(cache, read, write)
}

function getFileStats(file: string): Stats {
    return statSync(file)
}

const firstValidDate = new Date(2023, 3, 14) // April 14, 2023

/**
 * @returns true if file is older than the first valid date
 */
function isOldFile(file: string, statFunc: typeof getFileStats): boolean {
    try {
        const statResult = statFunc(file)
        // Depending on the Windows filesystem, birthtime may be 0, so we fall back to ctime (last time metadata was changed)
        // https://nodejs.org/api/fs.html#stat-time-values
        return statResult.birthtimeMs !== 0
            ? statResult.birthtimeMs < firstValidDate.getTime()
            : statResult.ctime < firstValidDate
    } catch (err) {
        getLogger().debug(`SSO cache file age not be verified: ${file}: ${err}`)
        return false // Assume it is no old since we cannot validate
    }
}

export function getTokenCacheFile(ssoCacheDir: string, ssoUrl: string): string {
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

    return path.join(ssoCacheDir, `${hashedUrl}.json`)
}

export function getRegistrationCacheFile(ssoCacheDir: string, key: RegistrationKey): string {
    const hashScopes = (scopes: string[]) => {
        const shasum = crypto.createHash('sha256')
        scopes.forEach(s => shasum.update(s))
        return shasum.digest('hex')
    }

    const suffix = `${key.region}${key.scopes && key.scopes.length > 0 ? `-${hashScopes(key.scopes)}` : ''}`
    return path.join(ssoCacheDir, `aws-toolkit-vscode-client-id-${suffix}.json`)
}
