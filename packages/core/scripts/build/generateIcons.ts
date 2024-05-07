/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import webfont from 'webfont'
import * as path from 'path'
import * as fs from 'fs-extra'
import packageJson from '../../package.json'

const fontId = 'aws-toolkit-icons'
const projectDir = process.cwd() // root/packages/toolkit
const rootDir = path.join(projectDir, '../..') // root/
const iconsDir = path.join(projectDir, 'resources', 'icons')
const fontsDir = path.join(projectDir, 'resources', 'fonts')
const stylesheetsDir = path.join(projectDir, 'resources', 'css')
const iconSources = [
    // Paths relative to packages/toolkit
    `resources/icons/**/*.svg`,
    `../../node_modules/@vscode/codicons/src/icons/**/*.svg`,
    '!**/{cloud9,dark,light}/**',
]

interface PackageIcon {
    readonly description: string
    readonly default: {
        readonly fontPath: string
        readonly fontCharacter: string
    }
}

interface IconsContribution {
    [id: string]: PackageIcon
}

function createPackageIcon(fontPath: string, unicode: string, description?: string): PackageIcon {
    const codePoint = unicode.codePointAt(0)?.toString(16)

    if (!codePoint) {
        throw new Error(`Invalid unicode character: ${unicode}`)
    }

    return {
        description: description ?? 'AWS Contributed Icon',
        default: {
            fontPath,
            fontCharacter: `\\${codePoint}`,
        },
    }
}

async function updatePackage(fontPath: string, icons: [id: string, icon: PackageIcon][]): Promise<void> {
    const contributes = packageJson.contributes as { icons?: IconsContribution }
    const iconsContribution = (contributes.icons ??= {})

    if (typeof iconsContribution !== 'object') {
        throw new TypeError('Expected `icons` contribution to be an object')
    }

    for (const [id, icon] of Object.entries(iconsContribution)) {
        if (icon.default?.fontPath === fontPath) {
            delete iconsContribution[id]
        }
    }

    for (const [id, icon] of icons) {
        iconsContribution[id] = icon
    }

    // prettier adds a newline to JSON files
    const newPackage = `${JSON.stringify(packageJson, undefined, 4)}\n`
    await fs.writeFile(path.join(projectDir, 'package.json'), newPackage)
    console.log('Updated package.json')
}

const themes = {
    dark: '#C5C5C5',
    light: '#424242',
}

async function generateCloud9Icons(targets: { name: string; path: string }[], destination: string): Promise<void> {
    console.log('Generating icons for Cloud9')

    async function replaceColor(file: string, color: string, dst: string): Promise<void> {
        const contents = await fs.readFile(file, 'utf-8')
        const replaced = contents.replace(/currentColor/g, color)
        await fs.writeFile(dst, replaced)
    }

    for (const [theme, color] of Object.entries(themes)) {
        const themeDest = path.join(destination, theme)
        await fs.mkdirp(themeDest)
        await Promise.all(targets.map(t => replaceColor(t.path, color, path.join(themeDest, `${t.name}.svg`))))
    }
}

async function generate(mappings: Record<string, number | undefined> = {}) {
    const dest = path.join(fontsDir, `${fontId}.woff`)
    const relativeDest = path.relative(projectDir, dest)
    const icons: { name: string; path: string; data?: PackageIcon }[] = []
    const generated = new GeneratedFilesManifest()

    const result = await webfont({
        files: iconSources,
        fontName: fontId,
        formats: ['woff'],
        startUnicode: 0xf000,
        verbose: true,
        normalize: true,
        sort: true,
        fontHeight: 1000,
        template: 'css',
        templateClassName: 'icon',
        descent: 200, // Icons were negatively offset on the y-axes, this fixes it
        templateFontPath: path.relative(stylesheetsDir, fontsDir).replace(/\\/g, '/'),
        glyphTransformFn: obj => {
            const filePath = (obj as { path?: string }).path

            if (!filePath) {
                throw new Error(`Expected glyph "${obj.name}" to have a file path`)
            }

            if (!obj.unicode) {
                throw new Error(`Expected glyph "${obj.name}" to have the unicode property.`)
            }

            // If icon came from `node_modules` -> it's a codicon
            if (filePath.includes('node_modules')) {
                obj.name = `vscode-${path.basename(filePath).replace('.svg', '')}`
                const mapping = mappings[obj.name]
                if (mapping === undefined) {
                    throw new Error(`No unicode mapping found for icon "${obj.name}"`)
                }

                obj.unicode = [String.fromCodePoint(mapping)]
            } else {
                const parts = path.relative(iconsDir, filePath).split(path.sep)
                obj.name = parts.join('-').replace('.svg', '')
            }

            if (!obj.name.startsWith('vscode')) {
                // Normalize the font path regardless of platform
                // See https://github.com/aws/aws-toolkit-vscode/pull/3066#discussion_r1063662657
                const normalizedPath = relativeDest.split(path.sep).join(path.posix.sep)
                icons.push({
                    name: obj.name,
                    path: filePath,
                    data: createPackageIcon(`./${normalizedPath}`, obj.unicode[0]),
                })
            } else {
                icons.push({ name: obj.name, path: filePath })
            }
            return obj
        },
    })

    const template = `
/* 
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 
 * SPDX-License-Identifier: Apache-2.0 
 * 
 * This style sheet was generated using "${path.relative(rootDir, __filename)}". 
 */ 

${result.template}
`.trim()

    const stylesheetPath = path.join(stylesheetsDir, 'icons.css')
    const cloud9Dest = path.join(iconsDir, 'cloud9', 'generated')
    const isValidIcon = (i: (typeof icons)[number]): i is Required<typeof i> => i.data !== undefined

    await fs.mkdirp(fontsDir)
    await fs.writeFile(dest, result.woff)
    await fs.writeFile(stylesheetPath, template)
    await updatePackage(
        `./${relativeDest}`,
        icons.filter(isValidIcon).map(i => [i.name, i.data])
    )
    await generateCloud9Icons(icons, cloud9Dest)

    generated.addEntry(dest)
    generated.addEntry(stylesheetPath)
    generated.addEntry(cloud9Dest)

    await generated.emit(path.join(projectDir, 'dist'))
}

class GeneratedFilesManifest {
    private readonly files: string[] = []

    public addEntry(file: string): void {
        this.files.push(file)
    }

    public async emit(dir: string): Promise<void> {
        const dest = path.join(dir, 'generated.buildinfo')
        const data = JSON.stringify(this.files, undefined, 4)
        await fs.mkdirp(dir)
        await fs.writeFile(dest, data)
    }
}

async function loadCodiconMappings(): Promise<Record<string, number | undefined>> {
    const codicons = path.join(rootDir, 'node_modules', '@vscode', 'codicons', 'src')
    const data = JSON.parse(await fs.readFile(path.join(codicons, 'template', 'mapping.json'), 'utf-8'))
    const mappings: Record<string, number | undefined> = {}
    for (const [k, v] of Object.entries(data)) {
        if (typeof k === 'string' && typeof v === 'number') {
            if (v < 0xe000 || v >= 0xf000) {
                // Will warn us if the codepoint moves outside the expected range
                throw new Error(`Codicon "${k}" has unexpected codepoint: ${v}`)
            }
            mappings[`vscode-${k}`] = v
        }
    }

    return mappings
}

async function main() {
    const mappings = await loadCodiconMappings()
    await generate(mappings)
}

void main()
