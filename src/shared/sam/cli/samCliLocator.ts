/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { EnvironmentVariables } from '../../environmentVariables'
import * as filesystemUtilities from '../../filesystemUtilities'
import { getLogger, Logger } from '../../logger'
import { SamCliInfoInvocation } from './samCliInfo'
import { DefaultSamCliValidator, SamCliValidatorContext, SamCliVersionValidation } from './samCliValidator'
import { SystemUtilities } from '../../systemUtilities'
import { PerfLog } from '../../logger/logger'

export class SamCliLocationProvider {
    private static samCliLocator: BaseSamCliLocator | undefined
    protected static cachedSamLocation: { path: string; version: string } | undefined

    /** Checks that the given `sam` actually works by invoking `sam --version`. */
    private static async isValidSamLocation(samPath: string) {
        return await SystemUtilities.tryRun(samPath, ['--version'], 'no', 'SAM CLI')
    }

    /**
     * Gets the last-found `sam` location, or searches the system if a working
     * `sam` wasn't previously found and cached.
     */
    public async getLocation(forceSearch?: boolean): Promise<{ path: string; version: string } | undefined> {
        const perflog = new PerfLog('samCliLocator: getLocation')
        const cachedLoc = forceSearch ? undefined : SamCliLocationProvider.cachedSamLocation

        // Avoid searching the system for `sam` (especially slow on Windows).
        if (cachedLoc && (await SamCliLocationProvider.isValidSamLocation(cachedLoc.path))) {
            perflog.done()
            return cachedLoc
        }

        SamCliLocationProvider.cachedSamLocation = await SamCliLocationProvider.getSamCliLocator().getLocation()
        perflog.done()
        return SamCliLocationProvider.cachedSamLocation
    }

    public static getSamCliLocator(): SamCliLocationProvider {
        if (!SamCliLocationProvider.samCliLocator) {
            if (process.platform === 'win32') {
                SamCliLocationProvider.samCliLocator = new WindowsSamCliLocator()
            } else {
                SamCliLocationProvider.samCliLocator = new UnixSamCliLocator()
            }
        }

        return SamCliLocationProvider.samCliLocator
    }
}

abstract class BaseSamCliLocator {
    /** Indicates that findFileInFolders() returned at least once. */
    static didSearch = false
    protected readonly logger: Logger = getLogger()

    public constructor() {
        this.verifyOs()
    }

    public async getLocation() {
        let location = await this.findFileInFolders(this.getExecutableFilenames(), this.getExecutableFolders())

        if (!location?.version) {
            location = await this.getSystemPathLocation()
        }

        return location
    }

    protected abstract verifyOs(): void
    protected abstract getExecutableFilenames(): string[]
    protected abstract getExecutableFolders(): string[]

    /**
     * Searches for `sam` in various places and the $PATH.
     *
     * If only a broken `sam` is found it is returned with an empty `version`.
     */
    protected async findFileInFolders(files: string[], folders: string[]) {
        // Keep the first found "sam" even if it is broken.
        // This allows us to give a better message than "not found".
        let brokenSam: string | undefined

        const fullPaths: string[] = files
            .map(file => folders.filter(folder => !!folder).map(folder => path.join(folder, file)))
            .reduce((accumulator, paths) => {
                accumulator.push(...paths)

                return accumulator
            })

        for (const fullPath of fullPaths) {
            if (!BaseSamCliLocator.didSearch) {
                this.logger.verbose(`samCliLocator: searching in: ${fullPath}`)
            }
            const context: SamCliValidatorContext = {
                samCliLocation: async () => fullPath,
                getSamCliInfo: async () => new SamCliInfoInvocation(fullPath).execute(),
            }
            const validator = new DefaultSamCliValidator(context)
            if (await filesystemUtilities.fileOrFolderExists(fullPath)) {
                try {
                    const validationResult = await validator.getVersionValidatorResult()
                    if (validationResult.validation === SamCliVersionValidation.Valid) {
                        BaseSamCliLocator.didSearch = true
                        return { path: fullPath, version: validationResult.version }
                    }
                    this.logger.warn(
                        `samCliLocator: found invalid SAM CLI (${validationResult.validation}): ${fullPath}`
                    )
                    brokenSam = brokenSam ?? fullPath
                } catch (e) {
                    const err = e as Error
                    this.logger.error('samCliLocator failed: %s', err.message)
                }
            }
        }

        BaseSamCliLocator.didSearch = true
        return brokenSam ? { path: brokenSam, version: '' } : undefined
    }

    /**
     * Searches for `getExecutableFilenames()` in `$PATH` and returns the first
     * path found on the filesystem, if any.
     */
    private async getSystemPathLocation() {
        const envVars = process.env as EnvironmentVariables

        if (envVars.PATH) {
            const systemPaths: string[] = envVars.PATH.split(path.delimiter).filter(folder => !!folder)

            return await this.findFileInFolders(this.getExecutableFilenames(), systemPaths)
        }

        return undefined
    }
}

class WindowsSamCliLocator extends BaseSamCliLocator {
    // Do not access locationPaths directly. Use getExecutableFolders()
    private static locationPaths: string[] | undefined

    private static readonly executableFilenames: string[] = ['sam.cmd', 'sam.exe']

    public constructor() {
        super()
    }

    protected verifyOs(): void {
        if (process.platform !== 'win32') {
            throw new Error('Wrong platform')
        }
    }

    protected getExecutableFilenames(): string[] {
        return WindowsSamCliLocator.executableFilenames
    }

    protected getExecutableFolders(): string[] {
        if (!WindowsSamCliLocator.locationPaths) {
            WindowsSamCliLocator.locationPaths = []

            const envVars = process.env as EnvironmentVariables

            const programFiles = envVars.PROGRAMFILES
            if (programFiles) {
                WindowsSamCliLocator.locationPaths.push(String.raw`${programFiles}\Amazon\AWSSAMCLI\bin`)
            }

            const programFilesX86 = envVars['PROGRAMFILES(X86)']
            if (programFilesX86) {
                WindowsSamCliLocator.locationPaths.push(String.raw`${programFilesX86}\Amazon\AWSSAMCLI\bin`)
            }
        }

        return WindowsSamCliLocator.locationPaths
    }
}

class UnixSamCliLocator extends BaseSamCliLocator {
    private static readonly locationPaths: string[] = [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        // WEIRD BUT TRUE: brew installs to /home/linuxbrew/.linuxbrew if
        // possible, else to ~/.linuxbrew.  https://docs.brew.sh/Homebrew-on-Linux
        '/home/linuxbrew/.linuxbrew/bin',
        `${process.env.HOME}/.linuxbrew/bin`,
    ]

    private static readonly executableFilenames: string[] = ['sam']

    public constructor() {
        super()
    }

    protected verifyOs(): void {
        if (process.platform === 'win32') {
            throw new Error('Wrong platform')
        }
    }

    protected getExecutableFilenames(): string[] {
        return UnixSamCliLocator.executableFilenames
    }

    protected getExecutableFolders(): string[] {
        return UnixSamCliLocator.locationPaths
    }
}
