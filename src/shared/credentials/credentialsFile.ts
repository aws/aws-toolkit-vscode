/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// ***************************************************************************
// Note: Supplied by the AWS Javascript SDK team, from their upcoming v3 SDK.
// Once that release is GA and we switch over, we can remove this copy and use
// their version.
// ***************************************************************************

import { copy } from 'fs-extra'
import { homedir } from 'os'
import { join, sep } from 'path'
import { EnvironmentVariables } from '../environmentVariables'
import { writeFile } from '../filesystem'
import { fileExists, readFileAsString } from '../filesystemUtilities'

export interface SharedConfigInit {
    /**
     * The path at which to locate the ini credentials file. Defaults to the
     * value of the `AWS_SHARED_CREDENTIALS_FILE` environment variable (if
     * defined) or `~/.aws/credentials` otherwise.
     */
    filepath?: string

    /**
     * The path at which to locate the ini config file. Defaults to the value of
     * the `AWS_CONFIG_FILE` environment variable (if defined) or
     * `~/.aws/config` otherwise.
     */
    configFilepath?: string
}

export interface Profile {
    [key: string]: string | undefined
}

export interface ParsedIniData {
    [key: string]: Profile
}

export interface SharedConfigFiles {
    credentialsFile: ParsedIniData
    configFile: ParsedIniData
}

export async function loadSharedConfigFiles(init: SharedConfigInit = {}): Promise<SharedConfigFiles> {
    const [ configFile, credentialsFile ] = await Promise.all([
        /* tslint:disable await-promise */
        loadConfigFile(init.configFilepath),
        loadCredentialsFile(init.filepath)
        /* tslint:enable await-promise */
    ])

    return {
        credentialsFile,
        configFile
    }
}

async function loadConfigFile(
    configFilePath?: string
): Promise<ParsedIniData> {
    const env = process.env as EnvironmentVariables
    if (!configFilePath) {
        configFilePath = env.AWS_CONFIG_FILE || join(getHomeDir(), '.aws', 'config')
    }

    if (!await fileExists(configFilePath)) {
        return {}
    }

    return normalizeConfigFile(parseIni(await readFileAsString(configFilePath)))
}

async function loadCredentialsFile(
    credentialsFilePath?: string
): Promise<ParsedIniData> {
    const env = process.env as EnvironmentVariables
    if (!credentialsFilePath) {
        credentialsFilePath = env.AWS_SHARED_CREDENTIALS_FILE || join(getHomeDir(), '.aws', 'credentials')
    }

    if (!await fileExists(credentialsFilePath)) {
        return {}
    }

    return parseIni(await readFileAsString(credentialsFilePath))
}

// TODO: FOR POC-DEMOS ONLY, NOT FOR PRODUCTION USE!
// REMOVE_BEFORE_RELEASE
// This is nowhere near resilient enough :-)
export async function saveProfile(
    name: string,
    accessKey: string,
    secretKey: string
): Promise<void> {
    const env = process.env as EnvironmentVariables
    const filepath = env.AWS_SHARED_CREDENTIALS_FILE || join(getHomeDir(), '.aws', 'credentials')

    // even though poc concept code, let's preserve the user's file!
    await copy(filepath, `${filepath}.bak_vscode`, { overwrite: true})

    const data = `${await readFileAsString(filepath)}
[${name}]
aws_access_key_id=${accessKey}
aws_secret_access_key=${secretKey}
`

    await writeFile(filepath, data, 'utf8')
}

const profileKeyRegex = /^profile\s(["'])?([^\1]+)\1$/
function normalizeConfigFile(data: ParsedIniData): ParsedIniData {
    const map: ParsedIniData = {}
    for (const key of Object.keys(data)) {
        if (key === 'default') {
            map.default = data.default
        } else {
            const matches = profileKeyRegex.exec(key)
            if (matches) {
                // @ts-ignore
                const [_1, _2, normalizedKey] = matches
                if (normalizedKey) {
                    map[normalizedKey] = data[key]
                }
            }
        }
    }

    return map
}

function parseIni(iniData: string): ParsedIniData {
    const map: ParsedIniData = {}
    let currentSection: string | undefined
    for (let line of iniData.split(/\r?\n/)) {
        line = line.split(/(^|\s)[;#]/)[0] // remove comments
        const section = line.match(/^\s*\[([^\[\]]+)]\s*$/)
        if (section) {
            currentSection = section[1]
        } else if (currentSection) {
            const item = line.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/)
            if (item) {
                map[currentSection] = map[currentSection] || {}
                map[currentSection][item[1]] = item[2]
            }
        }
    }

    return map
}

function getHomeDir(): string {
    const env = process.env as EnvironmentVariables
    const {
        HOME,
        USERPROFILE,
        HOMEPATH,
        HOMEDRIVE = `C:${sep}`,
    } = env

    if (HOME) { return HOME }
    if (USERPROFILE) { return USERPROFILE }
    if (HOMEPATH) { return `${HOMEDRIVE}${HOMEPATH}` }

    return homedir()
}
