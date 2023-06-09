/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SystemUtilities } from '../../shared/systemUtilities'
import { ToolkitError } from '../../shared/errors'
import { assertHasProps } from '../../shared/utilities/tsUtils'
import { getConfigFilename, getCredentialsFilename } from './sharedCredentialsFile'
import { SectionName, StaticProfile } from './types'
import { UserCredentialsUtils } from '../../shared/credentials/userCredentialsUtils'

export async function updateAwsSdkLoadConfigEnvVar(): Promise<void> {
    const configFileExists = await SystemUtilities.fileExists(getConfigFilename())
    process.env.AWS_SDK_LOAD_CONFIG = configFileExists ? 'true' : ''
}

interface AssignmentNode {
    readonly key: string
    readonly value: string
    readonly range: vscode.Range
}

export interface BaseSection {
    readonly type: string
    readonly name: SectionName
    readonly source: vscode.Uri
    readonly startLines: number[]
    readonly assignments: AssignmentNode[]
}

export interface ProfileSection extends BaseSection {
    readonly type: 'profile'
}

export interface SsoSessionSection extends BaseSection {
    readonly type: 'sso-session'
}

export type Section = ProfileSection | SsoSessionSection

export interface ParseResult {
    readonly sections: Section[]
    readonly errors: ParseError[]
}

export class ParseError extends Error {
    public constructor(public readonly source: vscode.Uri, public readonly range: vscode.Range, message: string) {
        const location = `${source.fsPath}:${range.start.line}:${range.start.character}`
        super(`${location}: ${message}`)
    }

    public static fromSection(section: BaseSection, message: string) {
        const line = section.startLines[0]
        if (line === undefined) {
            throw new Error(`Section "${section.name}" has no source mapping`)
        }

        return new ParseError(section.source, new vscode.Range(line, 0, line, 0), message)
    }
}

export const isProfileSection = (section: Section): section is ProfileSection => section.type === 'profile'
export const isSsoSessionSection = (section: Section): section is SsoSessionSection => section.type === 'sso-session'

export function extractDataFromSection(section: BaseSection): Record<string, string> {
    const data: Record<string, string> = {}
    for (const assignment of section.assignments) {
        data[assignment.key] = assignment.value
    }

    return data
}

export function getRequiredFields<T extends string>(section: Section, ...keys: T[]): { [P in T]: string } {
    try {
        const data = extractDataFromSection(section)
        assertHasProps(data, ...keys)

        return data
    } catch (err) {
        const parseError = ParseError.fromSection(section, (err as Error).message)

        throw ToolkitError.chain(parseError, `Section "${section.type} ${section.name}" is invalid`)
    }
}

export function getSectionOrThrow<T extends Section['type'] = Section['type']>(
    sections: Section[],
    name: SectionName,
    type: T
): Section & { type: T } {
    const section = sections.find(s => s.name === name && s.type === type) as (Section & { type: T }) | undefined
    if (!section) {
        const friendlyName = type === 'sso-session' ? 'Session' : 'Profile'
        throw new Error(`${friendlyName} not found: ${name}`)
    }

    return section
}

export function getSectionDataOrThrow(sections: Section[], name: SectionName, type: Section['type']) {
    const section = getSectionOrThrow(sections, name, type)
    if (section.type !== type) {
        throw ParseError.fromSection(section, `Expected section to be type "${type}", got: ${section.type}`)
    }

    return extractDataFromSection(section)
}

const sectionTypes = ['profile', 'sso-session'] as const
function validateSection(section: BaseSection): asserts section is Section {
    if (!sectionTypes.some(t => t === section.type)) {
        throw ParseError.fromSection(
            section,
            `Invalid section type "${section.type}". Expected one of: ${sectionTypes.join(', ')}`
        )
    }
}

/**
 * Loads existing merged (credentials + config) profiles from the filesystem
 */
export async function loadSharedCredentialsProfiles(): Promise<Record<SectionName, Profile>> {
    const profiles = {} as Record<SectionName, Profile>
    for (const section of (await loadSharedCredentialsSections()).sections.values()) {
        if (section.type === 'profile') {
            profiles[section.name] = extractDataFromSection(section)
        }
    }
    return profiles
}

