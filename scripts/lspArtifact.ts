import * as https from 'https'
import * as fs from 'fs'
import * as crypto from 'crypto'
import * as path from 'path'
import * as os from 'os'
import * as semver from 'semver'
import AdmZip from 'adm-zip'

interface ManifestContent {
    filename: string
    url: string
    hashes: string[]
    bytes: number
}

interface ManifestTarget {
    platform: string
    arch: string
    contents: ManifestContent[]
}

interface ManifestVersion {
    serverVersion: string
    isDelisted: boolean
    targets: ManifestTarget[]
}

interface Manifest {
    versions: ManifestVersion[]
}

async function verifyFileHash(filePath: string, expectedHash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha384')
        const stream = fs.createReadStream(filePath)

        stream.on('data', (data) => {
            hash.update(data)
        })

        stream.on('end', () => {
            const fileHash = hash.digest('hex')
            // Remove 'sha384:' prefix from expected hash if present
            const expectedHashValue = expectedHash.replace('sha384:', '')
            resolve(fileHash === expectedHashValue)
        })

        stream.on('error', reject)
    })
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
        await fs.promises.mkdir(dirPath, { recursive: true })
    }
}

export async function downloadLanguageServer(): Promise<void> {
    const tempDir = path.join(os.tmpdir(), 'amazonq-download-temp')
    const resourcesDir = path.join(__dirname, '../packages/amazonq/resources/language-server')

    // clear previous cached language server
    try {
        if (fs.existsSync(resourcesDir)) {
            fs.rmdirSync(resourcesDir, { recursive: true })
        }
    } catch (e) {
        throw Error(`Failed to clean up language server ${resourcesDir}`)
    }

    await ensureDirectoryExists(tempDir)
    await ensureDirectoryExists(resourcesDir)

    return new Promise((resolve, reject) => {
        const manifestUrl = 'https://aws-toolkit-language-servers.amazonaws.com/qAgenticChatServer/0/manifest.json'

        https
            .get(manifestUrl, (res) => {
                let data = ''

                res.on('data', (chunk) => {
                    data += chunk
                })

                res.on('end', async () => {
                    try {
                        const manifest: Manifest = JSON.parse(data)

                        const latestVersion = manifest.versions
                            .filter((v) => !v.isDelisted)
                            .sort((a, b) => semver.compare(b.serverVersion, a.serverVersion))[0]

                        if (!latestVersion) {
                            throw new Error('No valid version found in manifest')
                        }

                        const darwinArm64Target = latestVersion.targets.find(
                            (t) => t.platform === 'darwin' && t.arch === 'arm64'
                        )

                        if (!darwinArm64Target) {
                            throw new Error('No darwin arm64 target found')
                        }

                        for (const content of darwinArm64Target.contents) {
                            const fileName = content.filename
                            const fileUrl = content.url
                            const expectedHash = content.hashes[0]
                            const tempFilePath = path.join(tempDir, fileName)
                            const fileFolderName = content.filename.replace('.zip', '')

                            console.log(`Downloading ${fileName} from ${fileUrl} ...`)

                            await new Promise((downloadResolve, downloadReject) => {
                                https
                                    .get(fileUrl, (fileRes) => {
                                        const fileStream = fs.createWriteStream(tempFilePath)
                                        fileRes.pipe(fileStream)

                                        fileStream.on('finish', () => {
                                            fileStream.close()
                                            downloadResolve(void 0)
                                        })

                                        fileStream.on('error', (err) => {
                                            fs.unlink(tempFilePath, () => {})
                                            downloadReject(err)
                                        })
                                    })
                                    .on('error', (err) => {
                                        fs.unlink(tempFilePath, () => {})
                                        downloadReject(err)
                                    })
                            })

                            console.log(`Verifying hash for ${fileName}...`)
                            const isHashValid = await verifyFileHash(tempFilePath, expectedHash)

                            if (!isHashValid) {
                                fs.unlinkSync(tempFilePath)
                                throw new Error(`Hash verification failed for ${fileName}`)
                            }

                            console.log(`Extracting ${fileName}...`)
                            const zip = new AdmZip(tempFilePath)
                            zip.extractAllTo(path.join(resourcesDir, fileFolderName), true) // true for overwrite

                            // Clean up temp file
                            fs.unlinkSync(tempFilePath)
                            console.log(`Successfully processed ${fileName}`)
                        }

                        // Clean up temp directory
                        fs.rmdirSync(tempDir)
                        fs.rmdirSync(path.join(resourcesDir, 'servers', 'indexing'), { recursive: true })
                        fs.rmdirSync(path.join(resourcesDir, 'servers', 'ripgrep'), { recursive: true })
                        fs.rmSync(path.join(resourcesDir, 'servers', 'node'))
                        if (!fs.existsSync(path.join(resourcesDir, 'servers', 'aws-lsp-codewhisperer.js'))) {
                            throw new Error(`Extracting aws-lsp-codewhisperer.js failure`)
                        }
                        if (!fs.existsSync(path.join(resourcesDir, 'clients', 'amazonq-ui.js'))) {
                            throw new Error(`Extracting amazonq-ui.js failure`)
                        }
                        console.log('Download and extraction completed successfully')
                        resolve()
                    } catch (err) {
                        // Clean up temp directory on error
                        if (fs.existsSync(tempDir)) {
                            fs.rmdirSync(tempDir, { recursive: true })
                        }
                        reject(err)
                    }
                })
            })
            .on('error', (err) => {
                // Clean up temp directory on error
                if (fs.existsSync(tempDir)) {
                    fs.rmdirSync(tempDir, { recursive: true })
                }
                reject(err)
            })
    })
}
