/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as path from 'path'
import { fs } from '../../shared/fs/fs'
import { SagemakerConstants } from './explorer/constants'
import { SagemakerStudioNode } from './explorer/sagemakerStudioNode'
import { DomainKeyDelimiter, promptAndApplyExplorerFilter } from './utils'
import { startVscodeRemote } from '../../shared/extensions/ssh'
import { getLogger } from '../../shared/logger/logger'
import { SagemakerSpaceNode, tryRefreshNode } from './explorer/sagemakerSpaceNode'
import { isRemoteWorkspace } from '../../shared/vscode/env'
import _ from 'lodash'
import {
    prepareDevEnvConnection,
    startRemoteViaSageMakerSshKiro,
    tryRemoteConnection,
    useSageMakerSshKiroExtension,
} from './model'
import { ensureSageMakerSshKiroExtension } from './sagemakerSshKiroUtils'
import { preRegisterIdcConnection, buildStudioRemoteConnectUrl, getIdcConnectionStatus } from './credentialMapping'
import { ExtContext } from '../../shared/extensions'
import { SagemakerClient } from '../../shared/clients/sagemaker'
import { AccessDeniedException } from '@amzn/sagemaker-client'
import { ToolkitError, isUserCancelledError } from '../../shared/errors'
import { sleep } from '../../shared/utilities/timeoutUtils'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import {
    ConnectFromRemoteWorkspaceMessage,
    InstanceTypeInsufficientMemory,
    InstanceTypeInsufficientMemoryMessage,
    RemoteAccess,
    RemoteAccessRequiredMessage,
    SpaceStatus,
} from './constants'
import { SagemakerUnifiedStudioSpaceNode } from '../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpaceNode'
import { node } from 'webpack'
import { getDomainUserProfileKey, parseArn } from './utils'

const localize = nls.loadMessageBundle()

export async function filterSpaceAppsByDomainUserProfiles(studioNode: SagemakerStudioNode): Promise<void> {
    if (studioNode.domainUserProfiles.size === 0) {
        // if studioNode has not been expanded, domainUserProfiles will be empty
        // if so, this will attempt to populate domainUserProfiles
        await studioNode.updateChildren()
        if (studioNode.domainUserProfiles.size === 0) {
            getLogger().info(SagemakerConstants.NoSpaceToFilter)
            void vscode.window.showInformationMessage(SagemakerConstants.NoSpaceToFilter)
            return
        }
    }

    // Sort by domain name and user profile
    const sortedDomainUserProfiles = new Map(
        [...studioNode.domainUserProfiles].sort((a, b) => {
            const domainNameA = a[1].domain.DomainName || ''
            const domainNameB = b[1].domain.DomainName || ''

            const [_domainIdA, userProfileA] = a[0].split(DomainKeyDelimiter)
            const [_domainIdB, userProfileB] = b[0].split(DomainKeyDelimiter)

            return domainNameA.localeCompare(domainNameB) || userProfileA.localeCompare(userProfileB)
        })
    )

    const previousSelection = await studioNode.getSelectedDomainUsers()

    // For IdC callers the selection can only ever narrow to profiles bound to their own IdC
    // identity, so offering other profiles in the picker would present choices that are silently
    // discarded. Restrict the options to what the caller actually owns.
    const selectableKeys = studioNode.isIdcCaller()
        ? new Set(await studioNode.getDefaultSelectedDomainUsers())
        : undefined

    const items: (vscode.QuickPickItem & { key: string })[] = []

    for (const [key, userMetadata] of sortedDomainUserProfiles) {
        if (selectableKeys && !selectableKeys.has(key)) {
            continue
        }
        const [_, userProfile] = key.split(DomainKeyDelimiter)
        items.push({
            label: userProfile,
            detail: `In domain: ${userMetadata.domain?.DomainName}`,
            picked: previousSelection.has(key),
            key,
        })
    }

    if (items.length === 0) {
        getLogger().info(SagemakerConstants.NoSpaceToFilter)
        void vscode.window.showInformationMessage(SagemakerConstants.NoSpaceToFilter)
        return
    }

    const placeholder = localize(SagemakerConstants.FilterPlaceholderKey, SagemakerConstants.FilterPlaceholderMessage)
    await promptAndApplyExplorerFilter(studioNode, items, placeholder, previousSelection, (selection) =>
        studioNode.saveSelectedDomainUsers(selection)
    )
}

