/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validate that the required port used by webviews during development is not being used.
 */

import * as net from 'net'

/** This must be kept up to date with the port that is being used to serve the vue files. */
const portNumber = 8080

function checkPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer()

        server.once('error', (err) => {
            if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
                resolve(true)
            }
        })

        server.once('listening', () => {
            server.close()
            resolve(false)
        })

        server.listen(port)
    })
}

async function main() {
    try {
        const isPortInUse = await checkPort(portNumber)

        if (isPortInUse) {
            console.error(`
    @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

    ERROR: Webviews will not load as expected, meaning Q may not work.
    REASON: Port ${portNumber} is already in use, preventing the latest webview files from being served.
    SOLUTION: Kill the current process using port ${portNumber}.
              - Unix: "kill -9 $(lsof -t -i :${portNumber})"

    @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
    `)
            process.exit(1)
        }
    } catch (error) {
        console.error('Error checking port:', error)
        process.exit(1)
    }
}

void main()
