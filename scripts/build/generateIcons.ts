/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import webfont from 'webfont'
import * as path from 'path'
import * as fs from 'fs-extra'
import * as packageJson from '../../package.json'

const FONT_ID = 'aws-toolkit-icons'
const ROOT_DIR = process.cwd()
const ICONS_ROOT_DIR = path.join(ROOT_DIR, 'resources', 'icons')
const FONT_ROOT_DIR = path.join(ROOT_DIR, 'resources', 'fonts')
const STYLESHEETS_ROOT_DIR = path.join(ROOT_DIR, 'resources', 'css')
const ICON_SOURCES = [`resources/icons/**/*.svg`, '!**/{cloud9,dark,light}/**']

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
        throw new Error('Expected `icons` contribution to be an object')
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
    await fs.writeFile(path.join(ROOT_DIR, 'package.json'), newPackage)
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
        const replaced = contents.replace('currentColor', color)
        await fs.writeFile(dst, replaced)
    }

    for (const [theme, color] of Object.entries(themes)) {
        const themeDest = path.join(destination, theme)
        await fs.mkdirp(themeDest)
        await Promise.all(targets.map(t => replaceColor(t.path, color, path.join(themeDest, `${t.name}.svg`))))
    }
}

async function generate() {
    const dest = path.join(FONT_ROOT_DIR, `${FONT_ID}.woff`)
    const relativeDest = path.relative(ROOT_DIR, dest)
    const icons: { name: string; path: string; data?: PackageIcon }[] = []
    const generated = new GeneratedFilesManifest()

    const result = await webfont({
        files: ICON_SOURCES,
        fontName: FONT_ID,
        formats: ['woff'],
        startUnicode: 0xe000,
        verbose: true,
        normalize: true,
        sort: true,
        fontHeight: 1000,
        template: 'css',
        templateClassName: 'icon',
        templateFontPath: path.relative(STYLESHEETS_ROOT_DIR, FONT_ROOT_DIR),
        glyphTransformFn: obj => {
            const filePath = (obj as { path?: string }).path

            if (!filePath) {
                throw new Error(`Expected glyph "${obj.name}" to have a file path`)
            }

            if (!obj.unicode) {
                throw new Error(`Expected glyph "${obj.name}" to have the unicode property.`)
            }

            const parts = path.relative(ICONS_ROOT_DIR, filePath).split(path.sep)
            obj.name = parts.join('-').replace('.svg', '')

            if (!obj.name.startsWith('vscode')) {
                icons.push({
                    name: obj.name,
                    path: filePath,
                    data: createPackageIcon(`./${relativeDest}`, obj.unicode[0]),
                })
            } else {
                obj.name = obj.name.replace('codicons-', '')
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
 * This style sheet was generated using "${path.relative(ROOT_DIR, __filename)}". 
 */ 

${result.template}
`.trim()

    const stylesheetPath = path.join(STYLESHEETS_ROOT_DIR, 'icons.css')
    const cloud9Dest = path.join(ICONS_ROOT_DIR, 'cloud9', 'generated')
    const isValidIcon = (i: typeof icons[number]): i is Required<typeof i> => i.data !== undefined

    await fs.mkdirp(FONT_ROOT_DIR)
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

    await generated.emit(path.join(ROOT_DIR, 'dist'))
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

generate().catch(error => {
    console.error('Failed to generate icons: %s', (error as Error).message)
})
