/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import admZip from 'adm-zip'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { getIdeProperties } from '../extensionUtilities'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../filesystemUtilities'
import { getLogger } from '../logger'
import { HttpResourceFetcher } from '../resourcefetcher/httpResourceFetcher'
import { ChildProcess } from '../utilities/childProcess'

import * as nls from 'vscode-nls'
import { Timeout, CancellationError } from './timeoutUtils'
import { showMessageWithCancel } from './messages'
import { DevSettings } from '../settings'
import { telemetry } from '../telemetry/telemetry'
import { Result, ToolId } from '../telemetry/telemetry'
import { openUrl } from './vsCodeUtils'
const localize = nls.loadMessageBundle()

const msgDownloading = localize('AWS.installProgress.downloading', 'downloading...')
const msgInstallingLocal = localize('AWS.installProgress.installingLocal', 'installing local copy...')

export class InstallerError extends Error {}
export class InvalidPlatformError extends Error {}

interface Cli {
    command: {
        unix: string
        windows: string
    }
    source: {
        macos: string
        windows: string
        linux: string
    }
    manualInstallLink: string
    name: string
}

type AwsClis = Extract<ToolId, 'session-manager-plugin'>

/**
 * CLIs and their full filenames and download paths for their respective OSes
 * TODO: Add SAM? Other CLIs?
 */
export const awsClis: { [cli in AwsClis]: Cli } = {
    'session-manager-plugin': {
        command: {
            unix: path.join('sessionmanagerplugin', 'bin', 'session-manager-plugin'),
            windows: path.join('sessionmanagerplugin', 'bin', 'session-manager-plugin.exe'),
        },
        source: {
            // use pkg: zip is unsigned
            macos: 'https://s3.amazonaws.com/session-manager-downloads/plugin/latest/mac/session-manager-plugin.pkg',
            windows:
                'https://session-manager-downloads.s3.amazonaws.com/plugin/latest/windows/SessionManagerPlugin.zip',
            linux: 'https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb',
        },
        name: 'Session Manager Plugin',
        manualInstallLink:
            'https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html',
    },
}

/**
 * Installs a selected CLI: wraps confirmation, cleanup, and telemetry logic.
 * @param cli CLI to install
 * @param confirmBefore Prompt before starting install?
 * @returns CLI Path
 */
export async function installCli(cli: AwsClis, confirm: boolean): Promise<string | never> {
    const cliToInstall = awsClis[cli]
    if (!cliToInstall) {
        throw new InstallerError(`Invalid not found for CLI: ${cli}`)
    }
    let result: Result = 'Succeeded'

    let tempDir: string | undefined
    const manualInstall = localize('AWS.cli.manualInstall', 'Install manually...')
    try {
        const install = localize('AWS.generic.install', 'Install')
        const selection = !confirm
            ? install
            : await vscode.window.showInformationMessage(
                  localize(
                      'AWS.cli.installCliPrompt',
                      '{0} could not find {1} CLI. Install a local copy?',
                      localize('AWS.channel.aws.toolkit', '{0} Toolkit', getIdeProperties().company),
                      cliToInstall.name
                  ),
                  install,
                  manualInstall
              )

        if (selection !== install) {
            if (selection === manualInstall) {
                void openUrl(vscode.Uri.parse(cliToInstall.manualInstallLink))
            }
            throw new CancellationError('user')
        }

        const timeout = new Timeout(600000)
        const progress = await showMessageWithCancel(
            localize('AWS.cli.installProgress', 'Installing: {0} CLI', cliToInstall.name),
            timeout
        )

        tempDir = await makeTemporaryToolkitFolder()
        let cliPath: string
        try {
            switch (cli) {
                case 'session-manager-plugin':
                    cliPath = await installSsmCli(tempDir, progress, timeout)
                    break
                default:
                    throw new InstallerError(`Invalid not found for CLI: ${cli}`)
            }
        } finally {
            timeout.dispose()
        }
        // validate
        if (!(await hasCliCommand(cliToInstall, false))) {
            throw new InstallerError('Could not verify installed CLIs')
        }

        return cliPath
    } catch (err) {
        if (CancellationError.isUserCancelled(err)) {
            result = 'Cancelled'
            getLogger().info(`Cancelled installation for: ${cli}`)
            throw err
        }

        result = 'Failed'

        void vscode.window
            .showErrorMessage(
                localize('AWS.cli.failedInstall', 'Installation of the {0} CLI failed.', cliToInstall.name),
                manualInstall
            )
            .then(button => {
                if (button === manualInstall) {
                    void openUrl(vscode.Uri.parse(cliToInstall.manualInstallLink))
                }
            })

        throw err
    } finally {
        if (tempDir) {
            getLogger().info('Cleaning up installer...')
            // nonblocking: use `then`
            tryRemoveFolder(tempDir).then(
                success => {
                    if (success) {
                        getLogger().info('Removed installer.')
                    } else {
                        getLogger().warn(`installCli: failed to clean up temp directory: ${tempDir}`)
                    }
                },
                e => {
                    getLogger().error('installCli: tryRemoveFolder failed: %s', (e as Error).message)
                }
            )
        }

        telemetry.aws_toolInstallation.emit({ result, toolId: cli })
    }
}

