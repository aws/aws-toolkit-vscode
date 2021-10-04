/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as GitTypes from '../../../types/git.d'
import { GitExtension } from '../../shared/extensions/git'
import { createLabelQuickPick } from '../../shared/ui/pickerPrompter'
import { createBackButton } from '../../shared/ui/buttons'

import * as nls from 'vscode-nls'
import { isValidResponse } from '../../shared/wizards/wizard'
import { getLogger } from '../../shared/logger/logger'
import { showViewLogsMessage } from '../../shared/utilities/messages'
const localize = nls.loadMessageBundle()

// may be useful, need lib or write code to change glob to regex
// import { DEVFILE_GLOB_PATTERN } from '../../shared/fs/devfileRegistry'

type RemoteWithBranch = Omit<GitTypes.Remote, 'isReadOnly'> & {
    fetchUrl: string
    branch?: string
}

async function getDevFiles(remote: RemoteWithBranch): Promise<string[]> {
    // TODO: pipe `GitExtension` through for testing purposes
    const git = new GitExtension()
    const result = await git.listAllRemoteFiles(remote)

    const devFiles = result.files.map(f => f.name).filter(f => f.match(/^(.*[\/\\])?devfile.(yaml|yml)$/))
    result.dispose()

    return devFiles
}

export async function promptDevFiles(remote: RemoteWithBranch): Promise<string | undefined> {
    // TODO: add an option to 'prompter' to auto-return when there's only one option
    // may need to add a small amount of logic to the wizard flow to remove the prompt from the step-count

    const files = await getDevFiles(remote).catch(err => {
        // TODO: is an error item better or a toast? error item may be too subtle
        getLogger().error(`mde devfiles: failed to retrieve files from remote: ${err}`)
        showViewLogsMessage(localize('aws.mde.devfile.prompt.failed', 'No devfiles could be found'))
        return []
    })
    const items = files.map(name => ({ label: name }))
    const response = await createLabelQuickPick(items, {
        title: localize('AWS.mde.devfile.prompt.title', 'Choose a devfile from {0}', remote.name),
        buttons: [createBackButton()],
    }).prompt()

    return isValidResponse(response) ? response : undefined
}
