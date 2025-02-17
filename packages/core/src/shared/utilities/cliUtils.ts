/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import admZip from 'adm-zip'
import * as path from 'path'
import * as vscode from 'vscode'
import { getIdeProperties } from '../extensionUtilities'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../filesystemUtilities'
import { getLogger } from '../logger/logger'
import { HttpResourceFetcher } from '../resourcefetcher/node/httpResourceFetcher'
import { ChildProcess } from './processUtils'

import * as nls from 'vscode-nls'
import { Timeout, CancellationError } from './timeoutUtils'
import { showMessageWithCancel } from './messages'
import { DevSettings } from '../settings'
import { telemetry } from '../telemetry/telemetry'
import { Result, ToolId } from '../telemetry/telemetry'
import { openUrl } from './vsCodeUtils'
import fs from '../fs/fs'
import { mergeResolvedShellPath } from '../env/resolveEnv'
const localize = nls.loadMessageBundle()

const msgDownloading = localize('AWS.installProgress.downloading', 'downloading...')
const msgInstallingLocal = localize('AWS.installProgress.installingLocal', 'installing local copy...')

export class InstallerError extends Error {}
export class InvalidPlatformError extends Error {}

interface Cli {
    command: {
        unix?: Array<string>
        windows?: Array<string>
    }
    source: {
        macos?: {
            x86?: string
            arm?: string
        }
        windows?: {
            x86?: string
            arm?: string
        }
        linux?: {
            x86?: string
            arm?: string
        }
    }
    manualInstallLink: string
    name: string
    exec?: string
}

export type AwsClis = Extract<ToolId, 'session-manager-plugin' | 'aws-cli' | 'sam-cli' | 'docker'>

/**
 * CLIs and their full filenames and download paths for their respective OSes
 * TODO: Add SAM? Other CLIs?
 */
