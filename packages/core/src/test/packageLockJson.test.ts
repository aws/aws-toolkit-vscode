/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as semver from 'semver'
import * as path from 'path'
import { fs } from '../shared'

/**
 * Validates the root workspace package-lock.json, in particular that it is well-formed
 * and stays consistent with the devDependency version bumps made in this change:
 *   - @typescript-eslint/eslint-plugin & @typescript-eslint/parser -> ^8.56.1 (resolved 8.62.1)
 *   - eslint-plugin-unicorn -> ^55.0.0
 *   - webpack-dev-server -> ^5.2.6
 */
describe('root package-lock.json', function () {
    let lockFileText: string
    let rootPackageJson: {
        devDependencies: Record<string, string>
    }

    before(async function () {
        const lockFilePath = path.resolve(__dirname, '../../../../package-lock.json')
        lockFileText = await fs.readFileText(lockFilePath)

        const rootPackageJsonPath = path.resolve(__dirname, '../../../../package.json')
        rootPackageJson = JSON.parse(await fs.readFileText(rootPackageJsonPath))
    })

    it('is valid, parseable JSON', function () {
        assert.doesNotThrow(() => JSON.parse(lockFileText), /* message */ 'package-lock.json is not valid JSON')
    })

    describe('once parsed', function () {
        let lockJson: {
            lockfileVersion: number
            packages: Record<
                string,
                {
                    version?: string
                    devDependencies?: Record<string, string>
                }
            >
        }

        before(function () {
            lockJson = JSON.parse(lockFileText)
        })

        it('declares a lockfileVersion', function () {
            assert.strictEqual(lockJson.lockfileVersion, 3)
        })

        it('keeps the root package entry devDependency ranges in sync with package.json', function () {
            const rootEntry = lockJson.packages['']
            assert.ok(rootEntry, 'expected a root ("") entry under "packages"')
            const namesToCheck = [
                '@typescript-eslint/eslint-plugin',
                '@typescript-eslint/parser',
                'eslint-plugin-unicorn',
                'webpack-dev-server',
            ]
            for (const name of namesToCheck) {
                assert.strictEqual(
                    rootEntry.devDependencies?.[name],
                    rootPackageJson.devDependencies[name],
                    `expected root lockfile entry for ${name} to match package.json`
                )
            }
        })

        describe('bumped dependency resolutions', function () {
            const expectedResolutions: Record<string, string> = {
                'node_modules/@typescript-eslint/eslint-plugin': '@typescript-eslint/eslint-plugin',
                'node_modules/@typescript-eslint/parser': '@typescript-eslint/parser',
                'node_modules/eslint-plugin-unicorn': 'eslint-plugin-unicorn',
                'node_modules/webpack-dev-server': 'webpack-dev-server',
            }

            for (const [nodeModulesKey, packageName] of Object.entries(expectedResolutions)) {
                it(`resolves ${packageName} to a version satisfying the declared range`, function () {
                    const entry = lockJson.packages[nodeModulesKey]
                    assert.ok(entry, `expected a "${nodeModulesKey}" entry under "packages"`)
                    assert.ok(entry.version, `expected "${nodeModulesKey}" to declare a resolved version`)

                    const declaredRange = rootPackageJson.devDependencies[packageName]
                    assert.ok(declaredRange, `expected package.json to declare a range for ${packageName}`)
                    assert.ok(
                        semver.satisfies(entry.version!, declaredRange),
                        `expected resolved ${packageName}@${entry.version} to satisfy declared range ${declaredRange}`
                    )
                })
            }

            it('keeps @typescript-eslint/eslint-plugin and @typescript-eslint/parser on the same resolved version', function () {
                const pluginVersion = lockJson.packages['node_modules/@typescript-eslint/eslint-plugin']?.version
                const parserVersion = lockJson.packages['node_modules/@typescript-eslint/parser']?.version
                assert.ok(pluginVersion, 'expected @typescript-eslint/eslint-plugin to have a resolved version')
                assert.ok(parserVersion, 'expected @typescript-eslint/parser to have a resolved version')
                assert.strictEqual(pluginVersion, parserVersion)
            })
        })

        it('does not retain a stale nested @typescript-eslint duplicate under @stylistic/eslint-plugin', function () {
            // The pre-bump lockfile had @typescript-eslint/* v7 as a top-level resolution, so
            // @stylistic/eslint-plugin (which requires ^8.x) needed its own nested copies of
            // @typescript-eslint/scope-manager, types, typescript-estree, utils and
            // visitor-keys. After bumping the top-level @typescript-eslint packages to ^8.x,
            // those nested duplicates should have been deduped away.
            const staleNestedKeys = Object.keys(lockJson.packages).filter((key) =>
                key.startsWith('node_modules/@stylistic/eslint-plugin/node_modules/@typescript-eslint/')
            )
            assert.deepStrictEqual(staleNestedKeys, [])
        })

        it('no longer depends on graphemer now that @typescript-eslint/eslint-plugin is on v8', function () {
            // @typescript-eslint/eslint-plugin@7.x depended on "graphemer" for string-width
            // handling; that dependency was dropped in the 8.x line, so the lockfile should no
            // longer contain a "graphemer" package entry.
            assert.strictEqual(lockJson.packages['node_modules/graphemer'], undefined)
        })
    })
})