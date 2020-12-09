/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { EnvironmentVariables } from '../../environmentVariables'
import * as filesystemUtilities from '../../filesystemUtilities'
import { getLogger, Logger } from '../../logger'

export interface SamCliLocationProvider {
    getLocation(): Promise<string | undefined>
}

export class DefaultSamCliLocationProvider implements SamCliLocationProvider {
    private static SAM_CLI_LOCATOR: BaseSamCliLocator | undefined

    public async getLocation(): Promise<string | undefined> {
        return DefaultSamCliLocationProvider.getSamCliLocator().getLocation()
    }

    public static getSamCliLocator(): SamCliLocationProvider {
        if (!DefaultSamCliLocationProvider.SAM_CLI_LOCATOR) {
            if (process.platform === 'win32') {
                DefaultSamCliLocationProvider.SAM_CLI_LOCATOR = new WindowsSamCliLocator()
            } else {
                DefaultSamCliLocationProvider.SAM_CLI_LOCATOR = new UnixSamCliLocator()
            }
        }

        return DefaultSamCliLocationProvider.SAM_CLI_LOCATOR
    }
}

abstract class BaseSamCliLocator {
    protected readonly logger: Logger = getLogger()

    public constructor() {
        this.verifyOs()
    }

    public async getLocation(): Promise<string | undefined> {
        let location: string | undefined = await this.findFileInFolders(
            this.getExecutableFilenames(),
            this.getExecutableFolders()
        )

        if (!location) {
            location = await this.getSystemPathLocation()
        }

        this.logger.info(`SAM CLI location: ${location}`)

        return location
    }

    protected abstract verifyOs(): void
    protected abstract getExecutableFilenames(): string[]
    protected abstract getExecutableFolders(): string[]

    protected async findFileInFolders(files: string[], folders: string[]): Promise<string | undefined> {
        const fullPaths: string[] = files
            .map(file => folders.filter(folder => !!folder).map(folder => path.join(folder, file)))
            .reduce((accumulator, paths) => {
                accumulator.push(...paths)

                return accumulator
            })

        for (const fullPath of fullPaths) {
            this.logger.verbose(`Searching for SAM CLI in: ${fullPath}`)
            if (await filesystemUtilities.fileExists(fullPath)) {
                return fullPath
            }
        }

        return undefined
    }

    /**
     * Searches for `getExecutableFilenames()` in `$PATH` and returns the first
     * path found on the filesystem, if any.
     */
    private async getSystemPathLocation(): Promise<string | undefined> {
        const envVars = process.env as EnvironmentVariables

        if (envVars.PATH) {
            const systemPaths: string[] = envVars.PATH.split(path.delimiter).filter(folder => !!folder)

            return await this.findFileInFolders(this.getExecutableFilenames(), systemPaths)
        }

        return undefined
    }
}

class WindowsSamCliLocator extends BaseSamCliLocator {
    // Do not access LOCATION_PATHS directly. Use getExecutableFolders()
    private static LOCATION_PATHS: string[] | undefined

    private static readonly EXECUTABLE_FILENAMES: string[] = ['sam.cmd', 'sam.exe']

    public constructor() {
        super()
    }

    protected verifyOs(): void {
        if (process.platform !== 'win32') {
            throw new Error('Wrong platform')
        }
    }

    protected getExecutableFilenames(): string[] {
        return WindowsSamCliLocator.EXECUTABLE_FILENAMES
    }

    protected getExecutableFolders(): string[] {
        if (!WindowsSamCliLocator.LOCATION_PATHS) {
            WindowsSamCliLocator.LOCATION_PATHS = []

            const envVars = process.env as EnvironmentVariables

            const programFiles = envVars.PROGRAMFILES
            if (programFiles) {
                WindowsSamCliLocator.LOCATION_PATHS.push(String.raw`${programFiles}\Amazon\AWSSAMCLI\bin`)
            }

            const programFilesX86 = envVars['PROGRAMFILES(X86)']
            if (programFilesX86) {
                WindowsSamCliLocator.LOCATION_PATHS.push(String.raw`${programFilesX86}\Amazon\AWSSAMCLI\bin`)
            }
        }

        return WindowsSamCliLocator.LOCATION_PATHS
    }
}

class UnixSamCliLocator extends BaseSamCliLocator {
    private static readonly LOCATION_PATHS: string[] = [
        '/usr/local/bin',
        '/usr/bin',
        // WEIRD BUT TRUE: brew installs to /home/linuxbrew/.linuxbrew if
        // possible, else to ~/.linuxbrew.  https://docs.brew.sh/Homebrew-on-Linux
        '/home/linuxbrew/.linuxbrew/bin',
        `${process.env.HOME}/.linuxbrew/bin`,
    ]

    private static readonly EXECUTABLE_FILENAMES: string[] = ['sam']

    public constructor() {
        super()
    }

    protected verifyOs(): void {
        if (process.platform === 'win32') {
            throw new Error('Wrong platform')
        }
    }

    protected getExecutableFilenames(): string[] {
        return UnixSamCliLocator.EXECUTABLE_FILENAMES
    }

    protected getExecutableFolders(): string[] {
        return UnixSamCliLocator.LOCATION_PATHS
    }
}