export const awsClis: { [cli in AwsClis]: Cli } = {
    'session-manager-plugin': {
        command: {
            unix: [path.join('sessionmanagerplugin', 'bin', 'session-manager-plugin')],
            windows: [path.join('sessionmanagerplugin', 'bin', 'session-manager-plugin.exe')],
        },
        source: {
            // use pkg: zip is unsigned
            macos: {
                x86: 'https://s3.amazonaws.com/session-manager-downloads/plugin/latest/mac/session-manager-plugin.pkg',
                arm: 'https://s3.amazonaws.com/session-manager-downloads/plugin/latest/mac_arm64/session-manager-plugin.pkg',
            },
            windows: {
                x86: 'https://session-manager-downloads.s3.amazonaws.com/plugin/latest/windows/SessionManagerPlugin.zip',
            },
            linux: {
                x86: 'https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb',
                arm: 'https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_arm64/session-manager-plugin.deb',
            },
        },
        name: 'Session Manager Plugin',
        manualInstallLink:
            'https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html',
        exec: 'session-manager-plugin',
    },
    'sam-cli': {
        command: {
            windows: [
                'sam.cmd',
                'sam.exe',
                path.join('C:', 'Program Files', 'Amazon', 'AWSSAMCLI', 'bin', 'sam.cmd'),
                path.join('C:', 'Program Files', 'Amazon', 'AWSSAMCLI', 'bin', 'sam.exe'),
                path.join('C:', 'Program Files (x86)', 'Amazon', 'AWSSAMCLI', 'bin', 'sam.cmd'),
                path.join('C:', 'Program Files (x86)', 'Amazon', 'AWSSAMCLI', 'bin', 'sam.exe'),
            ],
            unix: [
                'sam',
                path.join('/', 'usr', 'bin', 'sam'),
                path.join('/', 'usr', 'local', 'bin', 'sam'),
                path.join('/', 'opt', 'homebrew', 'bin', 'sam'),
                path.join('/', 'home', 'linuxbrew', '.linuxbrew', 'bin', 'sam'),
                path.join('${process.env.HOME}', '.linuxbrew', 'bin', 'sam'),
            ],
        },
        source: {
            macos: {
                x86: 'https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-macos-x86_64.pkg',
                arm: 'https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-macos-arm64.pkg',
            },
            windows: {
                x86: 'https://github.com/aws/aws-sam-cli/releases/latest/download/AWS_SAM_CLI_64_PY3.msi',
            },
        },
        name: 'AWS SAM',
        manualInstallLink:
            'https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html',
        exec: 'sam',
    },
    'aws-cli': {
        command: {
            windows: [
                'aws.exe',
                path.join('C:', 'Program Files', 'Amazon', 'AWSCLIV2', 'bin', 'aws.exe'),
                path.join('C:', 'Program Files (x86)', 'Amazon', 'AWSCLIV2', 'bin', 'aws.exe'),
            ],
            unix: ['aws', path.join('/', 'usr', 'bin', 'aws'), path.join('/', 'usr', 'local', 'bin', 'aws')],
        },
        source: {
            macos: {
                x86: 'https://awscli.amazonaws.com/AWSCLIV2.pkg',
                arm: 'https://awscli.amazonaws.com/AWSCLIV2.pkg',
            },
            windows: {
                x86: 'https://awscli.amazonaws.com/AWSCLIV2.msi',
                arm: 'https://awscli.amazonaws.com/AWSCLIV2.msi',
            },
        },
        name: 'AWS',
        manualInstallLink: 'https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html',
        exec: 'aws',
    },
    docker: {
        command: {
            windows: [
                'docker.exe',
                path.join('C:', 'Program Files', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
                path.join('C:', 'Program Files (x86)', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
            ],
            unix: [
                'docker',
                path.join('/', 'usr', 'bin', 'docker'),
                path.join('/', 'usr', 'local', 'bin', 'docker'),
                path.join('/', 'Applications', 'Docker.app', 'Contents', 'Resources', 'bin', 'docker'),
            ],
        },
        source: {
            macos: {
                x86: 'https://desktop.docker.com/mac/main/amd64/Docker.dmg',
                arm: 'https://desktop.docker.com/mac/main/arm64/Docker.dmg',
            },
            windows: {
                x86: 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe',
                arm: 'https://desktop.docker.com/win/main/arm64/Docker%20Desktop%20Installer.exe',
            },
        },
        name: 'Docker',
        manualInstallLink: 'https://docs.docker.com/desktop',
        exec: 'docker',
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
    skipPostInstallValidation: boolean = false
): Promise<string | never> {
    const cliToInstall = awsClis[cli]
    if (!cliToInstall) {
        throw new InstallerError(`Invalid not found for CLI: ${cli}`)
    }
    let result: Result = 'Succeeded'
    let reason: string = ''

    let tempDir: string | undefined
    const manualInstall = localize('AWS.cli.manualInstall', 'Install manually...')

    try {
        // get install uri to see if auto-install is enabled.
        if (!getOsCliSource(awsClis[cli])) {
            // Installer not supported on this platform, direct custoemr to manual install
            const selection = await vscode.window.showInformationMessage(
                localize(
                    'AWS.cli.autoInstallNotSupported',
                    'Auto install of {0} CLI is not supported on your platform',
                    cliToInstall.name
                ),
                manualInstall
            )
            if (selection === manualInstall) {
                void openUrl(vscode.Uri.parse(cliToInstall.manualInstallLink))
            }
            throw new CancellationError('user')
        }

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
        const timeout = new Timeout(20 * 60 * 1000)
        const progress = await showMessageWithCancel(
            localize('AWS.cli.installProgress', 'Installing: {0} CLI', cliToInstall.name),
            timeout
        )

        tempDir = await makeTemporaryToolkitFolder()
        let cliPath: string | undefined
        try {
            switch (cli) {
                case 'session-manager-plugin':
                    cliPath = await installSsmCli(tempDir, progress, timeout)
                    break
                case 'aws-cli':
                case 'sam-cli':
                case 'docker':
                    cliPath = await installGui(cli, tempDir, progress, timeout)
                    break
                default:
                    throw new InstallerError(`Invalid not found for CLI: ${cli}`)
            }
        } finally {
            timeout.dispose()
        }

        if (skipPostInstallValidation) {
            return cliToInstall.name
        }
        // validate
        if (cli === 'session-manager-plugin') {
            if (!cliPath || !(await hasCliCommand(cliToInstall, false))) {
                throw new InstallerError('Could not verify installed CLIs')
            }
        } else {
            if (!cliPath) {
                // install success but wrong exit code
                const toolPath = await hasCliCommand(cliToInstall, true)
                if (!toolPath) {
                    throw new InstallerError('Could not verify installed CLIs')
                }
                return toolPath
            }
        }

        return cliPath
    } catch (err) {
        const error = err as Error
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
            .then((button) => {
                if (button === manualInstall) {
                    void openUrl(vscode.Uri.parse(cliToInstall.manualInstallLink))
                }
            })
        reason = error.message
        throw err
    } finally {
        if (tempDir) {
            getLogger().info('Cleaning up installer...')
            // nonblocking: use `then`
            tryRemoveFolder(tempDir).then(
                (success) => {
                    if (success) {
                        getLogger().info('Removed installer.')
                    } else {
                        getLogger().warn(`installCli: failed to clean up temp directory: ${tempDir}`)
                    }
                },
                (e) => {
                    getLogger().error('installCli: tryRemoveFolder failed: %s', (e as Error).message)
                }
            )
        }
        getLogger().info(`${cli} installation: ${result}`)
        telemetry.aws_toolInstallation.emit({ result, reason, toolId: cli })
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
    const commands = getOsCommands(cli)
    for (const command of commands ? commands : []) {
        const cmd = global ? command : path.join(getToolkitLocalCliPath(), command)
        const result = await new ChildProcess(cmd, ['--version']).run({
            spawnOptions: { env: await mergeResolvedShellPath(process.env) },
        })
        if (result.exitCode === 0) {
            return cmd
        }
    }
}

function getOsCommands(cli: Cli): Array<string> | undefined {
    return process.platform === 'win32' ? cli.command.windows : cli.command.unix
}

function getOsArch(): string {
    switch (process.arch) {
        case 'x32':
        case 'x64':
            return 'x86'
        case 'arm':
        case 'arm64':
            return 'arm'
        default:
            return process.arch
    }
}

// return undefined if customer platform not supported
function getOsCliSource(cli: Cli): string | undefined {
    switch (process.platform) {
        case 'win32':
            return getOsArch() === 'x86' ? cli.source.windows?.x86 : cli.source.windows?.arm
        case 'darwin':
            return getOsArch() === 'x86' ? cli.source.macos?.x86 : cli.source.macos?.arm
        case 'linux':
            return getOsArch() === 'x86' ? cli.source.linux?.x86 : cli.source.linux?.arm
        default:
            throw new InvalidPlatformError(`Platform ${process.platform} is not supported for CLI autoinstallation.`)
    }
}

async function downloadCliSource(cli: Cli, tempDir: string, timeout: Timeout): Promise<string | undefined> {
    const installerSource = getOsCliSource(cli)
    if (!installerSource) {
        return
    }
    const destinationFile = path.join(tempDir, path.parse(installerSource).base)
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
    return promise.catch<never>((err) => {
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
    const cmd = getOsCommands(awsClis['session-manager-plugin'])
    if (!cmd || !ssmInstaller) {
        throw new InvalidPlatformError(`Platform ${process.platform} is not supported for CLI autoinstallation.`)
    }
    const finalPath = path.join(getToolkitLocalCliPath(), cmd[0])
    const TimedProcess = ChildProcess.extend({ timeout, rejectOnError: true, rejectOnErrorCode: true })

    getLogger().info(`Installing SSM CLI from ${ssmInstaller} to ${outDir}...`)
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

        await fs.copy(path.join(tempPath, 'usr', 'local', 'sessionmanagerplugin'), outDir)

        return finalPath
    }

    async function installOnWindows() {
        new admZip(ssmInstaller).extractAllTo(tempDir, true)
        const secondZip = path.join(tempDir, 'package.zip')
        new admZip(secondZip).extractAllTo(outDir, true)

        return finalPath
    }

    async function installOnLinux() {
        if (!ssmInstaller) {
            throw new InvalidPlatformError(`Platform ${process.platform} is not supported for CLI autoinstallation.`)
        }
        const ssmDir = path.dirname(ssmInstaller)
        // extract deb file (using ar) to ssmInstaller dir
        await new TimedProcess('ar', ['-x', ssmInstaller]).run({ spawnOptions: { cwd: ssmDir } })
        // extract data.tar.gz to CLI dir
        const tarArgs = ['-xzf', path.join(ssmDir, 'data.tar.gz')]
        await new TimedProcess('tar', tarArgs).run({ spawnOptions: { cwd: ssmDir } }), await fs.mkdir(outDir)
        await fs.copy(path.join(ssmDir, 'usr', 'local', 'sessionmanagerplugin'), outDir)

        return finalPath
    }
}

/**
 *
 * @param cli The cli to install
 * @param tempDir Temp dir to store installer
 * @param progress Progress report
 * @param timeout Timeout for install
 * @returns
 */
async function installGui(
    cli: AwsClis,
    tempDir: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    timeout: Timeout
): Promise<string | undefined> {
    progress.report({ message: msgDownloading })
    const TimedProcess = ChildProcess.extend({ timeout, rejectOnError: true, rejectOnErrorCode: true })

    return handleError(install())

    async function install() {
        const guiInstaller = await downloadCliSource(awsClis[cli], tempDir, timeout)
        progress.report({ message: msgInstallingLocal })
        getLogger().info(`Installing ${cli} from ${guiInstaller}...`)

        if (!guiInstaller) {
            throw new InvalidPlatformError(`Platform ${process.platform} is not supported for CLI autoinstallation.`)
        }
        switch (process.platform) {
            case 'darwin':
                await new TimedProcess('open', [guiInstaller, '-W']).run()
                return await getCliCommand(awsClis[cli])
            case 'win32':
                await new TimedProcess(guiInstaller, []).run()
                return await getCliCommand(awsClis[cli])
            // customer shouldn't reach this point as they will be directed to manual install link in entrypoint.
            default:
                throw new InvalidPlatformError(
                    `Platform ${process.platform} is not supported for CLI autoinstallation.`
                )
        }
    }
}

/**
 * @throws {@link CancellationError} if the install times out or the user cancels
 */
export async function getOrInstallCli(cli: AwsClis, confirm: boolean, popup: boolean = false): Promise<string> {
    // docker will work after restart in windows, and docker MacOS dmg installer will exit on window popup. Ignore checking for Docker
    const skipPostInstallValidation = cli === 'docker'
    if (DevSettings.instance.get('forceInstallTools', false)) {
        return installCli(cli, confirm, skipPostInstallValidation)
    } else {
        const path = await getCliCommand(awsClis[cli])
        // if popup, when tool is detected, show a popup message and return path
        if (path && popup) {
            await showCliFoundPopup(awsClis[cli].name, path)
        }
        return path ?? installCli(cli, confirm, skipPostInstallValidation)
    }
}

export async function showCliFoundPopup(cli: string, path: string) {
    void vscode.window.showInformationMessage(
        localize('AWS.cli.cliFoundPrompt', '{0} is already installed (location: {1})', cli, path)
    )
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

//     getLogger().info(`Installing AWS CLI from ${awsInstaller} to ${getToolkitCliDir()}...`)
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
