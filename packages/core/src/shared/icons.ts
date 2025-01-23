/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals, { isWeb } from './extensionGlobals'

import type * as packageJson from '../../package.json'
import * as fs from 'fs' // eslint-disable-line no-restricted-imports
import * as path from 'path'
import { Uri, ThemeIcon, ThemeColor } from 'vscode'
import { memoize } from './utilities/functionUtils'
import { getLogger } from './logger/logger'

// Animation:
// https://code.visualstudio.com/api/references/icons-in-labels#animation

type ContributedIcon = keyof typeof packageJson.contributes.icons
export type IconPath = { light: Uri; dark: Uri; toString: () => string } | Icon
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
    const canUse = (sub: string | IconPath) => typeof sub === 'string' || sub instanceof Icon
    const resolved = components.map((i) => (canUse(i) ? i : '')).map(String)

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
    public constructor(
        id: string,
        public readonly source?: Uri,
        color?: ThemeColor
    ) {
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
    if (!(icon instanceof Icon)) {
        return icon
    }

    return new Icon(icon.id, icon.source, typeof color === 'string' ? new ThemeColor(color) : color)
}

function resolveIconId(
    id: IconId,
    iconsPath = globals.context.asAbsolutePath(path.join('resources', 'icons'))
): IconPath {
    const [namespace, ...rest] = id.split('-')
    const name = rest.join('-')

    const override = resolvePathsSync(path.join(iconsPath, namespace), name)
    if (override) {
        getLogger().verbose(`icons: using override for "${id}"`)
        return override
    }

    // TODO: potentially embed the icon source in `package.json` to avoid this messy mapping
    // of course, doing that implies we must always bundle both the original icon files and the font file
    const source = !['vscode'].includes(namespace)
        ? Uri.joinPath(Uri.file(iconsPath), namespace, rest[0], `${rest.slice(1).join('-')}.svg`)
        : undefined

    return new Icon(namespace === 'vscode' ? name : id, source)
}

function resolvePathsSync(
    rootDir: string,
    target: string
): { light: Uri; dark: Uri; toString: () => string } | undefined {
    const filename = `${target}.svg`
    const darkPath = path.join(rootDir, 'dark', filename)
    const lightPath = path.join(rootDir, 'light', filename)

    try {
        if (!isWeb() && fs.existsSync(darkPath) && fs.existsSync(lightPath)) {
            return { dark: Uri.file(darkPath), light: Uri.file(lightPath), toString: () => filename }
        }
    } catch (error) {
        getLogger().warn(`icons: path resolution failed for "${target}": %s`, error)
    }
}
