/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable aws-toolkits/no-console-log */
/* eslint-disable no-restricted-imports */
import http, { IncomingMessage, ServerResponse } from 'http'
import { handleGetSession } from './routes/getSession'
import { handleGetSessionAsync } from './routes/getSessionAsync'
import { handleRefreshToken } from './routes/refreshToken'
import url from 'url'
import * as os from 'os'
import fs from 'fs'
import { execFile } from 'child_process'

const pollInterval = 30 * 60 * 100 // 30 minutes

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const parsedUrl = url.parse(req.url || '', true)

    switch (parsedUrl.pathname) {
        case '/get_session':
            return handleGetSession(req, res)
        case '/get_session_async':
            return handleGetSessionAsync(req, res)
        case '/refresh_token':
            return handleRefreshToken(req, res)
        default:
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end(`Not Found: ${req.url}`)
    }
})

server.listen(0, '127.0.0.1', async () => {
    const address = server.address()
    if (address && typeof address === 'object') {
        const port = address.port
        const pid = process.pid

        console.log(`Detached server listening on http://127.0.0.1:${port} (pid: ${pid})`)

        const filePath = process.env.SAGEMAKER_LOCAL_SERVER_FILE_PATH
        if (!filePath) {
            throw new Error('SAGEMAKER_LOCAL_SERVER_FILE_PATH environment variable is not set')
        }

        const data = { pid, port }
        console.log(`Writing local endpoint info to ${filePath}`)

        fs.writeFileSync(filePath, JSON.stringify(data, undefined, 2), 'utf-8')
    } else {
        console.error('Failed to retrieve assigned port')
        process.exit(0)
    }
    await monitorVSCodeAndExit()
})

function checkVSCodeWindows(): Promise<boolean> {
    return new Promise((resolve) => {
        const platform = os.platform()

        if (platform === 'win32') {
            execFile('tasklist', ['/FI', 'IMAGENAME eq Code.exe'], (err, stdout) => {
                if (err) {
                    resolve(false)
                    return
                }
                resolve(/Code\.exe/i.test(stdout))
            })
        } else if (platform === 'darwin') {
            execFile('ps', ['aux'], (err, stdout) => {
                if (err) {
                    resolve(false)
                    return
                }

                const found = stdout
                    .split('\n')
                    .some((line) => /Visual Studio Code( - Insiders)?\.app\/Contents\/MacOS\/Electron/.test(line))
                resolve(found)
            })
        } else {
            execFile('ps', ['-A', '-o', 'comm'], (err, stdout) => {
                if (err) {
                    resolve(false)
                    return
                }

                const found = stdout.split('\n').some((line) => /^(code(-insiders)?|electron)$/i.test(line.trim()))
                resolve(found)
            })
        }
    })
}

async function monitorVSCodeAndExit() {
    while (true) {
        const found = await checkVSCodeWindows()
        if (!found) {
            console.log('No VSCode windows found. Shutting down detached server.')
            process.exit(0)
        }
        await new Promise((r) => setTimeout(r, pollInterval))
    }
}
