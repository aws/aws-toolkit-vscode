/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import globals from '../shared/extensionGlobals'
import * as vscode from 'vscode'
import { getIdeProperties } from '../shared/extensionUtilities'
import { CredentialsStore } from '../credentials/credentialsStore'
import { RegionProvider, getEndpointsFromFetcher } from '../shared/regions/regionProvider'
import { HttpResourceFetcher } from '../shared/resourcefetcher/httpResourceFetcher'
import { FileResourceFetcher } from '../shared/resourcefetcher/fileResourceFetcher'
import { endpointsFileUrl } from '../shared/constants'
import { AwsContext } from '../shared/awsContext'
import { UriHandler } from '../shared/vscode/uriHandler'
import { SamCliContext, getSamCliContext } from '../shared/sam/cli/samCliContext'

/**
 * Long-lived, extension-scoped, shared globals.
 *
 * @deprecated Wrapping `vscode.ExtensionContext` with several unrelated objects makes
 * things hard to maintain. Prefer simply using `globals` as an initializer instead.
 */
export interface extcontext {
    extensionContext: vscode.ExtensionContext
    awsContext: AwsContext
    samCliContext: () => SamCliContext
    regionProvider: RegionProvider
    outputChannel: vscode.OutputChannel
    credentialsStore: CredentialsStore
    uriHandler: UriHandler
}

function makeEndpointsProvider() {
    const localManifestFetcher = new FileResourceFetcher(globals.manifestPaths.endpoints)
    const remoteManifestFetcher = new HttpResourceFetcher(endpointsFileUrl, { showUrl: true })

    return {
        local: () => getEndpointsFromFetcher(localManifestFetcher),
        remote: () => getEndpointsFromFetcher(remoteManifestFetcher),
    }
}

export async function activate(context: vscode.ExtensionContext): Promise<extcontext> {
    const toolkitOutputChannel = vscode.window.createOutputChannel(
        localize('AWS.channel.aws.toolkit', '{0} Toolkit', getIdeProperties().company)
    )

    const endpointsProvider = makeEndpointsProvider()
    const regionProvider = RegionProvider.fromEndpointsProvider(endpointsProvider)
    const credentialsStore = new CredentialsStore()
    const uriHandler = new UriHandler()
    context.subscriptions.push(vscode.window.registerUriHandler(uriHandler))

    return {
        uriHandler,
        credentialsStore,
        extensionContext: context,
        samCliContext: getSamCliContext,
        regionProvider: regionProvider,
        awsContext: globals.awsContext,
        outputChannel: toolkitOutputChannel,
    }
}