export async function deeplinkConnect(
    ctx: ExtContext,
    connectionIdentifier: string,
    session: string,
    wsUrl: string,
    token: string,
    domain: string,
    appType?: string,
    workspaceName?: string,
    namespace?: string,
    eksClusterArn?: string,
    isSMUS: boolean = false,
    refreshUrl?: string
) {
    getLogger().debug(
        'sm:deeplinkConnect: connectionIdentifier: %s session: %s wsUrl: %s token: %s isSMUS: %s',
        connectionIdentifier,
        session,
        wsUrl,
        token,
        isSMUS
    )

    getLogger().info(
        `sm:deeplinkConnect:
        domain: ${domain},
        appType: ${appType},
        workspaceName: ${workspaceName},
        namespace: ${namespace},
        eksClusterArn: ${eksClusterArn},
        refreshUrl: ${refreshUrl}`
    )

    if (isRemoteWorkspace()) {
        void vscode.window.showErrorMessage(ConnectFromRemoteWorkspaceMessage)
        return
    }

    try {
        let connectionType = 'sm_dl'
        let clusterName: string | undefined
        let region: string | undefined
        let accountId: string | undefined
        if (!domain && eksClusterArn && workspaceName && namespace) {
            const parsed = parseArn(eksClusterArn)
            clusterName = parsed.resourceName
            region = parsed.region
            accountId = parsed.accountId
            connectionType = 'smhp_dl'
        }
        const remoteEnv = await prepareDevEnvConnection({
            spaceArn: connectionIdentifier,
            ctx: ctx.extensionContext,
            connectionType,
            isSMUS,
            session,
            wsUrl,
            token,
            domain,
            appType,
            workspaceName,
            clusterName,
            namespace,
            region,
            clusterArn: eksClusterArn,
            accountId,
            refreshUrl,
            eksClusterName: clusterName,
        })

        try {
            const path = '/home/sagemaker-user'
            const username = 'sagemaker-user'

            if (useSageMakerSshKiroExtension()) {
                await ensureSageMakerSshKiroExtension(ctx.extensionContext)
                await startRemoteViaSageMakerSshKiro(
                    remoteEnv.SessionProcess,
                    remoteEnv.hostname,
                    path,
                    remoteEnv.vscPath,
                    username
                )
            } else {
                await startVscodeRemote(remoteEnv.SessionProcess, remoteEnv.hostname, path, remoteEnv.vscPath, username)
            }
        } catch (remoteErr: any) {
            throw new ToolkitError(
                `Failed to establish remote connection: ${remoteErr.message}. Check Remote-SSH logs for details.`,
                { cause: remoteErr, code: remoteErr.code || 'RemoteConnectionFailed' }
            )
        }
    } catch (err: any) {
        getLogger().error(
            'sm:OpenRemoteConnect: Unable to connect to target space with arn: %s error: %s isSMUS: %s',
            connectionIdentifier,
            err,
            isSMUS
        )

        if (!isUserCancelledError(err)) {
            void vscode.window.showErrorMessage(
                `Remote connection failed: ${err?.message || 'Unknown error'}. Check Output > Log (Window) for details.`
            )
            throw err
        }
    }
}

/**
 * Validates and sanitizes session names for SSH hostname compliance
 */
export async function stopSpace(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    ctx: vscode.ExtensionContext,
    sageMakerClient?: SagemakerClient
) {
    await tryRefreshNode(node)
    if (node.getStatus() === SpaceStatus.STOPPED || node.getStatus() === SpaceStatus.STOPPING) {
        void vscode.window.showWarningMessage(`Space ${node.spaceApp.SpaceName} is already in Stopped/Stopping state.`)
        return
    } else if (node.getStatus() === SpaceStatus.STARTING) {
        void vscode.window.showWarningMessage(
            `Space ${node.spaceApp.SpaceName} is in Starting state. Wait until it is Running to attempt stop again.`
        )
        return
    }
    const spaceName = node.spaceApp.SpaceName!
    const confirmed = await showConfirmationMessage({
        prompt: `You are about to stop this space. Any active resource will also be stopped. Are you sure you want to stop the space?`,
        confirm: 'Stop Space',
        cancel: 'Cancel',
        type: 'warning',
    })

    if (!confirmed) {
        return
    }
    //  In case of SMUS, we pass in a SM Client and for SM AI, it creates a new SM Client.
    const client = sageMakerClient ? sageMakerClient : new SagemakerClient(node.regionCode)
    try {
        await client.deleteApp({
            DomainId: node.spaceApp.DomainId!,
            SpaceName: spaceName,
            AppType: node.spaceApp.SpaceSettingsSummary!.AppType!,
            AppName: node.spaceApp.App?.AppName,
        })
    } catch (err) {
        const error = err as Error
        if (error instanceof AccessDeniedException) {
            throw new ToolkitError('You do not have permission to stop spaces. Please contact your administrator', {
                cause: error,
                code: error.name,
            })
        } else {
            throw new ToolkitError(`Failed to stop space ${spaceName}: ${(error as Error).message}`, {
                cause: error,
                code: error.name,
            })
        }
    }
    await tryRefreshNode(node)
}

