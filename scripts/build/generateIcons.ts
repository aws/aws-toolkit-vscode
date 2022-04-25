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
const ICON_SOURCES = [`${ICONS_ROOT_DIR}/**/*.svg`, '!**/{cloud9,dark,light}/**']

interface PackageIcon {
    description: string
    default: {
        fontPath: string
        fontCharacter: string
    }
}

interface IconsContribution {
    [id: string]: PackageIcon
}

function createPackageIcon(fontPath: string, unicode: string, description?: string): PackageIcon {
    const codePoint = unicode.codePointAt(0)?.toString(16).toUpperCase()

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

    await fs.writeFile(path.join(ROOT_DIR, 'package.json'), JSON.stringify(packageJson, undefined, 4))
    console.log('Updated package.json')
}

const themes = {
    dark: '#C5C5C5',
    light: '#424242',
}

export async function generateCloud9Icons(
    targets: { name: string; path: string }[],
    destination: string
): Promise<void> {
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
        templateFontPath: path.relative(path.join(ROOT_DIR, 'media', 'css'), FONT_ROOT_DIR),
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

    await fs.mkdirp(FONT_ROOT_DIR)
    await fs.writeFile(dest, result.woff)
    await fs.writeFile(path.join(ROOT_DIR, 'media', 'css', 'icons.css'), template)

    await updatePackage(
        `./${relativeDest}`,
        icons.filter(i => i.data !== undefined).map(i => [i.name, i.data!])
    )
    await generateCloud9Icons(icons, path.join(ICONS_ROOT_DIR, 'cloud9', 'generated'))
}

generate().catch(error => {
    console.error('Failed to generate icons: %s', (error as Error).message)
})