/**
 * Returns a path to a runnable CLI. Returns global path, local path, or undefined in that order.
 * @param cli CLI to detect
 * @returns Executable path, or undefined if not available
 */
export async function getCliCommand(cli: Cli): Promise<string | undefined> {
    const globalCommand = await hasCliCommand(cli, true)

    return globalCommand ?? (await hasCliCommand(cli, false))
}

/**
 * Returns whether or not a command is accessible on the user's $PATH
 * @param command CLI Command name
 */
async function hasCliCommand(cli: Cli, global: boolean): Promise<string | undefined> {
    const command = global ? path.parse(getOsCommand(cli)).base : path.join(getToolkitLocalCliPath(), getOsCommand(cli))
    const result = await new ChildProcess(command, ['--version']).run()

    return result.exitCode === 0 ? command : undefined
}

function getOsCommand(cli: Cli): string {
    return process.platform === 'win32' ? cli.command.windows : cli.command.unix
}

function getOsCliSource(cli: Cli): string {
    switch (process.platform) {
        case 'win32':
            return cli.source.windows
        case 'darwin':
            return cli.source.macos
        case 'linux':
            return cli.source.linux
        default:
            throw new InvalidPlatformError(`Platform ${process.platform} is not supported for CLI autoinstallation.`)
    }
}

async function downloadCliSource(cli: Cli, tempDir: string, timeout: Timeout): Promise<string> {
    const installerSource = getOsCliSource(cli)
    const destinationFile = path.join(tempDir, path.parse(getOsCliSource(cli)).base)
    const fetcher = new HttpResourceFetcher(installerSource, { showUrl: true, timeout })
    getLogger().info(`Downloading installer from ${installerSource}...`)
    await fetcher.get(destinationFile)

    return destinationFile
}

function getToolkitCliDir(): string {
    return path.join(globals.context.globalStorageUri.fsPath, 'tools')
}

/**
 * Gets the toolkit local CLI path
 * Instantiated as a function instead of a const to prevent being called before `ext.context` is set
 */
function getToolkitLocalCliPath(): string {
    return path.join(getToolkitCliDir(), 'Amazon')
}

function handleError<T extends Promise<unknown>>(promise: T): T {
    return promise.catch<never>(err => {
        if (
            !(err instanceof CancellationError || err instanceof InstallerError || err instanceof InvalidPlatformError)
        ) {
            throw new InstallerError((err as Error).message)
        }
        throw err
    }) as T
}

