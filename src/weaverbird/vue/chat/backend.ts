/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
// import * as nls from 'vscode-nls'
import { VueWebview } from '../../../webviews/main'
import { Session } from './session'
import * as fs from 'fs-extra'

// const localize = nls.loadMessageBundle()

export class WeaverbirdChatWebview extends VueWebview {
    public readonly id = 'configureChat'
    public readonly source = 'src/weaverbird/vue/chat/index.js'
    public readonly onDidCreateContent = new vscode.EventEmitter<string>()
    public readonly onDidSubmitPlan = new vscode.EventEmitter<void>()
    public readonly session: Session

    public constructor(history: string[]) {
        // private readonly _client: codeWhispererClient // would be used if we integrate with codewhisperer
        super()

        // TODO do something better then handle this in the constructor
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (workspaceFolders === undefined || workspaceFolders.length === 0) {
            throw new Error('Could not find workspace folder')
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath
        this.session = new Session(history, workspaceRoot)
    }

    public async getSession(): Promise<Session> {
        // TODO if we have a client we can do a async request here to get the history (if any)
        return this.session
    }

    // Instrument the client sending here
    public async send(msg: string): Promise<string | undefined> {
        console.log(msg)

        // const result = await this.session.send(msg)
        const result = `
hey-claude:  Here is the code generated in response to the request: 

--BEGIN-FILE: /Volumes/workplace/weaverbird-poc/src/App.tsx
import React from 'react';
import logo from './logo.svg';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and restart to change to change.
        </p> 
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
--END-FILE--

--BEGIN-FILE: /Volumes/workplace/weaverbird-poc/src/App.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('check new text for learn react link', () => {
  render(<App />);
  const linkElement = screen.getByText(/learn react/i);
  const textElement = screen.getByText(/restart to change to change./i); 
  expect(linkElement).toBeInTheDocument();
  expect(textElement).toBeInTheDocument(); 
});

test('check unchanged text for learn react link', () => {
  render(<App />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
}); 
--END-FILE--
`

        // Parse and show button?
        const selection = await vscode.window.showInformationMessage(
            'Code has been generated for session id: 1234',
            'Apply diff',
            'View diff'
        )

        if (selection !== undefined && selection === 'Apply diff') {
            const files = this.getFiles(result)
            for (const [path, contents] of files) {
                fs.writeFileSync(path, contents)
            }
        } else if (selection !== undefined && selection === 'View diff') {
            const files = this.getFiles(result)

            const myScheme = 'weaverbird'
            const myProvider = new (class implements vscode.TextDocumentContentProvider {
                // emitter and its event
                onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>()
                onDidChange = this.onDidChangeEmitter.event

                provideTextDocumentContent(uri: vscode.Uri): string {
                    return files.get(uri.fsPath) ?? ''
                }
            })()
            vscode.workspace.registerTextDocumentContentProvider(myScheme, myProvider)

            for (const [path, _] of files) {
                const uri = vscode.Uri.parse(`${myScheme}:${path}`)
                const doc = await vscode.workspace.openTextDocument(uri) // calls back into the provider
                await vscode.commands.executeCommand('vscode.diff', vscode.Uri.parse(path), doc.uri, undefined, {
                    viewColumn: vscode.ViewColumn.One,
                    preview: false,
                    preserveFocus: false,
                } as vscode.TextDocumentShowOptions)
            }
        }

        return result
    }

    private getFiles(result: string): Map<string, string> {
        const resultSplit = result.split('\n')

        const files = new Map<string, string>()
        let filePath = ''
        let fileContents = ''
        for (const line of resultSplit) {
            if (line.includes('--BEGIN-FILE')) {
                filePath = line.split(': ')[1].trim()
                fileContents = ''
            } else if (line.includes('--END-FILE--')) {
                files.set(filePath, fileContents)
                filePath = ''
                fileContents = ''
            } else {
                fileContents += `${line}\n`
            }
        }

        return files
    }
}

const View = VueWebview.compileView(WeaverbirdChatWebview)
let activeView: InstanceType<typeof View> | undefined

export async function registerChatView(
    ctx: vscode.ExtensionContext,
    history: string[]
): Promise<WeaverbirdChatWebview> {
    activeView ??= new View(ctx, history)
    activeView.register({
        title: 'Weaverbird Chat',
    })
    return activeView.server
}