export async function openRemoteConnect(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    ctx: vscode.ExtensionContext,
    sageMakerClient?: SagemakerClient
) {
    if (isRemoteWorkspace()) {
        void vscode.window.showErrorMessage(ConnectFromRemoteWorkspaceMessage)
        return
    }

    try {
        const spaceName = node.spaceApp.SpaceName!
        await tryRefreshNode(node)

        const remoteAccess = node.spaceApp.SpaceSettingsSummary?.RemoteAccess
        const nodeStatus = node.getStatus()

        // For IdC (SSO) domains, redirect to Studio UI for session creation
        if (isIdcDomain(node)) {
            return await handleIdcDomainConnect(node as SagemakerSpaceNode, ctx, sageMakerClient)
        }

        // Route to appropriate handler based on space state
        if (nodeStatus === SpaceStatus.RUNNING && remoteAccess !== RemoteAccess.ENABLED) {
            return await handleRunningSpaceWithDisabledAccess(node, ctx, spaceName, sageMakerClient)
        } else if (nodeStatus === SpaceStatus.STOPPED) {
            return await handleStoppedSpace(node, ctx, spaceName, sageMakerClient)
        } else if (nodeStatus === SpaceStatus.RUNNING) {
            return await handleRunningSpaceWithEnabledAccess(node, ctx, spaceName)
        }
    } catch (err: any) {
        // Suppress errors that don't need additional error messages:
        // - User cancellations (checked by isUserCancelledError)
        // - SSH config errors (already shown via modal in prepareDevEnvConnection)
        if (isUserCancelledError(err) || (err instanceof ToolkitError && err.code === 'SshConfigError')) {
            return
        }
        throw err
    }
}

/**
 * Checks if an instance type upgrade will be needed for remote access
 */
export async function checkInstanceTypeUpgradeNeeded(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    sageMakerClient?: SagemakerClient
): Promise<{ upgradeNeeded: boolean; currentType?: string; recommendedType?: string }> {
    const client = sageMakerClient || new SagemakerClient(node.regionCode)

    try {
        const spaceDetails = await client.describeSpace({
            DomainId: node.spaceApp.DomainId!,
            SpaceName: node.spaceApp.SpaceName!,
        })

        const appType = spaceDetails.SpaceSettings!.AppType!

        // Get current instance type
        const currentResourceSpec =
            appType === 'JupyterLab'
                ? spaceDetails.SpaceSettings!.JupyterLabAppSettings?.DefaultResourceSpec
                : spaceDetails.SpaceSettings!.CodeEditorAppSettings?.DefaultResourceSpec

        const currentInstanceType = currentResourceSpec?.InstanceType

        // Check if upgrade is needed
        if (currentInstanceType && currentInstanceType in InstanceTypeInsufficientMemory) {
            // Current type has insufficient memory
            return {
                upgradeNeeded: true,
                currentType: currentInstanceType,
                recommendedType: InstanceTypeInsufficientMemory[currentInstanceType],
            }
        }

        return { upgradeNeeded: false, currentType: currentInstanceType }
    } catch (err) {
        const error = err as Error
        if (error instanceof AccessDeniedException) {
            throw new ToolkitError('You do not have permission to describe spaces. Please contact your administrator', {
                cause: error,
                code: error.name,
            })
        }
        throw err
    }
}

/**
 * Asks the user to confirm the app restart that enabling remote access requires, naming the
 * instance-type change when one is needed.
 *
 * Consent MUST be obtained here, at the call site, because {@link restartSpaceWithRemoteAccess}
 * passes `skipInstanceTypePrompts: true` to `startSpace` -- that flag asserts the user has
 * already agreed to any instance-type change, it does not mean "never ask".
 *
 * @returns false if the user declined. Callers MUST NOT proceed to connect.
 */
