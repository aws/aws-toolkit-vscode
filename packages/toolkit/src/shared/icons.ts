/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from './extensionGlobals'

import type * as packageJson from '../../package.json'
import * as fs from 'fs'
import * as path from 'path'
import { Uri, ThemeIcon, ThemeColor } from 'vscode'
import { isCloud9 } from './extensionUtilities'
import { memoize } from './utilities/functionUtils'
import { getLogger } from './logger/logger'
import { isInBrowser } from '../common/browserUtils'

// Animation:
// https://code.visualstudio.com/api/references/icons-in-labels#animation

type ContributedIcon = keyof typeof packageJson.contributes.icons
type IconPath = { light: Uri; dark: Uri } | Icon
type IconId = `vscode-${string}` | ContributedIcon

/**
 * Gets an icon associated with the specified `id`.
 *
 * May return either {@link ThemeIcon} or URIs to icons. Callers should just pass the result directly
 * to any consuming APIs.
 *
 * Icons contributed by the extension are prefixed based off their location in the `icons` directory.
 *
 * For example, `aws-s3-bucket` refers to `bucket.svg` in `icons/aws/s3`. Note that while identifiers
 * may be derived from their source, that doesn't mean all valid identifiers have locations on disk.
 */
export const getIcon = memoize(resolveIconId)

/**
 * Convenient way to add icons provided by {@link getIcon} into a string.
 *
 * Invalid icons are simply omitted. This function also removes any leading
 * or trailing white space from the final result.
 *
 * #### Example:
 * ```ts
 * vscode.window.setStatusBarMessage(codicon`${getIcon('vscode-clippy')} Copied to clipboard`)
 * ```
 */
export function codicon(parts: TemplateStringsArray, ...components: (string | IconPath)[]): string {
    const canUse = (sub: string | IconPath) => typeof sub === 'string' || (!isCloud9() && sub instanceof Icon)
    const resolved = components.map(i => (canUse(i) ? i : '')).map(String)

    return parts
        .map((v, i) => `${v}${i < resolved.length ? resolved[i] : ''}`)
        .join('')
        .trim()
}

/**
 * See {@link ThemeIcon}.
 *
 * Used to expose the icon identifier which is otherwise hidden.
 */
export class Icon extends ThemeIcon {
    public constructor(id: string, public readonly source?: Uri, color?: ThemeColor) {
        super(id, color)
    }

    public override toString() {
        return `$(${this.id})`
    }
}

/**
 * Adds a new {@link ThemeColor} to an existing icon.
 *
 * You can find theme color identifiers
 * {@link https://code.visualstudio.com/api/references/contribution-points#contributes.colors here}
 */
export function addColor(icon: IconPath, color: string | ThemeColor): IconPath {
    if (isCloud9() || !(icon instanceof Icon)) {
        return icon
    }

    return new Icon(icon.id, icon.source, typeof color === 'string' ? new ThemeColor(color) : color)
}

function resolveIconId(
    id: IconId,
    shouldUseCloud9 = isCloud9(),
    iconsPath = globals.context.asAbsolutePath(path.join('resources', 'icons'))
): IconPath {
    const [namespace, ...rest] = id.split('-')
    const name = rest.join('-')

    // This 'override' logic is to support legacy use-cases, though ideally we wouldn't need it at all
    const cloud9Override = shouldUseCloud9 ? resolvePathsSync(path.join(iconsPath, 'cloud9'), id) : undefined
    const override = cloud9Override ?? resolvePathsSync(path.join(iconsPath, namespace), name)
    if (override) {
        getLogger().verbose(`icons: using override for "${id}"`)
        return override
    }

    // TODO: remove when they support codicons + the contribution point
    if (shouldUseCloud9) {
        const generated = resolvePathsSync(path.join(iconsPath, 'cloud9', 'generated'), id)

        if (generated) {
            return generated
        }
    }

    // TODO: potentially embed the icon source in `package.json` to avoid this messy mapping
    // of course, doing that implies we must always bundle both the original icon files and the font file
    const source = !['cloud9', 'vscode'].includes(namespace)
        ? Uri.joinPath(Uri.file(iconsPath), namespace, rest[0], `${rest.slice(1).join('-')}.svg`)
        : undefined

    return new Icon(namespace === 'vscode' ? name : id, source)
}

function resolvePathsSync(rootDir: string, target: string): { light: Uri; dark: Uri } | undefined {
    const darkPath = path.join(rootDir, 'dark', `${target}.svg`)
    const lightPath = path.join(rootDir, 'light', `${target}.svg`)

    try {
        if (!isInBrowser() && fs.existsSync(darkPath) && fs.existsSync(lightPath)) {
            return { dark: Uri.file(darkPath), light: Uri.file(lightPath) }
        }
    } catch (error) {
        getLogger().warn(`icons: path resolution failed for "${target}": %s`, error)
    }
}