async function installSsmCli(
    tempDir: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    timeout: Timeout
): Promise<string> {
    progress.report({ message: msgDownloading })

    const ssmInstaller = await downloadCliSource(awsClis['session-manager-plugin'], tempDir, timeout)
    const outDir = path.join(getToolkitLocalCliPath(), 'sessionmanagerplugin')
    const finalPath = path.join(getToolkitLocalCliPath(), getOsCommand(awsClis['session-manager-plugin']))
    const TimedProcess = ChildProcess.extend({ timeout, rejectOnError: true, rejectOnErrorCode: true })

    getLogger('channel').info(`Installing SSM CLI from ${ssmInstaller} to ${outDir}...`)
    progress.report({ message: msgInstallingLocal })

    return handleError(install())

    async function install() {
        switch (process.platform) {
            case 'darwin':
                return installOnMac()
            case 'win32':
                return installOnWindows()
            case 'linux':
                return installOnLinux()
            default:
                throw new InvalidPlatformError(
                    `Platform ${process.platform} is not supported for CLI autoinstallation.`
                )
        }
    }

    async function installOnMac() {
        const tempPath = path.join(tempDir, 'tmp')
        const pkgArgs = ['--expand', 'session-manager-plugin.pkg', tempPath]
        const tarArgs = ['-xzf', path.join(tempPath, 'Payload')]
        await new TimedProcess('pkgutil', pkgArgs).run({ spawnOptions: { cwd: tempDir } })
        await new TimedProcess('tar', tarArgs).run({ spawnOptions: { cwd: tempPath } })

        fs.copySync(path.join(tempPath, 'usr', 'local', 'sessionmanagerplugin'), outDir, {
            recursive: true,
        })

        return finalPath
    }

    async function installOnWindows() {
        new admZip(ssmInstaller).extractAllTo(tempDir, true)
        const secondZip = path.join(tempDir, 'package.zip')
        new admZip(secondZip).extractAllTo(outDir, true)

        return finalPath
    }

    async function installOnLinux() {
        const ssmDir = path.dirname(ssmInstaller)
        // extract deb file (using ar) to ssmInstaller dir
        await new TimedProcess('ar', ['-x', ssmInstaller]).run({ spawnOptions: { cwd: ssmDir } })
        // extract data.tar.gz to CLI dir
        const tarArgs = ['-xzf', path.join(ssmDir, 'data.tar.gz')]
        await new TimedProcess('tar', tarArgs).run({ spawnOptions: { cwd: ssmDir } }),
            fs.mkdirSync(outDir, { recursive: true })
        fs.copySync(path.join(ssmDir, 'usr', 'local', 'sessionmanagerplugin'), outDir, {
            recursive: true,
        })

        return finalPath
    }
}

/**
 * @throws {@link CancellationError} if the install times out or the user cancels
 */
export async function getOrInstallCli(cli: AwsClis, confirm: boolean): Promise<string> {
    if (DevSettings.instance.get('forceInstallTools', false)) {
        return installCli(cli, confirm)
    } else {
        return (await getCliCommand(awsClis[cli])) ?? installCli(cli, confirm)
    }
}

// TODO: uncomment for AWS CLI installation

/**
 * TODO: AWS CLI install on Linux requires sudo!!!
 */
// async function installAwsCli(
//     tempDir: string,
//     progress: vscode.Progress<{ message?: string; increment?: number }>
// ): Promise<string> {
//     progress.report({ message: msgDownloading })
//     const awsInstaller = await downloadCliSource(AWS_CLIS.aws, tempDir)
//     fs.chmodSync(awsInstaller, 0o700)

//     getLogger('channel').info(`Installing AWS CLI from ${awsInstaller} to ${getToolkitCliDir()}...`)
//     progress.report({ message: msgInstallingLocal })
//     switch (process.platform) {
//         case 'win32': {
//             return await installToolkitLocalMsi(awsInstaller)
//         }
//         case 'darwin': {
//             // edit config file: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2-mac.html#cliv2-mac-install-cmd-current-user
//             const xmlPath = path.join(tempDir, 'choices.xml')
//             fs.writeFileSync(
//                 xmlPath,
//                 `<?xml version="1.0" encoding="UTF-8"?>
//             <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
//             <plist version="1.0">
//                 <array>
//                 <dict>
//                     <key>choiceAttribute</key>
//                     <string>customLocation</string>
//                     <key>attributeSetting</key>
//                     <string>${getToolkitLocalCliPath()}</string>
//                     <key>choiceIdentifier</key>
//                     <string>default</string>
//                 </dict>
//                 </array>
//             </plist>`
//             )
//             // install
//             return await installToolkitLocalPkg(
//                 awsInstaller,
//                 '--target',
//                 'CurrentUserHomeDirectory',
//                 '--applyChoiceChangesXML',
//                 xmlPath
//             )
//         }
//         case 'linux': {
//             return await installToolkitLocalLinuxAwsCli(awsInstaller)
//         }
//         default: {
//             throw new InvalidPlatformError(`Unsupported platform for CLI installation: ${process.platform}`)
//         }
//     }
// }