async function confirmRemoteAccessRestart(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    spaceName: string,
    sageMakerClient?: SagemakerClient
): Promise<boolean> {
    const instanceTypeInfo = await checkInstanceTypeUpgradeNeeded(node, sageMakerClient)

    const prompt = instanceTypeInfo.upgradeNeeded
        ? InstanceTypeInsufficientMemoryMessage(
              spaceName,
              instanceTypeInfo.currentType!,
              instanceTypeInfo.recommendedType!
          )
        : // Only remote access needs to be enabled.
          RemoteAccessRequiredMessage

    return await showConfirmationMessage({
        prompt,
        confirm: 'Restart Space and Connect',
        cancel: 'Cancel',
        type: 'warning',
    })
}

/**
 * Stops the space's running app and restarts it with remote access enabled.
 *
 * The app MUST be stopped first: `RemoteAccess` and `InstanceType` are space settings that
 * cannot be changed while an app is live, and `startSpace` ends in
 * `createApp({ AppName: 'default' })`, which fails when an app of that name already exists.
 *
 * Requires prior consent via {@link confirmRemoteAccessRestart}, since this skips `startSpace`'s
 * own instance-type prompts.
 */
async function restartSpaceWithRemoteAccess(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    spaceName: string,
    client: SagemakerClient,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
    progress.report({ message: 'Stopping the space' })

    await client.deleteApp({
        DomainId: node.spaceApp.DomainId!,
        SpaceName: spaceName,
        AppType: node.spaceApp.SpaceSettingsSummary!.AppType!,
        AppName: node.spaceApp.App?.AppName,
    })

    progress.report({ message: 'Starting the space' })

    // Skip prompts: confirmRemoteAccessRestart already obtained consent.
    await client.startSpace(spaceName, node.spaceApp.DomainId!, true)
    await tryRefreshNode(node)
    await client.waitForAppInService(
        node.spaceApp.DomainId!,
        spaceName,
        node.spaceApp.SpaceSettingsSummary!.AppType!,
        progress
    )
}

/**
 * Starts a stopped space and waits for its app to come into service.
 *
 * No skip flag is passed: `startSpace` prompts for any required instance-type change itself, so
 * the user is still asked before a larger instance is selected.
 */
async function startStoppedSpaceAndWait(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    spaceName: string,
    client: SagemakerClient,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
    progress.report({ message: 'Starting the space' })

    await client.startSpace(spaceName, node.spaceApp.DomainId!)
    await tryRefreshNode(node)
    await client.waitForAppInService(
        node.spaceApp.DomainId!,
        spaceName,
        node.spaceApp.SpaceSettingsSummary!.AppType!,
        progress
    )
}

/**
 * Handles connecting to a running space with disabled remote access
 * Requires stopping the space, enabling remote access, and restarting
 */
async function handleRunningSpaceWithDisabledAccess(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    ctx: vscode.ExtensionContext,
    spaceName: string,
    sageMakerClient?: SagemakerClient
) {
    if (!(await confirmRemoteAccessRestart(node, spaceName, sageMakerClient))) {
        return
    }

    // Enable remote access and connect
    const client = sageMakerClient || new SagemakerClient(node.regionCode)

    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: `Connecting to ${spaceName}`,
        },
        async (progress) => {
            try {
                await restartSpaceWithRemoteAccess(node, spaceName, client, progress)
                await tryRemoteConnection(node, ctx, progress)
            } catch (err: any) {
                // Suppress errors that don't need additional error messages:
                // - User cancellations (checked by isUserCancelledError)
                // - SSH config errors (already shown via modal in prepareDevEnvConnection)
                if (isUserCancelledError(err) || (err instanceof ToolkitError && err.code === 'SshConfigError')) {
                    return
                }
                throw new ToolkitError(`Remote connection failed: ${err.message}`, {
                    cause: err,
                    code: err.code,
                })
            }
        }
    )
}

/**
 * Handles connecting to a stopped space
 * Starts the space and connects (remote access enabled automatically if needed)
 */