export async function loadSharedCredentialsSections(): Promise<ParseResult> {
    // These should eventually be changed to use `parse` to allow for credentials from other file systems
    const data = await loadSharedConfigFiles({
        config: vscode.Uri.file(getConfigFilename()),
        credentials: vscode.Uri.file(getCredentialsFilename()),
    })

    return mergeAndValidateSections([...data.config, ...data.credentials])
}

export function mergeAndValidateSections(data: BaseSection[]): ParseResult {
    const errors = [] as ParseError[]
    const sections = new Map<`${Section['type']}:${Section['name']}`, Section>()
    for (const section of data) {
        try {
            validateSection(section)
            const key = `${section.type}:${section.name}` as const
            const existingSection = sections.get(key)

            sections.set(key, {
                ...section,
                startLines: (existingSection?.startLines ?? []).concat(section.startLines),
                assignments: (existingSection?.assignments ?? []).concat(section.assignments),
            })
        } catch (e) {
            if (e instanceof ParseError) {
                errors.push(e)
            } else {
                errors.push(ParseError.fromSection(section, (e as Error).message))
            }
        }
    }

    return { sections: Array.from(sections.values()), errors }
}

export function parseIni(iniData: string, source: vscode.Uri): BaseSection[] {
    const sections = [] as BaseSection[]
    const lines = iniData.split(/\r?\n/).map(l => l.split(/(^|\s)[;#]/)[0]) // remove comments
    lines.forEach((line, lineNumber) => {
        const section = line.match(/^\s*\[([^\[\]]+)]\s*$/)
        const currentSection: BaseSection | undefined = sections[sections.length - 1]
        if (section) {
            const parts = section[1].split(' ')
            const name = parts.length === 1 ? parts[0] : parts[1]
            const type = parts.length === 1 ? 'profile' : parts[0]
            sections.push({ name, type, assignments: [], source, startLines: [lineNumber] })
        } else if (currentSection) {
            const item = line.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/)
            if (item) {
                const key = item[1].toLowerCase()
                currentSection.assignments.push({
                    key,
                    value: item[2],
                    range: new vscode.Range(lineNumber, 0, lineNumber, line.length),
                })
            }
        }
    })

    return sections
}

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

export type SharedConfigData = { [T in keyof SharedConfigPaths]-?: ReturnType<typeof parseIni> }
export async function loadSharedConfigFiles(init: SharedConfigPaths = {}): Promise<SharedConfigData> {
    const [config, credentials] = await Promise.all([
        loadConfigFile(init.config),
        loadCredentialsFile(init.credentials),
    ])

    return {
        credentials,
        config,
    }
}

async function loadConfigFile(configUri?: vscode.Uri): Promise<ReturnType<typeof parseIni>> {
    if (!configUri || !(await SystemUtilities.fileExists(configUri))) {
        return []
    }

    return parseIni(await SystemUtilities.readFile(configUri), configUri)
}

async function loadCredentialsFile(credentialsUri?: vscode.Uri): Promise<ReturnType<typeof parseIni>> {
    if (!credentialsUri || !(await SystemUtilities.fileExists(credentialsUri))) {
        return []
    }

    return parseIni(await SystemUtilities.readFile(credentialsUri), credentialsUri)
}

/**
 * Saves the given profile data to the credentials file.
 */
export async function saveProfileToCredentials(profileName: SectionName, profileData: StaticProfile): Promise<void> {
    if (await profileExists(profileName)) {
        throw new ToolkitError(`Cannot save profile "${profileName}" because it already exists.`, {
            code: 'ProfileAlreadyExists',
        })
    }

    return UserCredentialsUtils.generateCredentialsFile({
        profileName,
        accessKey: profileData.aws_access_key_id,
        secretKey: profileData.aws_secret_access_key,
    })
}

/**
 * Checks if a profile exists in a shared credentials file.
 */
export async function profileExists(profileName: SectionName): Promise<boolean> {
    const existingProfiles = await loadSharedCredentialsProfiles()
    return Object.keys(existingProfiles).includes(profileName)
}

export interface Profile {
    [key: string]: string | undefined
}

export interface ParsedIniData {
    [key: string]: Profile | undefined
}
