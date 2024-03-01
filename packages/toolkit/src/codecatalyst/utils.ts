/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ides } from 'aws-sdk/clients/codecatalyst'
import * as vscode from 'vscode'
import { CodeCatalystResource, getCodeCatalystConfig } from '../shared/clients/codecatalystClient'
import { pushIf } from '../shared/utilities/collectionUtils'
import { getCodeCatalystDevEnvId } from '../shared/vscode/env'
import { getLogger } from '../shared/logger'

/**
 * Builds a web URL from the given CodeCatalyst object.
 */
export function toCodeCatalystUrl(resource: CodeCatalystResource): string {
    const prefix = `https://${getCodeCatalystConfig().hostname}/spaces`

    const format = (org: string, proj?: string, repo?: string, branch?: string) => {
        const parts = [prefix, org]
        pushIf(parts, !!proj, 'projects', proj)
        pushIf(parts, !!repo, 'source-repositories', repo)
        pushIf(parts, !!branch, 'branch', 'refs', 'heads', branch)

        return parts.concat('view').join('/')
    }

    switch (resource.type) {
        case 'org':
            return format(resource.name)
        case 'project':
            return format(resource.org.name, resource.name)
        case 'repo':
            return format(resource.org.name, resource.project.name, resource.name)
        case 'branch':
            return format(resource.org.name, resource.project.name, resource.repo.name, resource.name)
        case 'devEnvironment':
            // There's currently no page to view an individual devenv.
            // This may be changed to direct to the underlying repository instead
            return [prefix, resource.org.name, 'projects', resource.project.name, 'dev-environments'].join('/')
    }
}

export function getHelpUrl(): string {
    return `https://${getCodeCatalystConfig().hostname}/help`
}

/**
 * Builds a web URL from the given CodeCatalyst object.
 */
export function openCodeCatalystUrl(o: CodeCatalystResource) {
    const url = toCodeCatalystUrl(o)
    vscode.env.openExternal(vscode.Uri.parse(url)).then(undefined, e => {
        getLogger().error('openExternal failed: %s', (e as Error).message)
    })
}

/** Returns true if the dev env has a "vscode" IDE runtime. */
export function isDevenvVscode(ides: Ides | undefined): boolean {
    return ides !== undefined && ides.findIndex(ide => ide.name === 'VSCode') !== -1
}

/**
 * Returns true if we are in a dev env
 */
export function isInDevEnv(): boolean {
    return !!getCodeCatalystDevEnvId()
}
