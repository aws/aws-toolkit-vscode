/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process' // eslint-disable-line no-restricted-imports, aws-toolkits/no-string-exec-for-child-process
import * as fs from 'fs' // eslint-disable-line no-restricted-imports
import * as semver from 'semver'
import { getLogger } from '../../../shared/logger/logger'

interface VersionResult {
    maxFound: string | undefined
    allAvailable: string[]
}

export class CLibCheck {
    /**
     * Checks the GNU C Library (glibc) version.
     * Uses `ldd --version` to parse the version number.
     */
    public static getGLibCVersion(): string | undefined {
        try {
            const output = execSync('ldd --version', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 5000,
            })
            // Output usually looks like: "ldd (Ubuntu GLIBC 2.35-0ubuntu3.1) 2.35"
            // We look for the first version number pattern on the first line.
            const firstLine = output.split('\n')[0]
            const match = firstLine.match(/(\d+\.\d+)/)
            return match ? semver.coerce(match[0])?.version || match[0] : undefined
        } catch (error) {
            getLogger('awsCfnLsp').warn('Could not run ldd. Is this a glibc-based distro?')
            return undefined
        }
    }

    /**
     * Checks available GLIBCXX versions in libstdc++.
     * 1. Finds libstdc++.so.6 location.
     * 2. Scans the binary for "GLIBCXX_*" strings.
     * 3. Sorts them to find the maximum version supported.
     */
    public static getGLibCXXVersions(): VersionResult {
        const libPath = this.findLibStdCpp()

        if (!libPath) {
            return { maxFound: undefined, allAvailable: [] }
        }

        try {
            // Method 1: Try using the `strings` command (fastest, but requires binutils)
            const output = execSync(`strings "${libPath}" | grep GLIBCXX`, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 10000,
            })
            return this.parseGLibCXXOutput(output)
        } catch (e) {
            // Method 2: Fallback to Node.js FS reading (works in minimal containers w/o strings)
            try {
                const content = fs.readFileSync(libPath, 'binary') // Read as binary string
                // Regex to find all GLIBCXX_x.x.x occurrences
                const matches = content.match(/GLIBCXX_\d+\.\d+(\.\d+)?/g)
                if (matches) {
                    return this.parseGLibCXXOutput(matches.join('\n'))
                }
            } catch (readError) {
                getLogger('awsCfnLsp').error(`Failed to read library at ${libPath}`)
            }
        }

        return { maxFound: undefined, allAvailable: [] }
    }

    private static parseGLibCXXOutput(rawOutput: string): VersionResult {
        const rawVersions = rawOutput
            .trim()
            .split('\n')
            .map((line) => line.trim())
            // 1. Strict Filter: Must be GLIBCXX_ followed immediately by a digit
            .filter((line) => /^GLIBCXX_\d/.test(line))
            // 2. Extraction: Capture strictly the numeric part
            .map((line) => {
                const match = line.match(/^GLIBCXX_(\d+\.\d+(?:\.\d+)?)/)
                return match ? match[1] : undefined
            })
            .filter((v): v is string => v !== undefined)

        // 3. Deduplicate
        const uniqueVersions = [...new Set(rawVersions)]

        // 4. Sort using Semver
        // We use coerce() because "3.4" is not valid strict semver, but "3.4.0" is.
        const sorted = uniqueVersions.sort((a, b) => {
            const verA = semver.coerce(a)
            const verB = semver.coerce(b)
            // Handle unlikely case where coerce fails (returns null) by pushing it to the bottom
            if (!verA || !verB) {
                return 0
            }
            return semver.compare(verA, verB)
        })

        return {
            maxFound: sorted.length > 0 ? sorted[sorted.length - 1] : undefined,
            allAvailable: sorted,
        }
    }

    private static findLibStdCpp(): string | undefined {
        // 1. Try ldconfig cache (most reliable on standard linux)
        try {
            const ldconfig = execSync('/sbin/ldconfig -p | grep libstdc++.so.6', { encoding: 'utf8', timeout: 5000 })
            // Output: "libstdc++.so.6 (libc6,x86-64) => /lib/x86_64-linux-gnu/libstdc++.so.6"
            const match = ldconfig.match(/=>\s+(.+)$/m)
            if (match && match[1]) {
                return match[1].trim()
            }
        } catch (e) {
            /* ignore */
        }

        // 2. Search common paths (fallback for containers/weird setups)
        const commonPaths = [
            '/usr/lib/x86_64-linux-gnu/libstdc++.so.6',
            '/usr/lib64/libstdc++.so.6',
            '/usr/lib/libstdc++.so.6',
            '/lib/x86_64-linux-gnu/libstdc++.so.6',
        ]

        for (const p of commonPaths) {
            if (fs.existsSync(p)) {
                return p
            }
        }

        return undefined
    }
}
