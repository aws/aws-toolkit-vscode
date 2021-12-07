/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as admZip from 'adm-zip'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { getIdeProperties } from '../extensionUtilities'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../filesystemUtilities'
import { getLogger } from '../logger'
import { HttpResourceFetcher } from '../resourcefetcher/httpResourceFetcher'
import * as telemetry from '../telemetry/telemetry'
import { ChildProcess } from '../utilities/childProcess'
import { Window } from '../vscode/window'

import * as nls from 'vscode-nls'
import { Timeout } from './timeoutUtils'
import { showMessageWithCancel } from './messages'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../settingsConfiguration'
import { extensionSettingsPrefix } from '../constants'
import globals from '../extensionGlobals'
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

type AwsClis = Extract<telemetry.ToolId, 'session-manager-plugin'>

/**
 * CLIs and their full filenames and download paths for their respective OSes
 * TODO: Add SAM? Other CLIs?
 */
export const AWS_CLIS: { [cli in AwsClis]: Cli } = {
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
export async function installCli(
    cli: AwsClis,
    confirm: boolean,
    window: Window = Window.vscode()
): Promise<string | undefined> {
    const cliToInstall = AWS_CLIS[cli]
    if (!cliToInstall) {
        throw new InstallerError(`Invalid not found for CLI: ${cli}`)
    }
    let result: telemetry.Result = 'Succeeded'

    let tempDir: string | undefined
    const manualInstall = localize('AWS.cli.manualInstall', 'Install manually...')
    try {
        const install = localize('AWS.generic.install', 'Install')
        const selection = !confirm
            ? install
            : await window.showInformationMessage(
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
                vscode.env.openExternal(vscode.Uri.parse(cliToInstall.manualInstallLink))
            }
            result = 'Cancelled'

            return undefined
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
                    cliPath = await installSsmCli(tempDir, progress)
                    break
                default:
                    throw new InstallerError(`Invalid not found for CLI: ${cli}`)
            }
        } finally {
            timeout.complete()
        }
        // validate
        if (!(await hasCliCommand(cliToInstall, false))) {
            throw new InstallerError('Could not verify installed CLIs')
        }

        return cliPath
    } catch (err) {
        result = 'Failed'

        window
            .showErrorMessage(
                localize('AWS.cli.failedInstall', 'Installation of the {0} CLI failed.', cliToInstall.name),
                manualInstall
            )
            .then(button => {
                if (button === manualInstall) {
                    vscode.env.openExternal(vscode.Uri.parse(cliToInstall.manualInstallLink))
                }
            })

        throw err
    } finally {
        if (tempDir) {
            getLogger().info('Cleaning up installer...')
            // nonblocking: use `then`
            tryRemoveFolder(tempDir).then(success => {
                if (success) {
                    getLogger().info('Removed installer.')
                } else {
                    getLogger().error(`Failed to clean up installer in temp directory: ${tempDir}`)
                }
            })
        }

        telemetry.recordAwsToolInstallation({
            result,
            toolId: cli,
        })
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

async function downloadCliSource(cli: Cli, tempDir: string): Promise<string> {
    const installerSource = getOsCliSource(cli)
    const destinationFile = path.join(tempDir, path.parse(getOsCliSource(cli)).base)
    const fetcher = new HttpResourceFetcher(installerSource, { showUrl: true })
    getLogger().info(`Downloading installer from ${installerSource}...`)
    await fetcher.get(destinationFile).done

    return destinationFile
}

function getToolkitCliDir(): string {
    return path.join(globals.context.globalStoragePath, 'tools')
}

/**
 * Gets the toolkit local CLI path
 * Instantiated as a function instead of a const to prevent being called before `ext.context` is set
 */
function getToolkitLocalCliPath(): string {
    return path.join(getToolkitCliDir(), 'Amazon')
}

async function installSsmCli(
    tempDir: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<string> {
    progress.report({ message: msgDownloading })
    const ssmInstaller = await downloadCliSource(AWS_CLIS['session-manager-plugin']!, tempDir)
    const outDir = path.join(getToolkitLocalCliPath(), 'sessionmanagerplugin')
    const finalPath = path.join(getToolkitLocalCliPath(), getOsCommand(AWS_CLIS['session-manager-plugin']!))

    getLogger('channel').info(`Installing SSM CLI from ${ssmInstaller} to ${outDir}...`)
    progress.report({ message: msgInstallingLocal })
    switch (process.platform) {
        case 'darwin': {
            return new Promise<string>(async (resolve, reject) => {
                try {
                    const tempPath = path.join(tempDir, 'tmp')
                    const pkgArgs = ['--expand', 'session-manager-plugin.pkg', tempPath]
                    const tarArgs = ['-xzf', path.join(tempPath, 'Payload')]
                    await new ChildProcess('pkgutil', pkgArgs, { spawnOptions: { cwd: tempDir } }).run()
                    await new ChildProcess('tar', tarArgs, { spawnOptions: { cwd: tempPath } }).run()

                    fs.copySync(path.join(tempPath, 'usr', 'local', 'sessionmanagerplugin'), outDir, {
                        recursive: true,
                    })

                    resolve(finalPath)
                } catch (err) {
                    reject(new InstallerError((err as Error).message))
                }
            })
        }
        case 'win32': {
            return new Promise<string>(async (resolve, reject) => {
                try {
                    new admZip(ssmInstaller).extractAllTo(tempDir, true)
                    const secondZip = path.join(tempDir, 'package.zip')
                    new admZip(secondZip).extractAllTo(outDir, true)

                    resolve(finalPath)
                } catch (err) {
                    if (err) {
                        reject(new InstallerError((err as Error).message))
                    }
                }
            })
        }
        case 'linux': {
            return new Promise<string>(async (resolve, reject) => {
                // extract deb file (using ar) to ssmInstaller dir
                await new ChildProcess('ar', ['-x', ssmInstaller], {
                    spawnOptions: { cwd: path.dirname(ssmInstaller) },
                }).run()
                // extract data.tar.gz to CLI dir
                const tarArgs = ['-xzf', path.join(path.dirname(ssmInstaller), 'data.tar.gz')]
                await new ChildProcess('tar', tarArgs, { spawnOptions: { cwd: path.dirname(ssmInstaller) } }).run(),
                    fs.mkdirSync(outDir, { recursive: true })
                fs.copySync(path.join(path.dirname(ssmInstaller), 'usr', 'local', 'sessionmanagerplugin'), outDir, {
                    recursive: true,
                })

                resolve(finalPath)
            })
        }
        default: {
            throw new InvalidPlatformError(`Platform ${process.platform} is not supported for CLI autoinstallation.`)
        }
    }
}

export async function getOrInstallCli(
    cli: AwsClis,
    confirm: boolean,
    window: Window = Window.vscode(),
    settings: SettingsConfiguration = new DefaultSettingsConfiguration(extensionSettingsPrefix)
): Promise<string | undefined> {
    let cliCommand: string | undefined
    if (!settings.readDevSetting<boolean>('aws.dev.forceInstallTools', 'boolean', true)) {
        cliCommand = await getCliCommand(AWS_CLIS[cli])
    }

    if (!cliCommand) {
        cliCommand = await installCli(cli, confirm, window)
    }
    return cliCommand
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
//                 getLogger().error(`${message}: %O`, err)
//                 reject(new InstallerError(message))
//             }
//             resolve()
//         })
//     })
// }
