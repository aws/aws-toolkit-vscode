/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
// import * as nls from 'vscode-nls'
import { VueWebview } from '../../../webviews/main'
import { isCloud9 } from '../../../shared/extensionUtilities'
import { ChildProcess } from '../../../shared/utilities/childProcess'

// const localize = nls.loadMessageBundle()

export class WeaverbirdChatWebview extends VueWebview {
    public readonly id = 'configureChat'
    public readonly source = 'src/weaverbird/vue/chat/index.js'
    public readonly workspaceRoot: string
    public readonly onDidCreateContent = new vscode.EventEmitter<string>()

    public constructor() {
        // private readonly _client: codeWhispererClient // would be used if we integrate with codewhisperer
        super()

        // TODO do something better then handle this in the constructor
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (workspaceFolders === undefined || workspaceFolders.length === 0) {
            throw new Error('Could not find workspace folder')
        }

        this.workspaceRoot = workspaceFolders[0].uri.fsPath
    }

    public init() {
        // history could come from a previous chat session if neccessary
        return {
            history: [],
        }
    }

    // Instrument the client sending here
    public async send(msg: string): Promise<string | undefined> {
        console.log(msg)

        // TODO: figure out how to pass environment variables
        // We might need to pipe in the previous history here so we need to store that somewhere in the class
        const result = await new ChildProcess(
            '/usr/local/bin/python3',
            // TODO: Currently adding /src to the end of the workspace path. How should this actually work?
            [
                '/Volumes/workplace/weaverbird-poc/.codecatalyst/llm/claude.py',
                '--query',
                `"${msg}"`,
                '--workspace',
                this.workspaceRoot + '/src',
            ],
            {
                spawnOptions: {
                    shell: '/bin/zsh',
                    // TODO add better detection for the workspace path because it can technically be in any number of workspaces
                    cwd: this.workspaceRoot,
                    env: {
                        ANTHROPIC_API_KEY: '',
                    },
                },
            }
        ).run({
            onStdout: text => console.log(`hey-claude: ${text}`),
            onStderr: text => console.log(`hey-claude: ${text}`),
        })

        if (result.error) {
            console.log(result.stderr)
            return Promise.resolve('Unable to interact with hey-claude')
        }

        // Clean up the summary by stripping the description from the actual generated text contents
        const fileBeginnings = result.stdout.split('--BEGIN-FILE')
        const outputSummary = fileBeginnings.length > 0 ? fileBeginnings[0] : result.stdout

        return outputSummary
    }
}

const Panel = VueWebview.compilePanel(WeaverbirdChatWebview)
let activePanel: InstanceType<typeof Panel> | undefined

const View = VueWebview.compileView(WeaverbirdChatWebview)
let activeView: InstanceType<typeof View> | undefined

export async function showChat(ctx: vscode.ExtensionContext): Promise<void> {
    activePanel ??= new Panel(ctx)
    await activePanel.show({
        title: 'Weaverbird Chat', // TODO localize
        viewColumn: isCloud9() ? vscode.ViewColumn.One : vscode.ViewColumn.Active,
    })
}

export async function registerChatView(ctx: vscode.ExtensionContext): Promise<WeaverbirdChatWebview> {
    activeView ??= new View(ctx)
    activeView.register({
        title: 'Weaverbird Chat',
    })
    return activeView.server
}
