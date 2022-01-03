/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export interface SharedConfigPaths {
    /**
     * The path at which to locate the ini credentials file. No data will be read if not provided.
     */
    credentials?: vscode.Uri

    /**
     * The path at which to locate the ini config file. No data will be read if not provided.
     */
    config?: vscode.Uri
}

export interface Profile {
    [key: string]: string | undefined
}

export interface ParsedIniData {
    [key: string]: Profile | undefined
}

export interface SharedConfigFiles {
    credentialsFile: ParsedIniData
    configFile: ParsedIniData
}

export async function loadSharedConfigFiles(init: SharedConfigPaths = {}): Promise<SharedConfigFiles> {
    const [configFile, credentialsFile] = await Promise.all([
        loadConfigFile(init.config),
        loadCredentialsFile(init.credentials),
    ])

    return {
        credentialsFile,
        configFile,
    }
}

const fileNotFound = vscode.FileSystemError.FileNotFound().code
async function fileExists(uri: vscode.Uri): Promise<boolean> {
    return vscode.workspace.fs.stat(uri).then(
        () => true,
        err => !(err instanceof vscode.FileSystemError && err.code === fileNotFound)
    )
}

async function loadConfigFile(configUri?: vscode.Uri): Promise<ParsedIniData> {
    if (!configUri || !(await fileExists(configUri))) {
        return {}
    }

    const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(configUri))
    return normalizeConfigFile(parseIni(text))
}

async function loadCredentialsFile(credentialsUri?: vscode.Uri): Promise<ParsedIniData> {
    if (!credentialsUri || !(await fileExists(credentialsUri))) {
        return {}
    }

    const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(credentialsUri))
    return parseIni(text)
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
                const normalizedKey = matches[2]
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
