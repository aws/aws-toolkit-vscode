/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

// ***************************************************************************
// Note: Supplied by the AWS Javascript SDK team, from their upcoming v3 SDK.
// Once that release is GA and we switch over, we can remove this copy and use
// their version.
// ***************************************************************************

// import { readFile, writeFile } from 'fs'
import { copy } from 'fs-extra'
import { homedir } from 'os'
import { join, sep } from 'path'
import { readFileAsync, writeFileAsync } from '../filesystem'

export const ENV_CREDENTIALS_PATH = 'AWS_SHARED_CREDENTIALS_FILE'
export const ENV_CONFIG_PATH = 'AWS_CONFIG_FILE'

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
    configFilePath: string = process.env[ENV_CONFIG_PATH] || join(getHomeDir(), '.aws', 'config')
): Promise<ParsedIniData> {
    const content: string = await slurpFile(configFilePath)

    return normalizeConfigFile(parseIni(content))
}

async function loadCredentialsFile(
    credentialsFilePath: string = process.env[ENV_CREDENTIALS_PATH] || join(getHomeDir(), '.aws', 'credentials')
): Promise<ParsedIniData> {
    const content: string = await slurpFile(credentialsFilePath)

    return parseIni(content)
}

// TODO: FOR POC-DEMOS ONLY, NOT FOR PRODUCTION USE!
// REMOVE_BEFORE_RELEASE
// This is nowhere near resilient enough :-)
export async function saveProfile(
    name: string,
    accessKey: string,
    secretKey: string
): Promise<void> {
    const filepath = process.env[ENV_CREDENTIALS_PATH] || join(getHomeDir(), '.aws', 'credentials')

    // even though poc concept code, let's preserve the user's file!
    copy(filepath, `${filepath}.bak_vscode`, { overwrite: true})

    const data = `${await slurpFile(filepath)}
[${name}]
aws_access_key_id=${accessKey}
aws_secret_access_key=${secretKey}
`

    await writeFileAsync(filepath, data, 'utf8')
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

async function slurpFile(path: string): Promise<string> {
    const result = await readFileAsync(path, 'utf8')
    if (result instanceof Buffer) {
        return result.toString('utf8')
    }

    return result
}

function getHomeDir(): string {
    const {
        HOME,
        USERPROFILE,
        HOMEPATH,
        HOMEDRIVE = `C:${sep}`,
    } = process.env

    if (HOME) { return HOME }
    if (USERPROFILE) { return USERPROFILE }
    if (HOMEPATH) { return `${HOMEDRIVE}${HOMEPATH}` }

    return homedir()
}