// async function installToolkitLocalMsi(msiPath: string): Promise<string> {
//     if (process.platform !== 'win32') {
//         throw new InvalidPlatformError(`Cannot install MSI files on operating system: ${process.platform}`)
//     }
//     const result = await new ChildProcess(
//         true,
//         'msiexec',
//         undefined,
//         '/a',
//         msiPath,
//         '/quiet',
//         // use base dir: installer installs to ./Amazon/AWSCLIV2
//         `TARGETDIR=${vscode.Uri.file(getToolkitCliDir()).fsPath}`
//     ).run()
//     if (result.exitCode !== 0) {
//         throw new InstallerError(`Installation of MSI file ${msiPath} failed: Error Code ${result.exitCode}`)
//     }

//     return path.join(getToolkitCliDir(), getOsCommand(AWS_CLIS.aws))
// }

// async function installToolkitLocalPkg(pkgPath: string, ...args: string[]): Promise<string> {
//     if (process.platform !== 'darwin') {
//         throw new InvalidPlatformError(`Cannot install pkg files on operating system: ${process.platform}`)
//     }
//     const result = await new ChildProcess(true, 'installer', undefined, '--pkg', pkgPath, ...args).run()
//     if (result.exitCode !== 0) {
//         throw new InstallerError(`Installation of PKG file ${pkgPath} failed: Error Code ${result.exitCode}`)
//     }

//     return path.join(getToolkitCliDir(), getOsCommand(AWS_CLIS.aws))
// }

/**
 * TODO: THIS REQUIRES SUDO!!! Potentially drop support or look into adding; unsure how we would handle having to input a password.
 */
// async function installToolkitLocalLinuxAwsCli(archivePath: string): Promise<string> {
//     if (process.platform !== 'linux') {
//         throw new InvalidPlatformError(`Cannot use Linux installer on operating system: ${process.platform}`)
//     }
//     const dirname = path.join(path.parse(archivePath).dir, path.parse(archivePath).name)
//     const installDir = path.join(getToolkitCliDir(), 'Amazon', 'AWSCLIV2')
//     new admZip(archivePath).extractAllTo(dirname, true)
//     const result = await new ChildProcess(
//         true,
//         'sh',
//         undefined,
//         path.join(dirname, 'aws', 'install'),
//         '-i',
//         installDir,
//         '-b',
//         installDir
//     ).run()
//     if (result.exitCode !== 0) {
//         throw new InstallerError(
//             `Installation of Linux CLI archive ${archivePath} failed: Error Code ${result.exitCode}`
//         )
//     }

//     return path.join(getToolkitCliDir(), getOsCommand(AWS_CLIS.aws))
// }

// export async function hardLinkToCliDir(dir: string, command: Cli): Promise<void> {
//     const existingPath = path.join(dir, getOsCommand(command))
//     const newPath = getCliPath(command)
//     return new Promise((resolve, reject) => {
//         getLogger().debug(`Attempting to hard link ${existingPath} to ${newPath}...`)
//         fs.link(existingPath, newPath, err => {
//             if (err) {
//                 const message = `Toolkit could not create a hard link for ${existingPath} to ${newPath}`
//                 getLogger().error(`${message}: %s`, err)
//                 reject(new InstallerError(message))
//             }
//             resolve()
//         })
//     })
// }