async function handleStoppedSpace(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    ctx: vscode.ExtensionContext,
    spaceName: string,
    sageMakerClient?: SagemakerClient
) {
    const client = sageMakerClient || new SagemakerClient(node.regionCode)

    try {
        await client.startSpace(spaceName, node.spaceApp.DomainId!)
        await tryRefreshNode(node)

        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                title: `Connecting to ${spaceName}`,
            },
            async (progress) => {
                progress.report({ message: 'Starting the space' })
                await client.waitForAppInService(
                    node.spaceApp.DomainId!,
                    spaceName,
                    node.spaceApp.SpaceSettingsSummary!.AppType!,
                    progress
                )
                await tryRemoteConnection(node, ctx, progress)
            }
        )
    } catch (err: any) {
        // Suppress errors that don't need additional error messages:
        // - User cancellations (checked by isUserCancelledError)
        // - SSH config errors (already shown via modal in prepareDevEnvConnection)
        if (isUserCancelledError(err) || (err instanceof ToolkitError && err.code === 'SshConfigError')) {
            return
        }
        throw new ToolkitError(`Remote connection failed: ${(err as Error).message}`, {
            cause: err as Error,
            code: err.code,
        })
    }
}

/**
 * Handles connecting to a running space with enabled remote access
 * Direct connection without any space modifications
 */
async function handleRunningSpaceWithEnabledAccess(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    ctx: vscode.ExtensionContext,
    spaceName: string,
    sageMakerClient?: SagemakerClient
) {
    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: `Connecting to ${spaceName}`,
        },
        async (progress) => {
            await tryRemoteConnection(node, ctx, progress)
        }
    )
}

/**
 * Checks if the domain associated with a space node uses IdC (SSO) authentication.
 */
function isIdcDomain(node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode): boolean {
    if (!(node instanceof SagemakerSpaceNode)) {
        return false
    }

    const domainId = node.spaceApp.DomainId
    const userProfile = node.spaceApp.OwnershipSettingsSummary?.OwnerUserProfileName
    if (!domainId || !userProfile) {
        return false
    }

    const key = getDomainUserProfileKey(domainId, userProfile)
    const metadata = node.parent.domainUserProfiles.get(key)
    return metadata?.domain?.AuthMode === 'SSO'
}

/**
 * Handles connection for IdC (SSO) domains by redirecting to the Studio UI
 * /remote-connect page, which validates the IdC session and creates the
 * remote session via LLAPS.
 */
async function handleIdcDomainConnect(
    node: SagemakerSpaceNode,
    ctx: vscode.ExtensionContext,
    sageMakerClient?: SagemakerClient
) {
    const spaceArn = await node.getSpaceArn()
    if (!spaceArn) {
        void vscode.window.showErrorMessage('Unable to determine Space ARN.')
        return
    }
    const domainId = node.spaceApp.DomainId!
    const appType = node.spaceApp.SpaceSettingsSummary?.AppType || 'JupyterLab'
    const region = node.regionCode

    // Ensure the space app is running (and remote access enabled) before opening the
    // browser. Without a running app there is no SSM target, so LLAPS StartSession fails
    // with a 500.
    //
    // The routing below deliberately mirrors openRemoteConnect's IAM dispatch so IdC and IAM
    // behave identically for the same space state.
    const client = sageMakerClient || new SagemakerClient(region)
    const spaceName = node.spaceApp.SpaceName!
    const remoteAccess = node.spaceApp.SpaceSettingsSummary?.RemoteAccess
    const nodeStatus = node.getStatus()

    const progressOptions = {
        location: vscode.ProgressLocation.Notification,
        cancellable: false,
        title: `Preparing ${spaceName}`,
    }

    if (nodeStatus === SpaceStatus.RUNNING && remoteAccess !== RemoteAccess.ENABLED) {
        // Remote access cannot be turned on while the app is live, so the app must be stopped
        // and recreated. Ask first -- the restart may also move the space to a larger instance.
        if (!(await confirmRemoteAccessRestart(node, spaceName, client))) {
            return
        }
        await vscode.window.withProgress(progressOptions, async (progress) =>
            restartSpaceWithRemoteAccess(node, spaceName, client, progress)
        )
    } else if (nodeStatus === SpaceStatus.STOPPED) {
        // startSpace enables remote access on its own (it recomputes needsRemoteAccess from
        // describeSpace) and prompts for any instance-type change, so no consent is needed here.
        await vscode.window.withProgress(progressOptions, async (progress) =>
            startStoppedSpaceAndWait(node, spaceName, client, progress)
        )
    } else if (nodeStatus !== SpaceStatus.RUNNING) {
        // Starting / Stopping: the app is mid-transition. Issuing deleteApp or createApp now
        // would fail, so surface the state instead of acting on it.
        void vscode.window.showErrorMessage(
            `Space "${spaceName}" is ${nodeStatus}. Wait for it to finish, then try connecting again.`
        )
        return
    }
    // Running with remote access already enabled: nothing to prepare.

    // Seed the pending 'initial-connection' entry so /refresh_token can update it and the
    // ProxyCommand gets 204 (pending) until the browser posts real creds.
    await preRegisterIdcConnection(spaceArn, domainId, appType)

    // Prepare SSH config + start the SINGLE detached callback server + persist the pending
    // SSM connection. This must be the ONLY startLocalServer call: starting one earlier made
    // prepareDevEnvConnection's internal restart rotate the port, leaving the browser's
    // callbackUrl pointing at a dead server.
    const remoteEnv = await prepareDevEnvConnection({
        spaceArn,
        ctx,
        connectionType: 'sm_dl',
        isSMUS: false,
        node,
        domain: domainId,
        appType,
    })

    // Read the port of the server prepareDevEnvConnection just started (the live one).
    const infoFilePath = path.join(ctx.globalStorageUri.fsPath, 'sagemaker-local-server-info.json')
    const infoContent = await fs.readFileText(infoFilePath)
    const serverInfo = JSON.parse(infoContent) as { pid: number; port: number }

    // Build the Studio URL whose callbackUrl points at THAT server, then open the browser.
    const callbackUrl = `http://localhost:${serverInfo.port}/refresh_token`
    const studioUrl = buildStudioRemoteConnectUrl({
        spaceArn,
        domain: domainId,
        region,
        appType,
        callbackUrl,
    })

    const opened = await vscode.env.openExternal(vscode.Uri.parse(studioUrl))
    if (!opened) {
        void vscode.window.showErrorMessage('Failed to open browser. Please navigate to the Studio UI manually.')
        return
    }

    void vscode.window.showInformationMessage(
        'Complete authentication in your browser to connect to the Space. ' +
            'The connection will be established automatically once authenticated.'
    )

    // Wait for the browser to complete IdC auth and post the session before opening the remote
    // window. If the user is already authenticated, creds arrive within seconds and the window
    // opens right after the redirect page. If not, the user completes IdC login first (which can
    // take longer than the ProxyCommand's poll budget) -- opening the window only after creds
    // land avoids a premature 'connecting' window racing a slow login. It also means the
    // ProxyCommand's first poll gets fresh creds immediately (no reconnect-URL/second-tab path).
    const authResult = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: `Connecting to ${spaceName}`,
        },
        async (progress, token): Promise<'authenticated' | 'cancelled' | 'timeout'> => {
            progress.report({ message: 'Waiting for authentication in the browser...' })
            const authTimeoutMs = 5 * 60 * 1000
            const pollIntervalMs = 2000
            const start = Date.now()
            while (Date.now() - start < authTimeoutMs) {
                if (token.isCancellationRequested) {
                    return 'cancelled'
                }
                if ((await getIdcConnectionStatus(spaceArn)) === 'fresh') {
                    return 'authenticated'
                }
                await sleep(pollIntervalMs)
            }
            return 'timeout'
        }
    )

    if (authResult === 'timeout') {
        // Auth never completed within the window. A late sign-in would post creds with no window
        // to receive them, so surface a clear retry hint instead of a silent dead-end.
        void vscode.window.showErrorMessage(
            `Timed out waiting for authentication to connect to ${spaceName}. Click Connect to try again.`
        )
        return
    }
    if (authResult !== 'authenticated') {
        // User cancelled the connection; exit quietly without opening a window.
        return
    }

    // Creds are ready. Open the remote window; its ProxyCommand's first poll gets them immediately.
    const remotePath = '/home/sagemaker-user'
    const username = 'sagemaker-user'
    if (useSageMakerSshKiroExtension()) {
        await ensureSageMakerSshKiroExtension(ctx)
        await startRemoteViaSageMakerSshKiro(
            remoteEnv.SessionProcess,
            remoteEnv.hostname,
            remotePath,
            remoteEnv.vscPath,
            username
        )
    } else {
        await startVscodeRemote(remoteEnv.SessionProcess, remoteEnv.hostname, remotePath, remoteEnv.vscPath, username)
    }
}
